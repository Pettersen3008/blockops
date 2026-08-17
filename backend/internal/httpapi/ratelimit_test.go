package httpapi

import (
	"testing"
	"time"
)

func TestLoginLimiterBoundsAndExpiresKeys(t *testing.T) {
	t.Parallel()
	limiter := &loginLimiter{attempts: make(map[string]attemptWindow), limit: 5, maxKeys: 2, window: time.Minute}
	now := time.Now()
	if allowed, _ := limiter.Allow("one", now); !allowed {
		t.Fatal("first key was unexpectedly denied")
	}
	if allowed, _ := limiter.Allow("two", now); !allowed {
		t.Fatal("second key was unexpectedly denied")
	}
	if allowed, _ := limiter.Allow("three", now); allowed {
		t.Fatal("limiter accepted a key beyond its memory bound")
	}
	if allowed, _ := limiter.Allow("three", now.Add(2*time.Minute)); !allowed {
		t.Fatal("expired keys were not reclaimed")
	}
}
