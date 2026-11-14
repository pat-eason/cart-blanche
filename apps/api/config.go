package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
)

// Per-household configuration. Values are stored as text in household_config;
// configDefs declares every known key, its default (used until a household sets
// a value) and how to validate it.

const (
	cfgShoppingDay = "shopping_day" // 0=Sunday … 6=Saturday; the day the week starts
)

type configDef struct {
	Default  string
	Validate func(string) error
}

func validIntRange(lo, hi int) func(string) error {
	return func(v string) error {
		n, err := strconv.Atoi(v)
		if err != nil || n < lo || n > hi {
			return fmt.Errorf("must be a whole number from %d to %d", lo, hi)
		}
		return nil
	}
}

var configDefs = map[string]configDef{
	cfgShoppingDay: {Default: "6", Validate: validIntRange(0, 6)},
}

type configService struct {
	db   *DB
	defs map[string]configDef
}

func newConfigService(db *DB) *configService { return &configService{db: db, defs: configDefs} }

// merge overlays stored values on the defaults. Stored keys that are no longer
// defined are ignored.
func (c *configService) merge(stored map[string]string) map[string]string {
	out := make(map[string]string, len(c.defs))
	for k, d := range c.defs {
		out[k] = d.Default
		if v, ok := stored[k]; ok {
			out[k] = v
		}
	}
	return out
}

// All returns every known key for the household, falling back to defaults.
func (c *configService) All(hid string) (map[string]string, error) {
	rows, err := c.db.Query(`SELECT key, value FROM household_config WHERE household_id=?`, hid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	stored := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		stored[k] = v
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return c.merge(stored), nil
}

// Get returns one key's value (or its default).
func (c *configService) Get(hid, key string) (string, error) {
	d, ok := c.defs[key]
	if !ok {
		return "", fmt.Errorf("unknown config key %q", key)
	}
	var v string
	err := c.db.QueryRow(`SELECT value FROM household_config WHERE household_id=? AND key=?`, hid, key).Scan(&v)
	if err != nil {
		if isNoRows(err) {
			return d.Default, nil
		}
		return "", err
	}
	return v, nil
}

// GetInt is Get parsed as an int, falling back to the default if the stored value is unparseable.
func (c *configService) GetInt(hid, key string) (int, error) {
	v, err := c.Get(hid, key)
	if err != nil {
		return 0, err
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return strconv.Atoi(c.defs[key].Default)
	}
	return n, nil
}

// Set validates and upserts values for a household, recording who changed them.
func (c *configService) Set(hid, uid string, vals map[string]string) error {
	for k, v := range vals {
		d, ok := c.defs[k]
		if !ok {
			return errBad("unknown setting: " + k)
		}
		if err := d.Validate(v); err != nil {
			return errBad(k + ": " + err.Error())
		}
	}
	tx, err := c.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for k, v := range vals {
		if _, err := tx.Exec(`INSERT INTO household_config(household_id,key,value,updated_by) VALUES(?,?,?,?)
			ON CONFLICT (household_id,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=EXCLUDED.updated_by`,
			hid, k, v, uid); err != nil {
			return err
		}
	}
	return tx.Tx.Commit()
}

func (s *server) getConfig(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	return s.config.All(u.HouseholdID)
}

func (s *server) patchConfig(w http.ResponseWriter, r *http.Request, u *User) (any, error) {
	var in map[string]string
	if err := decode(r, &in); err != nil {
		return nil, err
	}
	if err := s.config.Set(u.HouseholdID, u.ID, in); err != nil {
		return nil, err
	}
	return s.config.All(u.HouseholdID)
}

func isNoRows(err error) bool { return err == sql.ErrNoRows }
