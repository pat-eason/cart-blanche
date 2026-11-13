package main

import (
	"math/rand"
	"net/http"
	"sort"
	"time"
)

// genOpts are the filters for auto-generating a menu.
type genOpts struct {
	Count         int
	MealType      string          // single meal time for pickMenu; "" or "any" = all
	Include       []string        // tags: recipe must have at least one
	Exclude       []string        // tags: recipe must have none
	MaxMinutes    int             // prep+cook; 0 = any
	MinWeeksSince float64         // skip recipes planned more recently than this; 0 = any
	MaxMealCost   float64         // per-meal estimated cost; 0 = any (unpriced meals always pass)
	MaxTotalCost  float64         // cap for the whole week incl. Spent; 0 = none
	Spent         float64         // cost already committed by meals being kept
	WantIngs      map[string]bool // recipe must use at least one of these ingredients
	SkipIngs      map[string]bool // recipe must use none of these ingredients
	Taken         map[string]bool // recipe ids to leave out (already on the menu)
}

func (o genOpts) allows(rc *Recipe, now time.Time) bool {
	if o.Taken[rc.ID] {
		return false
	}
	if o.MealType != "" && o.MealType != "any" && rc.MealType != o.MealType {
		return false
	}
	if len(o.Include) > 0 && !hasAny(rc.Tags, o.Include) {
		return false
	}
	if len(o.Exclude) > 0 && hasAny(rc.Tags, o.Exclude) {
		return false
	}
	if o.MaxMinutes > 0 && rc.PrepMinutes+rc.CookMinutes > o.MaxMinutes {
		return false
	}
	if o.MinWeeksSince > 0 && rc.LastPlanned != nil {
		if t, err := time.Parse("2006-01-02", *rc.LastPlanned); err == nil && now.Sub(t).Hours()/24/7 < o.MinWeeksSince {
			return false
		}
	}
	if o.MaxMealCost > 0 && rc.EstCost != nil && *rc.EstCost > o.MaxMealCost {
		return false
	}
	if len(o.WantIngs) > 0 || len(o.SkipIngs) > 0 {
		uses := false
		for _, ri := range rc.Ingredients {
			if o.SkipIngs[ri.IngredientID] {
				return false
			}
			if o.WantIngs[ri.IngredientID] {
				uses = true
			}
		}
		if len(o.WantIngs) > 0 && !uses {
			return false
		}
	}
	return true
}

// pickMenu chooses up to o.Count recipes: habit-scored, varied by tag, within the weekly cost cap.
func pickMenu(recipes []*Recipe, lastStatus map[string]string, o genOpts, now time.Time, rng *rand.Rand) []*Suggestion {
	cands := []*Suggestion{}
	for _, rc := range recipes {
		if rc.Avoid || !o.allows(rc, now) {
			continue
		}
		score, reasons := scoreRecipe(rc, lastStatus[rc.ID], now)
		cands = append(cands, &Suggestion{Recipe: rc, Score: score + rng.Float64()*0.8, Reasons: reasons})
	}
	picked := []*Suggestion{}
	tagSeen := map[string]int{}
	spent := o.Spent
	for len(picked) < o.Count && len(cands) > 0 {
		best, bi := -1e9, -1
		for i, c := range cands {
			if o.MaxTotalCost > 0 && c.Recipe.EstCost != nil && spent+*c.Recipe.EstCost > o.MaxTotalCost {
				continue
			}
			sc := c.Score
			for _, t := range c.Recipe.Tags {
				sc -= 0.35 * float64(tagSeen[t])
			}
			if sc > best {
				best, bi = sc, i
			}
		}
		if bi < 0 {
			break // nothing else fits the budget
		}
		c := cands[bi]
		cands = append(cands[:bi], cands[bi+1:]...)
		c.Score = best
		for _, t := range c.Recipe.Tags {
			tagSeen[t]++
		}
		if c.Recipe.EstCost != nil {
			spent += *c.Recipe.EstCost
		}
		if len(c.Reasons) == 0 {
			c.Reasons = append(c.Reasons, "Fits your filters")
		}
		picked = append(picked, c)
	}
	return picked
}

// assignDays gives each picked recipe a free day (0=Mon..6=Sun), putting the longest cooks on the
// latest free days (weekend). Extras beyond the free days get nil (any day).
func assignDays(picked []*Suggestion, used map[int]bool) []*int {
	free := []int{}
	for d := 0; d < 7; d++ {
		if !used[d] {
			free = append(free, d)
		}
	}
	order := make([]int, len(picked))
	for i := range order {
		order[i] = i
	}
	mins := func(i int) int { return picked[i].Recipe.PrepMinutes + picked[i].Recipe.CookMinutes }
	sort.SliceStable(order, func(a, b int) bool { return mins(order[a]) < mins(order[b]) })
	days := make([]*int, len(picked))
	// pick which free days are used: spread across the week, keeping the later ones for longer meals
	n := len(picked)
	if n > len(free) {
		n = len(free)
	}
	for k := 0; k < n; k++ {
		d := free[k]
		days[order[k]] = &d
	}
	return days
}

type generateInput struct {
	Count         int      `json:"count"`     // meals per selected meal time
	MealTypes     []string `json:"mealTypes"` // breakfast/lunch/dinner/...; empty = dinner
	Include       []string `json:"include"`
	Exclude       []string `json:"exclude"`
	MaxMinutes    int      `json:"maxMinutes"`
	MinWeeksSince float64  `json:"minWeeksSince"`
	MaxMealCost   float64  `json:"maxMealCost"`
	MaxTotalCost  float64  `json:"maxTotalCost"`
	WantIngs      []string `json:"includeIngredients"`
	SkipIngs      []string `json:"excludeIngredients"`
	Replace       bool     `json:"replace"`
}

func validMealType(t string) bool {
	switch t {
	case "breakfast", "lunch", "dinner", "snack", "dessert":
		return true
	}
	return false
}

func uuidSet(in []string) map[string]bool {
	m := map[string]bool{}
	for _, p := range in {
		if id, ok := parseUUID(p); ok {
			m[id] = true
		}
	}
	return m
}

// generateMenu fills a menu with meals chosen from the recipe box. With replace=false it keeps
// existing meals and tops the week up to `count` meals total.
func (s *server) generateMenu(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	var in generateInput
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if in.Count < 1 || in.Count > 7 {
		return nil, errBad("count must be 1-7")
	}
	if in.MaxMinutes < 0 || in.MinWeeksSince < 0 || in.MaxMealCost < 0 || in.MaxTotalCost < 0 {
		return nil, errBad("filters can't be negative")
	}
	menu, err := s.loadMenu(u.HouseholdID, id)
	if err != nil {
		return nil, errNotFound
	}

	recipes, err := s.loadRecipes(u.HouseholdID, "AND r.avoid=0")
	if err != nil {
		return nil, err
	}
	// "Recently planned" is judged by other weeks, so this menu's own meals don't count against a recipe.
	lastPlanned := map[string]string{}
	lastStatus := map[string]string{}
	rows, err := s.db.Query(`SELECT mm.recipe_id, m.week_start, mm.status FROM menu_meals mm JOIN menus m ON m.id=mm.menu_id
		WHERE m.household_id=? AND m.id<>? ORDER BY m.week_start ASC, mm.id ASC`, u.HouseholdID, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var rid, ws, st string
		_ = rows.Scan(&rid, &ws, &st)
		lastPlanned[rid] = ws
		lastStatus[rid] = st
	}
	rows.Close()
	for _, rc := range recipes {
		if ws, ok := lastPlanned[rc.ID]; ok {
			rc.LastPlanned = &ws
		} else {
			rc.LastPlanned = nil
		}
	}

	types := []string{}
	for _, t := range normalizeTags(in.MealTypes) {
		if !validMealType(t) {
			return nil, errBad("unknown meal time: " + t)
		}
		types = append(types, t)
	}
	if len(types) == 0 {
		types = []string{"dinner"}
	}

	base := genOpts{
		Include: normalizeTags(in.Include), Exclude: normalizeTags(in.Exclude),
		MaxMinutes: in.MaxMinutes, MinWeeksSince: in.MinWeeksSince, MaxMealCost: in.MaxMealCost,
		MaxTotalCost: in.MaxTotalCost, WantIngs: uuidSet(in.WantIngs), SkipIngs: uuidSet(in.SkipIngs), Taken: map[string]bool{},
	}
	usedDays := map[string]map[int]bool{} // slot -> days taken
	kept := map[string]int{}
	if !in.Replace {
		for _, m := range menu.Meals {
			base.Taken[m.RecipeID] = true
			if usedDays[m.Slot] == nil {
				usedDays[m.Slot] = map[int]bool{}
			}
			if m.Day != nil {
				usedDays[m.Slot][*m.Day] = true
			}
			kept[m.Slot]++
			if m.EstCost != nil {
				base.Spent += *m.EstCost
			}
		}
	}
	type placed struct {
		sg   *Suggestion
		day  *int
		slot string
	}
	var all []placed
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	now := time.Now()
	for _, t := range types {
		o := base
		o.MealType = t
		o.Count = in.Count - kept[t]
		if o.Count <= 0 {
			continue
		}
		picked := pickMenu(recipes, lastStatus, o, now, rng)
		days := assignDays(picked, usedDays[t])
		for i, p := range picked {
			base.Taken[p.Recipe.ID] = true
			if p.Recipe.EstCost != nil {
				base.Spent += *p.Recipe.EstCost
			}
			all = append(all, placed{p, days[i], t})
		}
	}
	if len(all) == 0 {
		if !in.Replace {
			return menu, nil
		}
		return nil, apiErr{http.StatusUnprocessableEntity, "No recipes match those filters. Try loosening them."}
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if in.Replace {
		if _, err := tx.Exec(`DELETE FROM menu_meals WHERE menu_id=?`, id); err != nil {
			return nil, err
		}
	}
	for _, p := range all {
		if _, err := tx.Exec(`INSERT INTO menu_meals(menu_id,recipe_id,day,slot) VALUES(?,?,?,?)`, id, p.sg.Recipe.ID, p.day, p.slot); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.loadMenu(u.HouseholdID, id)
}
