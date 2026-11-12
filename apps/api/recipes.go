package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
)

// ---------- ingredients ----------

type Ingredient struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Unit     string   `json:"unit"`
	Category string   `json:"category"`
	UnitCost *float64 `json:"unitCost"`
}

func (s *server) listIngredients(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	rows, err := s.db.Query(`SELECT id,name,unit,category,unit_cost FROM ingredients WHERE household_id=? ORDER BY category, lower(name)`, u.HouseholdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Ingredient{}
	for rows.Next() {
		var i Ingredient
		if err := rows.Scan(&i.ID, &i.Name, &i.Unit, &i.Category, &i.UnitCost); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func cleanIngredient(in *Ingredient) error {
	in.Name = strings.TrimSpace(in.Name)
	in.Unit = strings.TrimSpace(in.Unit)
	in.Category = strings.TrimSpace(in.Category)
	if in.Name == "" {
		return errBad("ingredient name is required")
	}
	if in.Category == "" {
		in.Category = "Pantry"
	}
	if in.UnitCost != nil && *in.UnitCost < 0 {
		return errBad("cost can't be negative")
	}
	return nil
}

func (s *server) createIngredient(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	var in Ingredient
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if err := cleanIngredient(&in); err != nil {
		return nil, err
	}
	id, err := s.db.InsertID(`INSERT INTO ingredients(household_id,name,unit,category,unit_cost) VALUES(?,?,?,?,?)`,
		u.HouseholdID, in.Name, in.Unit, in.Category, in.UnitCost)
	if err != nil {
		if isUnique(err) {
			return nil, apiErr{http.StatusConflict, "you already have an ingredient with that name"}
		}
		return nil, err
	}
	in.ID = id
	return in, nil
}

func (s *server) updateIngredient(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	var in Ingredient
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if err := cleanIngredient(&in); err != nil {
		return nil, err
	}
	res, err := s.db.Exec(`UPDATE ingredients SET name=?,unit=?,category=?,unit_cost=? WHERE id=? AND household_id=?`,
		in.Name, in.Unit, in.Category, in.UnitCost, id, u.HouseholdID)
	if err != nil {
		if isUnique(err) {
			return nil, apiErr{http.StatusConflict, "you already have an ingredient with that name"}
		}
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errNotFound
	}
	in.ID = id
	return in, nil
}

func (s *server) deleteIngredient(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	var used int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM recipe_ingredients WHERE ingredient_id=?`, id).Scan(&used)
	if used > 0 {
		return nil, apiErr{http.StatusConflict, "this ingredient is used by a recipe; remove it there first"}
	}
	res, err := s.db.Exec(`DELETE FROM ingredients WHERE id=? AND household_id=?`, id, u.HouseholdID)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errNotFound
	}
	return nil, nil
}

// ---------- recipes ----------

type RecipeIngredient struct {
	IngredientID string   `json:"ingredientId"`
	Name         string   `json:"name"`
	Unit         string   `json:"unit"`
	Category     string   `json:"category"`
	UnitCost     *float64 `json:"unitCost"`
	Quantity     float64  `json:"quantity"`
	Note         string   `json:"note"`
}

type Recipe struct {
	ID           string             `json:"id"`
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	MealType     string             `json:"mealType"`
	Tags         []string           `json:"tags"`
	PrepMinutes  int                `json:"prepMinutes"`
	CookMinutes  int                `json:"cookMinutes"`
	Servings     int                `json:"servings"`
	Instructions string             `json:"instructions"`
	Avoid        bool               `json:"avoid"`
	Ingredients  []RecipeIngredient `json:"ingredients"`
	EstCost      *float64           `json:"estCost"`
	TimesPlanned int                `json:"timesPlanned"`
	TimesCooked  int                `json:"timesCooked"`
	LastPlanned  *string            `json:"lastPlanned"`
}

const recipeSelect = `SELECT r.id,r.name,r.description,r.meal_type,r.tags,r.prep_minutes,r.cook_minutes,r.servings,r.instructions,r.avoid,
  (SELECT COUNT(*) FROM menu_meals mm WHERE mm.recipe_id=r.id),
  (SELECT COUNT(*) FROM menu_meals mm WHERE mm.recipe_id=r.id AND mm.status='cooked'),
  (SELECT MAX(m.week_start) FROM menu_meals mm JOIN menus m ON m.id=mm.menu_id WHERE mm.recipe_id=r.id)
  FROM recipes r`

func scanRecipe(sc interface{ Scan(...any) error }) (*Recipe, error) {
	var rc Recipe
	var tags string
	var avoid int
	if err := sc.Scan(&rc.ID, &rc.Name, &rc.Description, &rc.MealType, &tags, &rc.PrepMinutes, &rc.CookMinutes, &rc.Servings,
		&rc.Instructions, &avoid, &rc.TimesPlanned, &rc.TimesCooked, &rc.LastPlanned); err != nil {
		return nil, err
	}
	rc.Avoid = avoid == 1
	rc.Tags = []string{}
	_ = json.Unmarshal([]byte(tags), &rc.Tags)
	rc.Ingredients = []RecipeIngredient{}
	return &rc, nil
}

func (s *server) attachIngredients(recipes []*Recipe) error {
	byID := map[string]*Recipe{}
	for _, r := range recipes {
		byID[r.ID] = r
	}
	if len(byID) == 0 {
		return nil
	}
	ph := make([]string, 0, len(byID))
	args := make([]any, 0, len(byID))
	for id := range byID {
		ph = append(ph, "?")
		args = append(args, id)
	}
	rows, err := s.db.Query(`SELECT ri.recipe_id,i.id,i.name,i.unit,i.category,i.unit_cost,ri.quantity,ri.note
		FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id
		WHERE ri.recipe_id IN (`+strings.Join(ph, ",")+`) ORDER BY ri.id`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var rid string
		var ri RecipeIngredient
		if err := rows.Scan(&rid, &ri.IngredientID, &ri.Name, &ri.Unit, &ri.Category, &ri.UnitCost, &ri.Quantity, &ri.Note); err != nil {
			return err
		}
		if rc, ok := byID[rid]; ok {
			rc.Ingredients = append(rc.Ingredients, ri)
			if ri.UnitCost != nil {
				c := *ri.UnitCost * ri.Quantity
				if rc.EstCost == nil {
					rc.EstCost = new(float64)
				}
				*rc.EstCost += c
			}
		}
	}
	return rows.Err()
}

func (s *server) loadRecipes(hid string, where string, args ...any) ([]*Recipe, error) {
	rows, err := s.db.Query(recipeSelect+` WHERE r.household_id=? `+where+` ORDER BY lower(r.name)`, append([]any{hid}, args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*Recipe{}
	for rows.Next() {
		rc, err := scanRecipe(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rc)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, s.attachIngredients(out)
}

func (s *server) listRecipes(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	return s.loadRecipes(u.HouseholdID, "")
}

func (s *server) getRecipe(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	rs, err := s.loadRecipes(u.HouseholdID, "AND r.id=?", id)
	if err != nil {
		return nil, err
	}
	if len(rs) == 0 {
		return nil, errNotFound
	}
	return rs[0], nil
}

func normalizeTags(tags []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, t := range tags {
		t = strings.ToLower(strings.TrimSpace(t))
		if t != "" && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return out
}

func (s *server) saveRecipe(id string, u *User, in *Recipe) (string, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return "", errBad("recipe name is required")
	}
	if in.MealType == "" {
		in.MealType = "dinner"
	}
	if in.Servings <= 0 {
		in.Servings = 2
	}
	tags, _ := json.Marshal(normalizeTags(in.Tags))

	tx, err := s.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	if id == "" {
		id, err = tx.InsertID(`INSERT INTO recipes(household_id,name,description,meal_type,tags,prep_minutes,cook_minutes,servings,instructions,created_by)
			VALUES(?,?,?,?,?,?,?,?,?,?)`, u.HouseholdID, in.Name, in.Description, in.MealType, string(tags), in.PrepMinutes, in.CookMinutes, in.Servings, in.Instructions, u.ID)
		if err != nil {
			return "", err
		}
	} else {
		res, err := tx.Exec(`UPDATE recipes SET name=?,description=?,meal_type=?,tags=?,prep_minutes=?,cook_minutes=?,servings=?,instructions=? WHERE id=? AND household_id=?`,
			in.Name, in.Description, in.MealType, string(tags), in.PrepMinutes, in.CookMinutes, in.Servings, in.Instructions, id, u.HouseholdID)
		if err != nil {
			return "", err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return "", errNotFound
		}
		if _, err := tx.Exec(`DELETE FROM recipe_ingredients WHERE recipe_id=?`, id); err != nil {
			return "", err
		}
	}
	for _, ri := range in.Ingredients {
		// make sure ingredient belongs to this household
		var ok int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM ingredients WHERE id=? AND household_id=?`, ri.IngredientID, u.HouseholdID).Scan(&ok); err != nil || ok == 0 {
			return "", errBad("unknown ingredient in recipe")
		}
		q := ri.Quantity
		if q <= 0 {
			q = 1
		}
		if _, err := tx.Exec(`INSERT INTO recipe_ingredients(recipe_id,ingredient_id,quantity,note) VALUES(?,?,?,?)`, id, ri.IngredientID, q, ri.Note); err != nil {
			return "", err
		}
	}
	return id, tx.Commit()
}

func (s *server) createRecipe(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	var in Recipe
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	id, err := s.saveRecipe("", u, &in)
	if err != nil {
		return nil, err
	}
	rs, err := s.loadRecipes(u.HouseholdID, "AND r.id=?", id)
	if err != nil || len(rs) == 0 {
		return nil, err
	}
	return rs[0], nil
}

func (s *server) updateRecipe(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	var in Recipe
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if _, err := s.saveRecipe(id, u, &in); err != nil {
		return nil, err
	}
	rs, err := s.loadRecipes(u.HouseholdID, "AND r.id=?", id)
	if err != nil || len(rs) == 0 {
		return nil, err
	}
	return rs[0], nil
}

func (s *server) deleteRecipe(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	var used int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM menu_meals WHERE recipe_id=?`, id).Scan(&used)
	if used > 0 {
		return nil, apiErr{http.StatusConflict, "this recipe appears in past menus. Mark it \"never again\" instead to hide it from suggestions."}
	}
	res, err := s.db.Exec(`DELETE FROM recipes WHERE id=? AND household_id=?`, id, u.HouseholdID)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errNotFound
	}
	return nil, nil
}

func (s *server) setAvoid(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	var in struct {
		Avoid bool `json:"avoid"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	v := 0
	if in.Avoid {
		v = 1
	}
	res, err := s.db.Exec(`UPDATE recipes SET avoid=? WHERE id=? AND household_id=?`, v, id, u.HouseholdID)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errNotFound
	}
	return map[string]bool{"avoid": in.Avoid}, nil
}

var _ = sql.ErrNoRows
