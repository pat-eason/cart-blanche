package main

import (
	"math/rand"
	"testing"
	"time"
)

func fp(f float64) *float64 { return &f }
func sp(s string) *string   { return &s }

func testRecipes() []*Recipe {
	return []*Recipe{
		{ID: "a", MealType: "dinner", Tags: []string{"quick"}, CookMinutes: 20, EstCost: fp(8)},
		{ID: "b", MealType: "dinner", Tags: []string{"slow"}, CookMinutes: 90, EstCost: fp(25)},
		{ID: "c", MealType: "lunch", CookMinutes: 10, EstCost: fp(4)},
		{ID: "d", MealType: "dinner", CookMinutes: 30, LastPlanned: sp(time.Now().AddDate(0, 0, -7).Format("2006-01-02")),
			Ingredients: []RecipeIngredient{{IngredientID: "ing1"}}},
	}
}

func ids(p []*Suggestion) map[string]bool {
	m := map[string]bool{}
	for _, s := range p {
		m[s.Recipe.ID] = true
	}
	return m
}

func TestPickMenuFilters(t *testing.T) {
	now := time.Now()
	rng := rand.New(rand.NewSource(1))
	rs := testRecipes()
	if got := ids(pickMenu(rs, nil, genOpts{Count: 9, MealType: "dinner"}, now, rng)); got["c"] || len(got) != 3 {
		t.Errorf("meal time filter: %v", got)
	}
	if got := ids(pickMenu(rs, nil, genOpts{Count: 9, MaxMinutes: 30}, now, rng)); got["b"] {
		t.Errorf("time filter: %v", got)
	}
	if got := ids(pickMenu(rs, nil, genOpts{Count: 9, MinWeeksSince: 3}, now, rng)); got["d"] {
		t.Errorf("recency filter: %v", got)
	}
	if got := ids(pickMenu(rs, nil, genOpts{Count: 9, WantIngs: map[string]bool{"ing1": true}}, now, rng)); len(got) != 1 || !got["d"] {
		t.Errorf("want ingredient: %v", got)
	}
	if got := ids(pickMenu(rs, nil, genOpts{Count: 9, SkipIngs: map[string]bool{"ing1": true}}, now, rng)); got["d"] {
		t.Errorf("skip ingredient: %v", got)
	}
	if got := ids(pickMenu(rs, nil, genOpts{Count: 9, MaxMealCost: 10}, now, rng)); got["b"] {
		t.Errorf("meal cost: %v", got)
	}
	if got := pickMenu(rs, nil, genOpts{Count: 9, MealType: "dinner", MaxTotalCost: 20}, now, rng); func() float64 {
		var sum float64
		for _, s := range got {
			if s.Recipe.EstCost != nil {
				sum += *s.Recipe.EstCost
			}
		}
		return sum
	}() > 20 {
		t.Errorf("total budget exceeded")
	}
}

func TestAssignDays(t *testing.T) {
	picked := []*Suggestion{{Recipe: &Recipe{CookMinutes: 90}}, {Recipe: &Recipe{CookMinutes: 10}}}
	days := assignDays(picked, map[int]bool{0: true})
	if *days[1] != 1 || *days[0] != 2 {
		t.Errorf("got %d %d", *days[1], *days[0])
	}
}
