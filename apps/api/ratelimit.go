package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// guard limits failed registration-code attempts. Each client IP gets maxPerIP failures per window before
// it is locked out for the rest of the window, and a global ceiling covers distributed guessing.
type guard struct {
	mu        sync.Mutex
	window    time.Duration
	maxPerIP  int
	maxGlobal int
	ips       map[string]*bucket
	global    bucket
}

type bucket struct {
	fails int
	reset time.Time
}

func newGuard(window time.Duration, maxPerIP, maxGlobal int) *guard {
	return &guard{window: window, maxPerIP: maxPerIP, maxGlobal: maxGlobal, ips: map[string]*bucket{}}
}

// allowed reports whether ip may try a code now; if not, how long until it can.
func (g *guard) allowed(ip string) (bool, time.Duration) {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	g.sweep(now)
	if g.global.fails >= g.maxGlobal && now.Before(g.global.reset) {
		return false, g.global.reset.Sub(now)
	}
	if b := g.ips[ip]; b != nil && b.fails >= g.maxPerIP && now.Before(b.reset) {
		return false, b.reset.Sub(now)
	}
	return true, 0
}

func (g *guard) fail(ip string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := time.Now()
	b := g.ips[ip]
	if b == nil || !now.Before(b.reset) {
		b = &bucket{reset: now.Add(g.window)}
		g.ips[ip] = b
	}
	b.fails++
	if !now.Before(g.global.reset) {
		g.global = bucket{reset: now.Add(g.window)}
	}
	g.global.fails++
}

func (g *guard) sweep(now time.Time) {
	if len(g.ips) < 1024 {
		return
	}
	for k, b := range g.ips {
		if !now.Before(b.reset) {
			delete(g.ips, k)
		}
	}
}

// clientIP returns the caller's address. hops is the number of trusted reverse proxies in front of
// the API; X-Forwarded-For is only believed when hops > 0, and only for the entries those proxies added.
func clientIP(r *http.Request, hops int) string {
	remote, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remote = r.RemoteAddr
	}
	if hops <= 0 {
		return remote
	}
	var chain []string
	for _, p := range strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",") {
		if p = strings.TrimSpace(p); p != "" {
			chain = append(chain, p)
		}
	}
	chain = append(chain, remote)
	idx := len(chain) - 1 - hops
	if idx < 0 {
		return remote
	}
	return chain[idx]
}
