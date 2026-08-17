package dockerapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var ErrUnavailable = errors.New("Docker integration is unavailable")

var safeContainerName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)

type Client struct {
	baseURL    *url.URL
	httpClient *http.Client
	container  string
}

type ContainerState struct {
	Status     string    `json:"status"`
	Running    bool      `json:"running"`
	StartedAt  time.Time `json:"startedAt"`
	Image      string    `json:"image"`
	StatusText string    `json:"statusText"`
}

type Metrics struct {
	CPUPercent       float64 `json:"cpuPercent"`
	MemoryUsageBytes uint64  `json:"memoryUsageBytes"`
	MemoryLimitBytes uint64  `json:"memoryLimitBytes"`
}

func New(baseURL, container string) (*Client, error) {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
		return nil, errors.New("Docker URL must be an http(s) URL without credentials")
	}
	if !safeContainerName.MatchString(container) {
		return nil, errors.New("Docker container name contains unsupported characters")
	}
	return &Client{
		baseURL: parsed,
		httpClient: &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("Docker API redirects are disabled")
		}},
		container: container,
	}, nil
}

func NewUnix(socketPath, container string) (*Client, error) {
	if !filepath.IsAbs(socketPath) {
		return nil, errors.New("Docker socket path must be absolute")
	}
	client, err := New("http://docker-engine", container)
	if err != nil {
		return nil, err
	}
	dialer := net.Dialer{Timeout: 3 * time.Second}
	client.httpClient.Transport = &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, "unix", socketPath)
		},
		ResponseHeaderTimeout: 10 * time.Second,
		IdleConnTimeout:       30 * time.Second,
		MaxIdleConns:          2,
	}
	return client, nil
}

func (c *Client) Inspect(ctx context.Context) (ContainerState, error) {
	var response struct {
		Config struct {
			Image string `json:"Image"`
		} `json:"Config"`
		State struct {
			Status     string `json:"Status"`
			Running    bool   `json:"Running"`
			StartedAt  string `json:"StartedAt"`
			StatusText string `json:"Error"`
		} `json:"State"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/containers/"+c.container+"/json", &response); err != nil {
		return ContainerState{}, err
	}
	started, _ := time.Parse(time.RFC3339Nano, response.State.StartedAt)
	return ContainerState{Status: response.State.Status, Running: response.State.Running, StartedAt: started, Image: response.Config.Image, StatusText: response.State.StatusText}, nil
}

func (c *Client) Stats(ctx context.Context) (Metrics, error) {
	var response struct {
		CPUStats struct {
			CPUUsage struct {
				TotalUsage uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
			OnlineCPUs  uint32 `json:"online_cpus"`
		} `json:"cpu_stats"`
		PreCPUStats struct {
			CPUUsage struct {
				TotalUsage uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
		} `json:"precpu_stats"`
		MemoryStats struct {
			Usage uint64 `json:"usage"`
			Limit uint64 `json:"limit"`
			Stats struct {
				Cache uint64 `json:"cache"`
			} `json:"stats"`
		} `json:"memory_stats"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/containers/"+c.container+"/stats?stream=false&one-shot=true", &response); err != nil {
		return Metrics{}, err
	}
	var cpuDelta, systemDelta uint64
	if response.CPUStats.CPUUsage.TotalUsage >= response.PreCPUStats.CPUUsage.TotalUsage {
		cpuDelta = response.CPUStats.CPUUsage.TotalUsage - response.PreCPUStats.CPUUsage.TotalUsage
	}
	if response.CPUStats.SystemUsage >= response.PreCPUStats.SystemUsage {
		systemDelta = response.CPUStats.SystemUsage - response.PreCPUStats.SystemUsage
	}
	cores := response.CPUStats.OnlineCPUs
	if cores == 0 {
		cores = 1
	}
	var cpuPercent float64
	if systemDelta > 0 {
		cpuPercent = (float64(cpuDelta) / float64(systemDelta)) * float64(cores) * 100
	}
	memoryUsage := response.MemoryStats.Usage
	if response.MemoryStats.Stats.Cache < memoryUsage {
		memoryUsage -= response.MemoryStats.Stats.Cache
	}
	return Metrics{CPUPercent: cpuPercent, MemoryUsageBytes: memoryUsage, MemoryLimitBytes: response.MemoryStats.Limit}, nil
}

func (c *Client) Action(ctx context.Context, action string) error {
	var path string
	switch action {
	case "start":
		path = "/containers/" + c.container + "/start"
	case "stop":
		path = "/containers/" + c.container + "/stop?t=30"
	case "restart":
		path = "/containers/" + c.container + "/restart?t=30"
	default:
		return errors.New("unsupported container action")
	}
	request, err := c.request(ctx, http.MethodPost, path, nil)
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer response.Body.Close()
	if _, err := io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10)); err != nil {
		return fmt.Errorf("read Docker response: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("Docker action returned status %d", response.StatusCode)
	}
	return nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, destination any) error {
	request, err := c.request(ctx, method, path, nil)
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
		return fmt.Errorf("Docker API returned status %d", response.StatusCode)
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 4<<20))
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("decode Docker response: %w", err)
	}
	return nil
}

func (c *Client) request(ctx context.Context, method, path string, body []byte) (*http.Request, error) {
	endpoint := *c.baseURL
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + strings.SplitN(path, "?", 2)[0]
	if queryIndex := strings.IndexByte(path, '?'); queryIndex >= 0 {
		endpoint.RawQuery = path[queryIndex+1:]
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint.String(), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create Docker request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	return request, nil
}
