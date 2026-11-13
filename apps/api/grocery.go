package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

func parseTags(s string) []string {
	t := []string{}
	_ = json.Unmarshal([]byte(s), &t)
	return t
}

type GroceryItem struct {
	ID           string   `json:"id"`
	MenuID       string   `json:"menuId"`
	IngredientID *string  `json:"ingredientId"`
	Name         string   `json:"name"`
	Quantity     float64  `json:"quantity"`
	Unit         string   `json:"unit"`
	Category     string   `json:"category"`
	UnitCost     *float64 `json:"unitCost"`
	Checked      bool     `json:"checked"`
	CheckedBy    *string  `json:"checkedBy"`
	Source       string   `json:"source"`
}

type Grocery struct {
	Items      []GroceryItem `json:"items"`
	Total      float64       `json:"total"`
	Remaining  float64       `json:"remaining"`
	Checked    int           `json:"checked"`
	Count      int           `json:"count"`
	MenuStatus string        `json:"menuStatus"`
}

func (s *server) menuOwned(hid, id string) error {
	var n int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM menus WHERE id=? AND household_id=?`, id, hid).Scan(&n)
	if n == 0 {
		return errNotFound
	}
	return nil
}

func (s *server) loadGrocery(menuID string) (*Grocery, error) {
	g := &Grocery{Items: []GroceryItem{}}
	_ = s.db.QueryRow(`SELECT status FROM menus WHERE id=?`, menuID).Scan(&g.MenuStatus)
	rows, err := s.db.Query(`SELECT g.id,g.menu_id,g.ingredient_id,g.name,g.quantity,g.unit,g.category,g.unit_cost,g.checked,u.name,g.source
		FROM grocery_items g LEFT JOIN users u ON u.id=g.checked_by WHERE g.menu_id=? ORDER BY g.category, lower(g.name)`, menuID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var it GroceryItem
		var ch int
		if err := rows.Scan(&it.ID, &it.MenuID, &it.IngredientID, &it.Name, &it.Quantity, &it.Unit, &it.Category, &it.UnitCost, &ch, &it.CheckedBy, &it.Source); err != nil {
			return nil, err
		}
		it.Checked = ch == 1
		g.Count++
		if it.UnitCost != nil {
			c := *it.UnitCost * it.Quantity
			g.Total += c
			if !it.Checked {
				g.Remaining += c
			}
		}
		if it.Checked {
			g.Checked++
		}
		g.Items = append(g.Items, it)
	}
	return g, rows.Err()
}

func (s *server) getGrocery(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	if err := s.menuOwned(u.HouseholdID, id); err != nil {
		return nil, err
	}
	return s.loadGrocery(id)
}

// generateGrocery rebuilds the menu-derived part of the list from the menu's recipes.
// Checked state is preserved for items that still belong, and off-menu items are untouched.
func (s *server) generateGrocery(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	if err := s.menuOwned(u.HouseholdID, id); err != nil {
		return nil, err
	}
	type agg struct {
		qty      float64
		name     string
		unit     string
		category string
		cost     *float64
		iid      string
	}
	// Totals are keyed by ingredient + unit. Quantities written in a unit comparable to the
	// ingredient's own (tbsp / cup / tsp…) are converted and summed into it; anything
	// that can't be converted gets its own line in the unit it was written in.
	need := map[string]*agg{}
	rows, err := s.db.Query(`SELECT i.id,i.name,i.unit,i.category,i.unit_cost,ri.quantity,ri.unit
		FROM menu_meals mm JOIN recipe_ingredients ri ON ri.recipe_id=mm.recipe_id
		JOIN ingredients i ON i.id=ri.ingredient_id WHERE mm.menu_id=?`, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var iid string
		var a agg
		var q float64
		var riUnit string
		if err := rows.Scan(&iid, &a.name, &a.unit, &a.category, &a.cost, &q, &riUnit); err != nil {
			rows.Close()
			return nil, err
		}
		riUnit = strings.TrimSpace(riUnit)
		if riUnit != "" {
			if c, ok := convertQty(q, riUnit, a.unit); ok {
				q = c
			} else {
				a.unit, a.cost = riUnit, nil // not comparable: separate line, can't be priced
			}
		}
		key := iid + "|" + a.unit
		if ex, ok := need[key]; ok {
			ex.qty += q
		} else {
			a.qty = q
			a.iid = iid
			need[key] = &a
		}
	}
	rows.Close()

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	existing := map[string]string{}
	er, err := tx.Query(`SELECT id,ingredient_id,unit FROM grocery_items WHERE menu_id=? AND source='menu'`, id)
	if err != nil {
		return nil, err
	}
	for er.Next() {
		var gid string
		var iid *string
		var unit string
		_ = er.Scan(&gid, &iid, &unit)
		if iid != nil {
			existing[*iid+"|"+unit] = gid
		}
	}
	er.Close()

	keys := make([]string, 0, len(need))
	for k := range need {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(a, b int) bool { return keys[a] < keys[b] })
	for _, key := range keys {
		a := need[key]
		iid := a.iid
		if gid, ok := existing[key]; ok {
			if _, err := tx.Exec(`UPDATE grocery_items SET quantity=?,name=?,unit=?,category=?,unit_cost=? WHERE id=?`,
				a.qty, a.name, a.unit, a.category, a.cost, gid); err != nil {
				return nil, err
			}
			delete(existing, key)
		} else if _, err := tx.Exec(`INSERT INTO grocery_items(menu_id,ingredient_id,name,quantity,unit,category,unit_cost,source) VALUES(?,?,?,?,?,?,?,'menu')`,
			id, iid, a.name, a.qty, a.unit, a.category, a.cost); err != nil {
			return nil, err
		}
	}
	for _, gid := range existing { // no longer on the menu
		if _, err := tx.Exec(`DELETE FROM grocery_items WHERE id=?`, gid); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.loadGrocery(id)
}

func (s *server) addGroceryItem(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	if err := s.menuOwned(u.HouseholdID, id); err != nil {
		return nil, err
	}
	var in struct {
		Name     string   `json:"name"`
		Quantity float64  `json:"quantity"`
		Unit     string   `json:"unit"`
		Category string   `json:"category"`
		UnitCost *float64 `json:"unitCost"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, errBad("item name is required")
	}
	if in.Quantity <= 0 {
		in.Quantity = 1
	}
	if strings.TrimSpace(in.Category) == "" {
		in.Category = "Household"
	}
	if _, err := s.db.Exec(`INSERT INTO grocery_items(menu_id,name,quantity,unit,category,unit_cost,source) VALUES(?,?,?,?,?,?,'extra')`,
		id, in.Name, in.Quantity, strings.TrimSpace(in.Unit), strings.TrimSpace(in.Category), in.UnitCost); err != nil {
		return nil, err
	}
	return s.loadGrocery(id)
}

func (s *server) groceryMenuID(hid, itemID string) (string, error) {
	var mid string
	err := s.db.QueryRow(`SELECT m.id FROM grocery_items g JOIN menus m ON m.id=g.menu_id WHERE g.id=? AND m.household_id=?`, itemID, hid).Scan(&mid)
	return mid, err
}

func (s *server) updateGroceryItem(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	mid, err := s.groceryMenuID(u.HouseholdID, id)
	if err != nil {
		return nil, errNotFound
	}
	var in struct {
		Checked   *bool    `json:"checked"`
		Name      *string  `json:"name"`
		Quantity  *float64 `json:"quantity"`
		UnitCost  *float64 `json:"unitCost"`
		ClearCost bool     `json:"clearCost"`
		Category  *string  `json:"category"`
		Unit      *string  `json:"unit"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if in.Checked != nil {
		if *in.Checked {
			s.db.Exec(`UPDATE grocery_items SET checked=1,checked_by=?,checked_at=CURRENT_TIMESTAMP WHERE id=?`, u.ID, id)
		} else {
			s.db.Exec(`UPDATE grocery_items SET checked=0,checked_by=NULL,checked_at=NULL WHERE id=?`, id)
		}
	}
	if in.Name != nil && strings.TrimSpace(*in.Name) != "" {
		s.db.Exec(`UPDATE grocery_items SET name=? WHERE id=?`, strings.TrimSpace(*in.Name), id)
	}
	if in.Quantity != nil && *in.Quantity > 0 {
		s.db.Exec(`UPDATE grocery_items SET quantity=? WHERE id=?`, *in.Quantity, id)
	}
	if in.ClearCost {
		s.db.Exec(`UPDATE grocery_items SET unit_cost=NULL WHERE id=?`, id)
	} else if in.UnitCost != nil {
		s.db.Exec(`UPDATE grocery_items SET unit_cost=? WHERE id=?`, *in.UnitCost, id)
	}
	if in.Category != nil {
		s.db.Exec(`UPDATE grocery_items SET category=? WHERE id=?`, *in.Category, id)
	}
	if in.Unit != nil {
		s.db.Exec(`UPDATE grocery_items SET unit=? WHERE id=?`, *in.Unit, id)
	}
	return s.loadGrocery(mid)
}

func (s *server) deleteGroceryItem(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	mid, err := s.groceryMenuID(u.HouseholdID, id)
	if err != nil {
		return nil, errNotFound
	}
	if _, err := s.db.Exec(`DELETE FROM grocery_items WHERE id=?`, id); err != nil {
		return nil, err
	}
	return s.loadGrocery(mid)
}
