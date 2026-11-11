package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

type server struct {
	db           *sql.DB
	secureCookie bool
}

type ctxKey int

const userKey ctxKey = 1

type User struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	Name        string `json:"name"`
	HouseholdID int64  `json:"householdId"`
}

func main() {
	path := env("DB_PATH", "./data/cartblanche.db")
	if err := os.MkdirAll(dirOf(path), 0o755); err != nil {
		log.Fatal(err)
	}
	db, err := openDB(path)
	if err != nil {
		log.Fatal(err)
	}
	s := &server{db: db, secureCookie: env("COOKIE_SECURE", "false") == "true"}

	mux := http.NewServeMux()
	s.routes(mux)

	addr := env("ADDR", ":8080")
	log.Printf("cart blanche api listening on %s (db: %s)", addr, path)
	srv := &http.Server{
		Addr:              addr,
		Handler:           logRequests(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func dirOf(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' {
			if i == 0 {
				return "/"
			}
			return p[:i]
		}
	}
	return "."
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

// ---------- helpers ----------

type apiErr struct {
	status int
	msg    string
}

func (e apiErr) Error() string { return e.msg }

var (
	errNotFound = apiErr{http.StatusNotFound, "not found"}
	errBad      = func(m string) apiErr { return apiErr{http.StatusBadRequest, m} }
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func writeErr(w http.ResponseWriter, err error) {
	var ae apiErr
	if errors.As(err, &ae) {
		writeJSON(w, ae.status, map[string]string{"error": ae.msg})
		return
	}
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, 404, map[string]string{"error": "not found"})
		return
	}
	log.Printf("error: %v", err)
	writeJSON(w, 500, map[string]string{"error": "something went wrong"})
}

func decode(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return errBad("invalid JSON body")
	}
	return nil
}

func pathID(r *http.Request, name string) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil {
		return 0, errBad("bad id")
	}
	return id, nil
}

type handler func(w http.ResponseWriter, r *http.Request, u *User) (any, error)

// authed wraps a handler that returns (payload, error). A nil payload yields 204.
func (s *server) authed(h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, err := s.userFromRequest(r)
		if err != nil {
			writeJSON(w, 401, map[string]string{"error": "please sign in"})
			return
		}
		out, err := h(w, r.WithContext(context.WithValue(r.Context(), userKey, u)), u)
		if err != nil {
			writeErr(w, err)
			return
		}
		if out == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, 200, out)
	}
}

func (s *server) routes(m *http.ServeMux) {
	m.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	// auth
	m.HandleFunc("POST /api/auth/register", s.register)
	m.HandleFunc("POST /api/auth/login", s.login)
	m.HandleFunc("POST /api/auth/logout", s.logout)
	m.HandleFunc("GET /api/me", s.authed(s.me))

	// household
	m.HandleFunc("GET /api/household", s.authed(s.getHousehold))
	m.HandleFunc("PATCH /api/household", s.authed(s.updateHousehold))
	m.HandleFunc("POST /api/household/join", s.authed(s.joinHousehold))
	m.HandleFunc("POST /api/household/invite-code/reset", s.authed(s.resetInvite))

	// ingredients
	m.HandleFunc("GET /api/ingredients", s.authed(s.listIngredients))
	m.HandleFunc("POST /api/ingredients", s.authed(s.createIngredient))
	m.HandleFunc("PUT /api/ingredients/{id}", s.authed(s.updateIngredient))
	m.HandleFunc("DELETE /api/ingredients/{id}", s.authed(s.deleteIngredient))

	// recipes
	m.HandleFunc("GET /api/recipes", s.authed(s.listRecipes))
	m.HandleFunc("POST /api/recipes", s.authed(s.createRecipe))
	m.HandleFunc("GET /api/recipes/{id}", s.authed(s.getRecipe))
	m.HandleFunc("PUT /api/recipes/{id}", s.authed(s.updateRecipe))
	m.HandleFunc("DELETE /api/recipes/{id}", s.authed(s.deleteRecipe))
	m.HandleFunc("PATCH /api/recipes/{id}/avoid", s.authed(s.setAvoid))

	// menus
	m.HandleFunc("GET /api/menus", s.authed(s.listMenus))
	m.HandleFunc("POST /api/menus", s.authed(s.createMenu))
	m.HandleFunc("GET /api/menu-by-week/{week}", s.authed(s.menuByWeek))
	m.HandleFunc("GET /api/menus/{id}", s.authed(s.getMenu))
	m.HandleFunc("PATCH /api/menus/{id}", s.authed(s.updateMenu))
	m.HandleFunc("DELETE /api/menus/{id}", s.authed(s.deleteMenu))
	m.HandleFunc("POST /api/menus/{id}/meals", s.authed(s.addMeal))
	m.HandleFunc("PATCH /api/meals/{id}", s.authed(s.updateMeal))
	m.HandleFunc("DELETE /api/meals/{id}", s.authed(s.deleteMeal))

	// grocery
	m.HandleFunc("GET /api/menus/{id}/grocery", s.authed(s.getGrocery))
	m.HandleFunc("POST /api/menus/{id}/grocery/generate", s.authed(s.generateGrocery))
	m.HandleFunc("POST /api/menus/{id}/grocery/items", s.authed(s.addGroceryItem))
	m.HandleFunc("PATCH /api/grocery-items/{id}", s.authed(s.updateGroceryItem))
	m.HandleFunc("DELETE /api/grocery-items/{id}", s.authed(s.deleteGroceryItem))

	// insights
	m.HandleFunc("GET /api/recommendations", s.authed(s.recommendations))
	m.HandleFunc("GET /api/stats", s.authed(s.stats))
}
