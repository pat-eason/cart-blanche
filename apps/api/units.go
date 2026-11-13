package main

import (
	"fmt"
	"strings"
)

// Units that can be converted between each other. Volumes are expressed in
// millilitres and weights in grams; anything else (pc, can, bunch…) only
// converts to itself.
var volumeUnits = map[string]float64{
	"tsp": 4.92892, "tbsp": 14.7868, "fl oz": 29.5735, "cup": 236.588,
	"pint": 473.176, "quart": 946.353, "gallon": 3785.41, "ml": 1, "l": 1000,
}
var weightUnits = map[string]float64{"oz": 28.3495, "lb": 453.592, "g": 1, "kg": 1000}

// unitAliases maps loose spellings onto the canonical unit names above.
var unitAliases = map[string]string{
	"teaspoon": "tsp", "teaspoons": "tsp", "tsps": "tsp", "t": "tsp",
	"tablespoon": "tbsp", "tablespoons": "tbsp", "tbsps": "tbsp", "tbs": "tbsp", "tbl": "tbsp",
	"cups": "cup", "c": "cup", "pints": "pint", "pt": "pint", "quarts": "quart", "qt": "quart",
	"gallons": "gallon", "gal": "gallon", "floz": "fl oz", "fl. oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
	"milliliter": "ml", "milliliters": "ml", "liter": "l", "liters": "l",
	"ounce": "oz", "ounces": "oz", "pound": "lb", "pounds": "lb", "lbs": "lb",
	"gram": "g", "grams": "g", "kilogram": "kg", "kilograms": "kg",
}

func canonUnit(u string) string {
	u = strings.ToLower(strings.TrimSpace(u))
	if a, ok := unitAliases[u]; ok {
		return a
	}
	return u
}

// convertQty converts q from one unit to another; ok is false when they are not comparable.
func convertQty(q float64, from, to string) (float64, bool) {
	from, to = canonUnit(from), canonUnit(to)
	if from == to {
		return q, true
	}
	if f, ok := volumeUnits[from]; ok {
		if t, ok := volumeUnits[to]; ok {
			return q * f / t, true
		}
	}
	if f, ok := weightUnits[from]; ok {
		if t, ok := weightUnits[to]; ok {
			return q * f / t, true
		}
	}
	return q, false
}

func factorCase(col string, m map[string]float64) string {
	var b strings.Builder
	fmt.Fprintf(&b, "CASE lower(trim(%s))", col)
	for k, v := range m {
		fmt.Fprintf(&b, " WHEN '%s' THEN %v", k, v)
	}
	b.WriteString(" END")
	return b.String()
}

// qtyInIngredientUnit is a SQL expression giving a recipe_ingredients row's quantity
// (alias ri) in its ingredient's (alias i) own unit, for pricing. Rows with no
// unit of their own, or in an unrelated unit, count as-is.
func qtyInIngredientUnit() string {
	return fmt.Sprintf(`ri.quantity * CASE WHEN ri.unit='' OR lower(ri.unit)=lower(i.unit) THEN 1
		ELSE COALESCE(%s/NULLIF(%s,0), %s/NULLIF(%s,0), 1) END`,
		factorCase("ri.unit", volumeUnits), factorCase("i.unit", volumeUnits),
		factorCase("ri.unit", weightUnits), factorCase("i.unit", weightUnits))
}
