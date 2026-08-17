package console

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Line struct {
	Sequence  uint64    `json:"sequence"`
	Timestamp time.Time `json:"timestamp"`
	Text      string    `json:"text"`
}

type Hub struct {
	path        string
	capacity    int
	mu          sync.RWMutex
	lines       []Line
	next        uint64
	subscribers map[chan Line]struct{}
}

func New(logPath string, capacity int) *Hub {
	if capacity < 100 {
		capacity = 100
	}
	return &Hub{path: filepath.Clean(logPath), capacity: capacity, lines: make([]Line, 0, capacity), subscribers: make(map[chan Line]struct{})}
}

func (h *Hub) Run(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	var offset int64 = -1
	for {
		select {
		case <-ctx.Done():
			h.closeSubscribers()
			return
		case <-ticker.C:
			var err error
			offset, err = h.readAvailable(offset)
			_ = err // Missing or unreadable logs remain an honest empty source, not synthetic console output.
		}
	}
}

func (h *Hub) History(limit int) []Line {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if limit < 1 || limit > len(h.lines) {
		limit = len(h.lines)
	}
	start := len(h.lines) - limit
	result := make([]Line, limit)
	copy(result, h.lines[start:])
	return result
}

func (h *Hub) Subscribe() (<-chan Line, func()) {
	channel := make(chan Line, 128)
	h.mu.Lock()
	h.subscribers[channel] = struct{}{}
	h.mu.Unlock()
	var once sync.Once
	cancel := func() {
		once.Do(func() {
			h.mu.Lock()
			if _, exists := h.subscribers[channel]; exists {
				delete(h.subscribers, channel)
				close(channel)
			}
			h.mu.Unlock()
		})
	}
	return channel, cancel
}

func (h *Hub) RecentWarnings(limit int) []Line {
	all := h.History(h.capacity)
	warnings := make([]Line, 0, limit)
	for index := len(all) - 1; index >= 0 && len(warnings) < limit; index-- {
		upper := strings.ToUpper(all[index].Text)
		if strings.Contains(upper, "[WARN]") || strings.Contains(upper, "[ERROR]") || strings.Contains(upper, "EXCEPTION") {
			warnings = append(warnings, all[index])
		}
	}
	for left, right := 0, len(warnings)-1; left < right; left, right = left+1, right-1 {
		warnings[left], warnings[right] = warnings[right], warnings[left]
	}
	return warnings
}

func (h *Hub) readAvailable(offset int64) (int64, error) {
	file, err := os.Open(h.path)
	if err != nil {
		return offset, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return offset, fmt.Errorf("stat console log: %w", err)
	}
	if offset < 0 {
		offset = info.Size() - 256*1024
		if offset < 0 {
			offset = 0
		}
	}
	if info.Size() < offset {
		offset = 0
	}
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return offset, fmt.Errorf("seek console log: %w", err)
	}
	reader := bufio.NewReaderSize(file, 64*1024)
	for {
		line, readErr := reader.ReadString('\n')
		offset += int64(len(line))
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				offset -= int64(len(line))
				return offset, nil
			}
			return offset, fmt.Errorf("read console log: %w", readErr)
		}
		h.publish(strings.TrimRight(line, "\r\n"))
	}
}

func (h *Hub) publish(text string) {
	text = stripANSI(text)
	if len(text) > 8192 {
		text = text[:8192] + "…"
	}
	line := Line{Timestamp: time.Now().UTC(), Text: text}
	h.mu.Lock()
	h.next++
	line.Sequence = h.next
	if len(h.lines) == h.capacity {
		copy(h.lines, h.lines[1:])
		h.lines[len(h.lines)-1] = line
	} else {
		h.lines = append(h.lines, line)
	}
	for subscriber := range h.subscribers {
		select {
		case subscriber <- line:
		default:
		}
	}
	h.mu.Unlock()
}

func (h *Hub) closeSubscribers() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for subscriber := range h.subscribers {
		delete(h.subscribers, subscriber)
		close(subscriber)
	}
}

func stripANSI(value string) string {
	var result strings.Builder
	result.Grow(len(value))
	for index := 0; index < len(value); index++ {
		if value[index] != 0x1b {
			if value[index] >= 0x20 || value[index] == '\t' {
				result.WriteByte(value[index])
			}
			continue
		}
		if index+1 < len(value) && value[index+1] == '[' {
			index += 2
			for index < len(value) {
				character := value[index]
				if character >= 0x40 && character <= 0x7e {
					break
				}
				index++
			}
		}
	}
	return result.String()
}
