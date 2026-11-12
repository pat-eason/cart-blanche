package main

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const schema = `
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  household_id UUID NOT NULL REFERENCES households(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Pantry',
  unit_cost DOUBLE PRECISION
);
CREATE UNIQUE INDEX IF NOT EXISTS ingredients_household_name ON ingredients (household_id, lower(name));
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  meal_type TEXT NOT NULL DEFAULT 'dinner',
  tags TEXT NOT NULL DEFAULT '[]',
  prep_minutes INTEGER NOT NULL DEFAULT 0,
  cook_minutes INTEGER NOT NULL DEFAULT 0,
  servings INTEGER NOT NULL DEFAULT 2,
  instructions TEXT NOT NULL DEFAULT '',
  avoid INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id),
  title TEXT NOT NULL DEFAULT '',
  week_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  budget DOUBLE PRECISION,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(household_id, week_start)
);
CREATE TABLE IF NOT EXISTS menu_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id),
  day INTEGER,
  slot TEXT NOT NULL DEFAULT 'dinner',
  status TEXT NOT NULL DEFAULT 'planned'
);
CREATE TABLE IF NOT EXISTS grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Pantry',
  unit_cost DOUBLE PRECISION,
  checked INTEGER NOT NULL DEFAULT 0,
  checked_by UUID REFERENCES users(id),
  checked_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'menu',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_menu_meals_menu ON menu_meals(menu_id);
CREATE INDEX IF NOT EXISTS idx_grocery_menu ON grocery_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_recipes_household ON recipes(household_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`

// DB wraps *sql.DB so queries can be written with `?` placeholders.
type DB struct{ *sql.DB }

// Tx is the transaction counterpart of DB.
type Tx struct{ *sql.Tx }

// rebind turns `?` placeholders into Postgres `$1, $2, ...`.
func rebind(q string) string {
	if !strings.Contains(q, "?") {
		return q
	}
	var b strings.Builder
	n := 0
	for _, r := range q {
		if r == '?' {
			n++
			fmt.Fprintf(&b, "$%d", n)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func (d *DB) Exec(q string, a ...any) (sql.Result, error) { return d.DB.Exec(rebind(q), a...) }
func (d *DB) Query(q string, a ...any) (*sql.Rows, error) { return d.DB.Query(rebind(q), a...) }
func (d *DB) QueryRow(q string, a ...any) *sql.Row        { return d.DB.QueryRow(rebind(q), a...) }
func (t *Tx) Exec(q string, a ...any) (sql.Result, error) { return t.Tx.Exec(rebind(q), a...) }
func (t *Tx) Query(q string, a ...any) (*sql.Rows, error) { return t.Tx.Query(rebind(q), a...) }
func (t *Tx) QueryRow(q string, a ...any) *sql.Row        { return t.Tx.QueryRow(rebind(q), a...) }

func (d *DB) Begin() (*Tx, error) {
	tx, err := d.DB.Begin()
	if err != nil {
		return nil, err
	}
	return &Tx{tx}, nil
}

// InsertID runs an INSERT and returns the new row's id.
func (d *DB) InsertID(q string, a ...any) (id string, err error) {
	err = d.QueryRow(q+" RETURNING id", a...).Scan(&id)
	return
}

func (t *Tx) InsertID(q string, a ...any) (id string, err error) {
	err = t.QueryRow(q+" RETURNING id", a...).Scan(&id)
	return
}

// isUnique reports whether err is a Postgres unique-constraint violation.
func isUnique(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func openDB(url string) (*DB, error) {
	sdb, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	sdb.SetMaxOpenConns(10)
	sdb.SetConnMaxLifetime(30 * time.Minute)

	// the database container may still be starting
	var last error
	for i := 0; i < 30; i++ {
		if last = sdb.Ping(); last == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if last != nil {
		return nil, fmt.Errorf("connect to database: %w", last)
	}
	db := &DB{sdb}
	if err := applySchema(db); err != nil {
		return nil, err
	}
	_, _ = db.Exec(`DELETE FROM sessions WHERE expires_at < now()`)
	return db, nil
}
