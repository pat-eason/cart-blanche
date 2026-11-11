package main

import (
	"net/http"
	"regexp"
	"strings"
	"time"
)

var weekRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func validWeek(s string) bool {
	if !weekRe.MatchString(s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

type Meal struct {
	ID       int64    `json:"id"`
	RecipeID int64    `json:"recipeId"`
	Name     string   `json:"name"`
	MealType string   `json:"mealType"`
	Tags     []string `json:"tags"`
	Day      *int     `json:"day"`
	Slot     string   `json:"slot"`
	Status   string   `json:"status"`
	EstCost  *float64 `json:"estCost"`
	Minutes  int      `json:"minutes"`
}

type Menu struct {
	ID           int64    `json:"id"`
	Title        string   `json:"title"`
	WeekStart    string   `json:"weekStart"`
	Status       string   `json:"status"`
	Budget       *float64 `json:"budget"`
	Notes        string   `json:"notes"`
	Meals        []Meal   `json:"meals"`
	EstCost      float64  `json:"estCost"`      // meals + off-menu items that have costs
	MealsCost    float64  `json:"mealsCost"`    // from recipe ingredients
	ExtrasCost   float64  `json:"extrasCost"`   // off-menu items
	ItemCount    int      `json:"itemCount"`    // grocery items
	CheckedCount int      `json:"checkedCount"` // checked grocery items
}

func (s *server) loadMenu(hid, id int64) (*Menu, error) {
	m := &Menu{Meals: []Meal{}}
	err := s.db.QueryRow(`SELECT id,title,week_start,status,budget,notes FROM menus WHERE id=? AND household_id=?`, id, hid).
		Scan(&m.ID, &m.Title, &m.WeekStart, &m.Status, &m.Budget, &m.Notes)
	if err != nil {
		return nil, err
	}
	if err := s.fillMenu(m, hid); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *server) fillMenu(m *Menu, hid int64) error {
	rows, err := s.db.Query(`SELECT mm.id,mm.recipe_id,r.name,r.meal_type,r.tags,mm.day,mm.slot,mm.status,r.prep_minutes+r.cook_minutes,
		(SELECT SUM(i.unit_cost*ri.quantity) FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id WHERE ri.recipe_id=r.id AND i.unit_cost IS NOT NULL)
		FROM menu_meals mm JOIN recipes r ON r.id=mm.recipe_id WHERE mm.menu_id=?
		ORDER BY COALESCE(mm.day,99), mm.id`, m.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var ml Meal
		var tags string
		if err := rows.Scan(&ml.ID, &ml.RecipeID, &ml.Name, &ml.MealType, &tags, &ml.Day, &ml.Slot, &ml.Status, &ml.Minutes, &ml.EstCost); err != nil {
			return err
		}
		ml.Tags = parseTags(tags)
		if ml.EstCost != nil {
			m.MealsCost += *ml.EstCost
		}
		m.Meals = append(m.Meals, ml)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	// grocery summary
	var extras *float64
	if err := s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(checked),0),
		SUM(CASE WHEN source='extra' THEN COALESCE(unit_cost,0)*quantity END) FROM grocery_items WHERE menu_id=?`, m.ID).
		Scan(&m.ItemCount, &m.CheckedCount, &extras); err != nil {
		return err
	}
	if extras != nil {
		m.ExtrasCost = *extras
	}
	m.EstCost = m.MealsCost + m.ExtrasCost
	return nil
}

func (s *server) listMenus(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	rows, err := s.db.Query(`SELECT id,title,week_start,status,budget,notes FROM menus WHERE household_id=? ORDER BY week_start DESC`, u.HouseholdID)
	if err != nil {
		return nil, err
	}
	menus := []*Menu{}
	for rows.Next() {
		m := &Menu{Meals: []Meal{}}
		if err := rows.Scan(&m.ID, &m.Title, &m.WeekStart, &m.Status, &m.Budget, &m.Notes); err != nil {
			rows.Close()
			return nil, err
		}
		menus = append(menus, m)
	}
	rows.Close()
	for _, m := range menus {
		if err := s.fillMenu(m, u.HouseholdID); err != nil {
			return nil, err
		}
	}
	return menus, nil
}

func (s *server) menuByWeek(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	week := r.PathValue("week")
	if !validWeek(week) {
		return nil, errBad("week must be YYYY-MM-DD")
	}
	var id int64
	if err := s.db.QueryRow(`SELECT id FROM menus WHERE household_id=? AND week_start=?`, u.HouseholdID, week).Scan(&id); err != nil {
		return nil, errNotFound
	}
	return s.loadMenu(u.HouseholdID, id)
}

func (s *server) getMenu(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	return s.loadMenu(u.HouseholdID, id)
}

func (s *server) createMenu(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	var in struct {
		WeekStart string   `json:"weekStart"`
		Title     string   `json:"title"`
		Budget    *float64 `json:"budget"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if !validWeek(in.WeekStart) {
		return nil, errBad("weekStart must be YYYY-MM-DD")
	}
	id, err := s.db.InsertID(`INSERT INTO menus(household_id,title,week_start,budget,created_by) VALUES(?,?,?,?,?)`,
		u.HouseholdID, strings.TrimSpace(in.Title), in.WeekStart, in.Budget, u.ID)
	if err != nil {
		if isUnique(err) {
			return nil, apiErr{http.StatusConflict, "there's already a menu for that week"}
		}
		return nil, err
	}
	return s.loadMenu(u.HouseholdID, id)
}

func (s *server) updateMenu(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	var in struct {
		Title       *string  `json:"title"`
		Status      *string  `json:"status"`
		Notes       *string  `json:"notes"`
		Budget      *float64 `json:"budget"`
		ClearBudget bool     `json:"clearBudget"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if _, err := s.loadMenu(u.HouseholdID, id); err != nil {
		return nil, err
	}
	if in.Title != nil {
		s.db.Exec(`UPDATE menus SET title=? WHERE id=?`, strings.TrimSpace(*in.Title), id)
	}
	if in.Notes != nil {
		s.db.Exec(`UPDATE menus SET notes=? WHERE id=?`, *in.Notes, id)
	}
	if in.Status != nil {
		switch *in.Status {
		case "draft", "shopping", "complete":
			s.db.Exec(`UPDATE menus SET status=? WHERE id=?`, *in.Status, id)
		default:
			return nil, errBad("invalid status")
		}
	}
	if in.ClearBudget {
		s.db.Exec(`UPDATE menus SET budget=NULL WHERE id=?`, id)
	} else if in.Budget != nil {
		s.db.Exec(`UPDATE menus SET budget=? WHERE id=?`, *in.Budget, id)
	}
	return s.loadMenu(u.HouseholdID, id)
}

func (s *server) deleteMenu(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	res, err := s.db.Exec(`DELETE FROM menus WHERE id=? AND household_id=?`, id, u.HouseholdID)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errNotFound
	}
	return nil, nil
}

func (s *server) addMeal(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	var in struct {
		RecipeID int64  `json:"recipeId"`
		Day      *int   `json:"day"`
		Slot     string `json:"slot"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if _, err := s.loadMenu(u.HouseholdID, id); err != nil {
		return nil, err
	}
	var ok int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM recipes WHERE id=? AND household_id=?`, in.RecipeID, u.HouseholdID).Scan(&ok)
	if ok == 0 {
		return nil, errBad("unknown recipe")
	}
	if in.Day != nil && (*in.Day < 0 || *in.Day > 6) {
		return nil, errBad("day must be 0-6")
	}
	if in.Slot == "" {
		in.Slot = "dinner"
	}
	if _, err := s.db.Exec(`INSERT INTO menu_meals(menu_id,recipe_id,day,slot) VALUES(?,?,?,?)`, id, in.RecipeID, in.Day, in.Slot); err != nil {
		return nil, err
	}
	return s.loadMenu(u.HouseholdID, id)
}

func (s *server) mealMenuID(hid, mealID int64) (int64, error) {
	var mid int64
	err := s.db.QueryRow(`SELECT m.id FROM menu_meals mm JOIN menus m ON m.id=mm.menu_id WHERE mm.id=? AND m.household_id=?`, mealID, hid).Scan(&mid)
	return mid, err
}

func (s *server) updateMeal(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	mid, err := s.mealMenuID(u.HouseholdID, id)
	if err != nil {
		return nil, errNotFound
	}
	var in struct {
		Day      *int    `json:"day"`
		ClearDay bool    `json:"clearDay"`
		Status   *string `json:"status"`
		Slot     *string `json:"slot"`
	}
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if in.ClearDay {
		s.db.Exec(`UPDATE menu_meals SET day=NULL WHERE id=?`, id)
	} else if in.Day != nil {
		if *in.Day < 0 || *in.Day > 6 {
			return nil, errBad("day must be 0-6")
		}
		s.db.Exec(`UPDATE menu_meals SET day=? WHERE id=?`, *in.Day, id)
	}
	if in.Status != nil {
		switch *in.Status {
		case "planned", "cooked", "skipped":
			s.db.Exec(`UPDATE menu_meals SET status=? WHERE id=?`, *in.Status, id)
		default:
			return nil, errBad("invalid status")
		}
	}
	if in.Slot != nil && *in.Slot != "" {
		s.db.Exec(`UPDATE menu_meals SET slot=? WHERE id=?`, *in.Slot, id)
	}
	return s.loadMenu(u.HouseholdID, mid)
}

func (s *server) deleteMeal(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	id, err := pathID(r, "id")
	if err != nil {
		return nil, err
	}
	mid, err := s.mealMenuID(u.HouseholdID, id)
	if err != nil {
		return nil, errNotFound
	}
	if _, err := s.db.Exec(`DELETE FROM menu_meals WHERE id=?`, id); err != nil {
		return nil, err
	}
	return s.loadMenu(u.HouseholdID, mid)
}
