package dockerapi

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestClientTargetsConfiguredContainer(t *testing.T) {
	t.Parallel()
	requested := make(chan string, 3)
	client, err := New("http://docker-proxy:2375", "minecraft")
	if err != nil {
		t.Fatal(err)
	}
	client.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requested <- r.Method + " " + r.URL.RequestURI()
		status := http.StatusOK
		body := ""
		switch r.URL.Path {
		case "/containers/minecraft/json":
			body = `{"Config":{"Image":"paper:latest"},"State":{"Status":"running","Running":true,"StartedAt":"2026-01-01T00:00:00Z"}}`
		case "/containers/minecraft/stats":
			body = `{"cpu_stats":{"cpu_usage":{"total_usage":200},"system_cpu_usage":1000,"online_cpus":2},"precpu_stats":{"cpu_usage":{"total_usage":100},"system_cpu_usage":500},"memory_stats":{"usage":1000,"limit":4000,"stats":{"cache":100}}}`
		default:
			status = http.StatusNoContent
		}
		return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	state, err := client.Inspect(context.Background())
	if err != nil || !state.Running || state.Image != "paper:latest" {
		t.Fatalf("Inspect() = %+v, %v", state, err)
	}
	metrics, err := client.Stats(context.Background())
	if err != nil || metrics.MemoryUsageBytes != 900 || metrics.CPUPercent != 40 {
		t.Fatalf("Stats() = %+v, %v", metrics, err)
	}
	if err := client.Action(context.Background(), "restart"); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"GET /containers/minecraft/json",
		"GET /containers/minecraft/stats?stream=false&one-shot=true",
		"POST /containers/minecraft/restart?t=30",
	}
	for _, expected := range want {
		if got := <-requested; got != expected {
			t.Fatalf("request = %q, want %q", got, expected)
		}
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestClientRejectsUnsupportedAction(t *testing.T) {
	t.Parallel()
	client, err := New("http://docker-proxy:2375", "minecraft")
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Action(context.Background(), "delete"); err == nil {
		t.Fatal("expected unsupported action to fail")
	}
}

func TestClientGivenASlowDockerActionWhenTheReadTimeoutExpiresThenTheActionCompletes(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(25 * time.Millisecond)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	client, err := New(server.URL, "minecraft")
	if err != nil {
		t.Fatal(err)
	}
	client.httpClient.Timeout = 10 * time.Millisecond

	if err := client.Action(context.Background(), "stop"); err != nil {
		t.Fatal(err)
	}
}

func TestStatsDoesNotUnderflowDecreasingCounters(t *testing.T) {
	t.Parallel()
	client, err := New("http://docker-proxy:2375", "minecraft")
	if err != nil {
		t.Fatal(err)
	}
	client.httpClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		body := `{"cpu_stats":{"cpu_usage":{"total_usage":10},"system_cpu_usage":20,"online_cpus":2},"precpu_stats":{"cpu_usage":{"total_usage":100},"system_cpu_usage":200},"memory_stats":{"usage":1000,"limit":4000,"stats":{"cache":0}}}`
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	metrics, err := client.Stats(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if metrics.CPUPercent != 0 {
		t.Fatalf("CPUPercent = %v, want 0 for decreasing counters", metrics.CPUPercent)
	}
}
