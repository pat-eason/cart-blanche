import { Link } from "react-router-dom"
import { setSettings, useSettings } from "../lib/settings"

export default function SettingsPage() {
  const s = useSettings()
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
        <div className="small muted">Saved on this device.</div>
      </div>
    </div>
  )
}
