package httpapi

import (
	"sync"
	"time"
)

type attemptWindow struct {
	started time.Time
	count   int
}

type loginLimiter struct {
	mu       sync.Mutex
	attempts map[string]attemptWindow
	limit    int
	maxKeys  int
	window   time.Duration
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{attempts: make(map[string]attemptWindow), limit: 5, maxKeys: 10_000, window: 15 * time.Minute}
}

func (l *loginLimiter) Allow(key string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	entry, exists := l.attempts[key]
	if !exists && len(l.attempts) >= l.maxKeys {
		for candidate, attempt := range l.attempts {
			if now.Sub(attempt.started) >= l.window {
				delete(l.attempts, candidate)
			}
		}
		if len(l.attempts) >= l.maxKeys {
			return false, l.window
		}
	}
	if !exists || now.Sub(entry.started) >= l.window {
		l.attempts[key] = attemptWindow{started: now, count: 1}
		return true, 0
	}
	if entry.count >= l.limit {
		return false, l.window - now.Sub(entry.started)
	}
	entry.count++
	l.attempts[key] = entry
	return true, 0
}

func (l *loginLimiter) Reset(key string) {
	l.mu.Lock()
	delete(l.attempts, key)
	l.mu.Unlock()
}
