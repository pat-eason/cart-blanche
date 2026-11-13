package main

import (
	"math"
	"math/rand"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Suggestion struct {
	Recipe  *Recipe  `json:"recipe"`
	Score   float64  `json:"score"`
	Reasons []string `json:"reasons"`
}

func splitCSV(s string) []string {
	out := []string{}
	for _, p := range strings.Split(s, ",") {
		if p = strings.ToLower(strings.TrimSpace(p)); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func hasAny(have []string, want []string) bool {
	for _, w := range want {
		for _, h := range have {
			if h == w {
				return true
			}
		}
	}
	return false
}

// recommendations ranks recipes by household habits:
//   - things you love (often cooked) rise
//   - things you haven't had in a while / ever rise, things from the last two weeks sink
//   - things you planned but skipped last time get a nudge
//   - "never again" recipes are excluded entirely
//   - a variety penalty keeps the picks from all sharing the same tags
func (s *server) recommendations(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	q := r.URL.Query()
	count := 6
	if n, err := strconv.Atoi(q.Get("count")); err == nil && n > 0 && n <= 20 {
		count = n
	}
	mealType := q.Get("mealType")
	include := splitCSV(q.Get("include"))
	exclude := splitCSV(q.Get("exclude"))
	skipIngs := map[string]bool{}
	for _, p := range splitCSV(q.Get("excludeIngredients")) {
		if id, ok := parseUUID(p); ok {
			skipIngs[id] = true
		}
	}
	skipIDs := map[string]bool{}
	for _, p := range splitCSV(q.Get("skip")) {
		if id, ok := parseUUID(p); ok {
			skipIDs[id] = true
		}
	}
	maxMinutes, _ := strconv.Atoi(q.Get("maxMinutes"))

	recipes, err := s.loadRecipes(u.HouseholdID, "AND r.avoid=0")
	if err != nil {
		return nil, err
	}

	lastStatus := map[string]string{}
	rows, err := s.db.Query(`SELECT mm.recipe_id, mm.status FROM menu_meals mm JOIN menus m ON m.id=mm.menu_id
		WHERE m.household_id=? ORDER BY m.week_start ASC, mm.id ASC`, u.HouseholdID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var rid string
		var st string
		_ = rows.Scan(&rid, &st)
		lastStatus[rid] = st
	}
	rows.Close()

	now := time.Now()
	cands := []*Suggestion{}
	for _, rc := range recipes {
		if skipIDs[rc.ID] {
			continue
		}
		if mealType != "" && mealType != "any" && rc.MealType != mealType {
			continue
		}
		if len(include) > 0 && !hasAny(rc.Tags, include) {
			continue
		}
		if len(exclude) > 0 && hasAny(rc.Tags, exclude) {
			continue
		}
		if maxMinutes > 0 && rc.PrepMinutes+rc.CookMinutes > maxMinutes {
			continue
		}
		bad := false
		for _, ri := range rc.Ingredients {
			if skipIngs[ri.IngredientID] {
				bad = true
				break
			}
		}
		if bad {
			continue
		}

		sg := &Suggestion{Recipe: rc, Reasons: []string{}}
		score := 1.0
		if rc.TimesCooked > 0 {
			score += 0.6 * math.Log(1+float64(rc.TimesCooked))
			sg.Reasons = append(sg.Reasons, "A household favorite — cooked "+strconv.Itoa(rc.TimesCooked)+"×")
		}
		if rc.LastPlanned == nil {
			score += 1.2
			sg.Reasons = append(sg.Reasons, "Never planned yet — something fresh")
		} else if t, err := time.Parse("2006-01-02", *rc.LastPlanned); err == nil {
			weeks := now.Sub(t).Hours() / 24 / 7
			switch {
			case weeks < 2:
				score -= 2
				sg.Reasons = append(sg.Reasons, "Planned very recently")
			case weeks >= 4:
				score += math.Min(weeks, 10) * 0.2
				sg.Reasons = append(sg.Reasons, "Not on the menu in "+strconv.Itoa(int(weeks))+" weeks")
			}
		}
		if lastStatus[rc.ID] == "skipped" {
			score += 1.5
			sg.Reasons = append(sg.Reasons, "Planned but skipped last time")
		}
		sg.Score = score + rand.Float64()*0.8
		cands = append(cands, sg)
	}

	picked := []*Suggestion{}
	tagSeen := map[string]int{}
	for len(picked) < count && len(cands) > 0 {
		best, bi := -1e9, -1
		for i, c := range cands {
			sc := c.Score
			for _, t := range c.Recipe.Tags {
				sc -= 0.35 * float64(tagSeen[t])
			}
			if sc > best {
				best, bi = sc, i
			}
		}
		c := cands[bi]
		cands = append(cands[:bi], cands[bi+1:]...)
		c.Score = best
		for _, t := range c.Recipe.Tags {
			tagSeen[t]++
		}
		if len(c.Reasons) == 0 {
			c.Reasons = append(c.Reasons, "Fits your filters")
		}
		picked = append(picked, c)
	}
	return picked, nil
}

// ---------- stats ----------

type CountItem struct {
	Name  string  `json:"name"`
	Count int     `json:"count"`
	Cost  float64 `json:"cost"`
	ID    string  `json:"id,omitempty"`
}

type WeekStat struct {
	WeekStart  string         `json:"weekStart"`
	Meals      int            `json:"meals"`
	Cooked     int            `json:"cooked"`
	Skipped    int            `json:"skipped"`
	MealsCost  float64        `json:"mealsCost"`
	ExtrasCost float64        `json:"extrasCost"`
	Budget     *float64       `json:"budget"`
	Items      int            `json:"items"`
	Checked    int            `json:"checked"`
	ByCategory map[string]int `json:"byCategory"`
}

func (s *server) stats(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	weeks := 12
	if n, err := strconv.Atoi(r.URL.Query().Get("weeks")); err == nil && n > 0 && n <= 104 {
		weeks = n
	}
	since := time.Now().AddDate(0, 0, -7*weeks).Format("2006-01-02")

	// weekly series
	weekly := []*WeekStat{}
	byMenu := map[string]*WeekStat{}
	rows, err := s.db.Query(`SELECT id,week_start,budget FROM menus WHERE household_id=? AND week_start>=? ORDER BY week_start`, u.HouseholdID, since)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id string
		ws := &WeekStat{ByCategory: map[string]int{}}
		_ = rows.Scan(&id, &ws.WeekStart, &ws.Budget)
		byMenu[id] = ws
		weekly = append(weekly, ws)
	}
	rows.Close()

	mr, err := s.db.Query(`SELECT mm.menu_id, mm.status,
		(SELECT SUM(i.unit_cost*(`+qtyInIngredientUnit()+`)) FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE ri.recipe_id=mm.recipe_id AND i.unit_cost IS NOT NULL)
		FROM menu_meals mm JOIN menus m ON m.id=mm.menu_id WHERE m.household_id=? AND m.week_start>=?`, u.HouseholdID, since)
	if err != nil {
		return nil, err
	}
	for mr.Next() {
		var mid string
		var st string
		var c *float64
		_ = mr.Scan(&mid, &st, &c)
		if ws := byMenu[mid]; ws != nil {
			ws.Meals++
			if st == "cooked" {
				ws.Cooked++
			} else if st == "skipped" {
				ws.Skipped++
			}
			if c != nil {
				ws.MealsCost += *c
			}
		}
	}
	mr.Close()

	cats := map[string]*CountItem{}
	gr, err := s.db.Query(`SELECT g.menu_id,g.category,g.checked,g.source,COALESCE(g.unit_cost,0)*g.quantity
		FROM grocery_items g JOIN menus m ON m.id=g.menu_id WHERE m.household_id=? AND m.week_start>=?`, u.HouseholdID, since)
	if err != nil {
		return nil, err
	}
	for gr.Next() {
		var mid string
		var cat, src string
		var ch int
		var cost float64
		_ = gr.Scan(&mid, &cat, &ch, &src, &cost)
		if ws := byMenu[mid]; ws != nil {
			ws.Items++
			ws.Checked += ch
			ws.ByCategory[cat]++
			if src == "extra" {
				ws.ExtrasCost += cost
			}
		}
		ci := cats[cat]
		if ci == nil {
			ci = &CountItem{Name: cat}
			cats[cat] = ci
		}
		ci.Count++
		ci.Cost += cost
	}
	gr.Close()

	// top recipes, tags, meal types
	top := []CountItem{}
	tr, err := s.db.Query(`SELECT r.id,r.name,COUNT(*) c FROM menu_meals mm JOIN menus m ON m.id=mm.menu_id JOIN recipes r ON r.id=mm.recipe_id
		WHERE m.household_id=? AND m.week_start>=? GROUP BY r.id ORDER BY c DESC, r.name LIMIT 10`, u.HouseholdID, since)
	if err != nil {
		return nil, err
	}
	for tr.Next() {
		var ci CountItem
		_ = tr.Scan(&ci.ID, &ci.Name, &ci.Count)
		top = append(top, ci)
	}
	tr.Close()

	tagCounts := map[string]int{}
	typeCounts := map[string]int{}
	tg, err := s.db.Query(`SELECT r.tags,r.meal_type FROM menu_meals mm JOIN menus m ON m.id=mm.menu_id JOIN recipes r ON r.id=mm.recipe_id
		WHERE m.household_id=? AND m.week_start>=?`, u.HouseholdID, since)
	if err != nil {
		return nil, err
	}
	for tg.Next() {
		var tags, mt string
		_ = tg.Scan(&tags, &mt)
		typeCounts[mt]++
		for _, t := range parseTags(tags) {
			tagCounts[t]++
		}
	}
	tg.Close()

	tagList := []CountItem{}
	for t, c := range tagCounts {
		tagList = append(tagList, CountItem{Name: t, Count: c})
	}
	sort.Slice(tagList, func(i, j int) bool {
		if tagList[i].Count != tagList[j].Count {
			return tagList[i].Count > tagList[j].Count
		}
		return tagList[i].Name < tagList[j].Name
	})
	typeList := []CountItem{}
	for t, c := range typeCounts {
		typeList = append(typeList, CountItem{Name: t, Count: c})
	}
	sort.Slice(typeList, func(i, j int) bool { return typeList[i].Count > typeList[j].Count })
	catList := []CountItem{}
	for _, c := range cats {
		catList = append(catList, *c)
	}
	sort.Slice(catList, func(i, j int) bool { return catList[i].Count > catList[j].Count })

	return map[string]any{
		"weeks":      weeks,
		"weekly":     weekly,
		"topRecipes": top,
		"tags":       tagList,
		"mealTypes":  typeList,
		"categories": catList,
	}, nil
}
