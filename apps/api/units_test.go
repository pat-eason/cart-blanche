package main

import (
	"math"
	"strings"
	"testing"
)

func TestConvertQty(t *testing.T) {
	cases := []struct {
		q        float64
		from, to string
		want     float64
		ok       bool
	}{
		{3, "tsp", "tbsp", 1, true},
		{2, "cup", "tbsp", 32, true},
		{1, "lb", "oz", 16, true},
		{1, "tbsp", "tbsp", 1, true},
		{2, "pc", "pc", 2, true},
		{1, "cup", "lb", 1, false},
		{1, "pc", "cup", 1, false},
	}
	for _, c := range cases {
		got, ok := convertQty(c.q, c.from, c.to)
		if ok != c.ok || math.Abs(got-c.want) > 0.05 {
			t.Errorf("convertQty(%v,%s,%s)=%v,%v want %v,%v", c.q, c.from, c.to, got, ok, c.want, c.ok)
		}
	}
}

func TestQtySQLHasNoPlaceholders(t *testing.T) {
	if strings.Contains(qtyInIngredientUnit(), "?") {
		t.Fatal("expression must not contain ? (rebind would corrupt it)")
	}
}
