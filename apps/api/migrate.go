package main

import (
	"fmt"
	"strings"
)

// uuidMigration converts a database created with BIGSERIAL ids to UUID primary
// keys. Every row gets a fresh random UUID and all foreign keys are remapped.
// It is a no-op on new databases and on ones already converted.

var uuidTables = []string{"households", "users", "ingredients", "recipes", "recipe_ingredients", "menus", "menu_meals", "grocery_items"}

type fkSpec struct {
	table, col, ref, onDelete string
	notNull                   bool
}

var uuidFKs = []fkSpec{
	{"users", "household_id", "households", "", true},
	{"sessions", "user_id", "users", "CASCADE", true},
	{"ingredients", "household_id", "households", "", true},
	{"recipes", "household_id", "households", "", true},
	{"recipes", "created_by", "users", "", false},
	{"recipe_ingredients", "recipe_id", "recipes", "CASCADE", true},
	{"recipe_ingredients", "ingredient_id", "ingredients", "", true},
	{"menus", "household_id", "households", "", true},
	{"menus", "created_by", "users", "", false},
	{"menu_meals", "menu_id", "menus", "CASCADE", true},
	{"menu_meals", "recipe_id", "recipes", "", true},
	{"grocery_items", "menu_id", "menus", "CASCADE", true},
	{"grocery_items", "ingredient_id", "ingredients", "SET NULL", false},
	{"grocery_items", "checked_by", "users", "", false},
}

// applySchema creates/updates the schema and runs the UUID conversion, all in one
// transaction under an advisory lock so API instances starting together (or a
// failure partway through) can never leave a half-migrated database.
func applySchema(db *DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`SELECT pg_advisory_xact_lock(727274)`); err != nil {
		return err
	}
	if err := migrateToUUID(tx); err != nil {
		return err
	}
	if _, err := tx.Exec(schema); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	return tx.Tx.Commit()
}

func migrateToUUID(tx *Tx) error {
	var typ string
	err := tx.QueryRow(`SELECT data_type FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name='households' AND column_name='id'`).Scan(&typ)
	if err != nil || typ != "bigint" {
		return nil // fresh database (or already converted)
	}

	var q []string
	add := func(f string, a ...any) { q = append(q, fmt.Sprintf(f, a...)) }
	for _, t := range uuidTables {
		add(`ALTER TABLE %s ADD COLUMN id_new uuid NOT NULL DEFAULT gen_random_uuid()`, t)
	}
	for _, f := range uuidFKs {
		add(`ALTER TABLE %s ADD COLUMN %s_new uuid`, f.table, f.col)
		add(`UPDATE %s t SET %s_new = r.id_new FROM %s r WHERE r.id = t.%s`, f.table, f.col, f.ref, f.col)
	}
	for _, f := range uuidFKs {
		add(`ALTER TABLE %s DROP COLUMN %s CASCADE`, f.table, f.col)
	}
	for _, t := range uuidTables {
		add(`ALTER TABLE %s DROP COLUMN id CASCADE`, t)
		add(`ALTER TABLE %s RENAME COLUMN id_new TO id`, t)
		add(`ALTER TABLE %s ADD PRIMARY KEY (id)`, t)
		add(`ALTER TABLE %s ALTER COLUMN id SET DEFAULT gen_random_uuid()`, t)
	}
	for _, f := range uuidFKs {
		add(`ALTER TABLE %s RENAME COLUMN %s_new TO %s`, f.table, f.col, f.col)
		if f.notNull {
			add(`ALTER TABLE %s ALTER COLUMN %s SET NOT NULL`, f.table, f.col)
		}
		od := ""
		if f.onDelete != "" {
			od = " ON DELETE " + f.onDelete
		}
		add(`ALTER TABLE %s ADD FOREIGN KEY (%s) REFERENCES %s(id)%s`, f.table, f.col, f.ref, od)
	}
	add(`ALTER TABLE menus ADD UNIQUE (household_id, week_start)`)

	if _, err := tx.Exec(strings.Join(q, ";\n")); err != nil {
		return fmt.Errorf("migrate ids to uuid: %w", err)
	}
	return nil
}
