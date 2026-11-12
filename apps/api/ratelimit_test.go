package main

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestGuardLocksOutIP(t *testing.T) {
	g := newGuard(time.Minute, 3, 100)
	for i := 0; i < 3; i++ {
		if ok, _ := g.allowed("1.1.1.1"); !ok {
			t.Fatalf("locked early at %d", i)
		}
		g.fail("1.1.1.1")
	}
	if ok, _ := g.allowed("1.1.1.1"); ok {
		t.Fatal("expected lockout")
	}
	if ok, _ := g.allowed("2.2.2.2"); !ok {
		t.Fatal("other IP should be unaffected")
	}
}

func TestGuardGlobalCeiling(t *testing.T) {
	g := newGuard(time.Minute, 100, 3)
	for _, ip := range []string{"a", "b", "c"} {
		g.fail(ip)
	}
	if ok, _ := g.allowed("d"); ok {
		t.Fatal("expected global lockout")
	}
}

func TestClientIP(t *testing.T) {
	r := httptest.NewRequest("POST", "/", nil)
	r.RemoteAddr = "10.0.0.3:5555"
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 9.9.9.9, 10.0.0.2") // first entry is client-supplied spoof
	if got := clientIP(r, 0); got != "10.0.0.3" {
		t.Fatalf("hops=0: %s", got)
	}
	if got := clientIP(r, 2); got != "9.9.9.9" {
		t.Fatalf("hops=2: %s", got)
	}
}
