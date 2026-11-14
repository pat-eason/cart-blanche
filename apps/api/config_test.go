package main

import "testing"

func TestConfigMergeDefaults(t *testing.T) {
	c := newConfigService(nil)
	got := c.merge(map[string]string{})
	if got[cfgShoppingDay] != "6" {
		t.Fatalf("default shopping day = %q, want 6", got[cfgShoppingDay])
	}
	got = c.merge(map[string]string{cfgShoppingDay: "2", "retired_key": "x"})
	if got[cfgShoppingDay] != "2" {
		t.Fatalf("stored value not applied: %v", got)
	}
	if _, ok := got["retired_key"]; ok {
		t.Fatal("unknown stored key leaked")
	}
}

func TestConfigValidate(t *testing.T) {
	v := configDefs[cfgShoppingDay].Validate
	for _, ok := range []string{"0", "3", "6"} {
		if v(ok) != nil {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"7", "-1", "sat", "", "2.5"} {
		if v(bad) == nil {
			t.Errorf("%q should be invalid", bad)
		}
	}
}
