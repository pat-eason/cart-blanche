import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { api } from "../lib/api"
import { useHouseholdConfig } from "../lib/hooks"
import { setSettings, useSettings } from "../lib/settings"
import { WEEKDAYS_LONG } from "../lib/util"

export default function SettingsPage() {
  const s = useSettings()
  const qc = useQueryClient()
  const cfg = useHouseholdConfig()
  const save = useMutation({
    mutationFn: (day: number) => api.updateHouseholdConfig({ shopping_day: String(day) }),
    onSuccess: (c) => qc.setQueryData(["household-config"], c),
  })
  return (
    <div className="stack">
      <div className="page-head"><div><Link to="/more" className="small muted" style={{ textDecoration: "none" }}>← More</Link><h1>Settings</h1></div></div>
      <div className="sheet stack">
        <label className="row" style={{ gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={s.fractions} onChange={(e) => setSettings({ fractions: e.target.checked })} style={{ marginTop: 4 }} />
          <span>
            <b>Show quantities as fractions</b>
            <div className="muted small">
              Quantities are always stored as decimals. With this on, 0.333 reads as 1/3 and 1.5 as 1 1/2; off shows plain decimals.
              You can type either way in recipes (1/3, 1 1/2, 0.25).
            </div>
          </span>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <b>Shopping day</b>
          <select value={s.shoppingDay} disabled={save.isPending || !cfg.data} onChange={(e) => save.mutate(+e.target.value)} style={{ maxWidth: 200 }}>
            {WEEKDAYS_LONG.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <div className="muted small">
            Your week starts on this day. The week before is for planning the next one, so Plan opens on next week.
            Shared by everyone in your household. Existing menus keep the dates they were created with.
          </div>
          {save.isError && <div className="small" style={{ color: "var(--tomato, #b3402f)" }}>Couldn't save that — try again.</div>}
        </label>
        <div className="small muted">Quantity display is saved on this device.</div>
      </div>
    </div>
  )
}
