import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Empty, HBars, Spinner, StackedBars } from "../components/ui"
import { api } from "../lib/api"
import { cap, money, shortWeek } from "../lib/util"

const PALETTE = ["#1d4a35", "#f2462e", "#d4a763", "#7fa88a", "#b9553f", "#4f7f6a", "#e6c27a", "#8c6a3f", "#c9b99a", "#6a2f23"]

export default function Trends() {
  const [weeks, setWeeks] = useState(12)
  const q = useQuery({ queryKey: ["stats", weeks], queryFn: () => api.stats(weeks) })
  if (q.isLoading) return <Spinner />
  const s = q.data!
  const hasData = s.weekly.length > 0 && s.weekly.some((w) => w.meals > 0 || w.items > 0)

  const cats = [...new Set(s.weekly.flatMap((w) => Object.keys(w.byCategory)))].sort()
  const catColors = Object.fromEntries(cats.map((c, i) => [c, PALETTE[i % PALETTE.length]]))
  const totalCooked = s.weekly.reduce((a, w) => a + w.cooked, 0)
  const totalMeals = s.weekly.reduce((a, w) => a + w.meals, 0)
  const spend = s.weekly.reduce((a, w) => a + w.mealsCost + w.extrasCost, 0)
  const avg = s.weekly.length ? spend / s.weekly.length : 0

  return (
    <div className="stack" style={{ gap: "1.4rem" }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><div className="eyebrow">Patterns</div><h1>Trends</h1><p className="muted">What you cook, what you buy, and what it costs.</p></div>
        <div className="seg">{[8, 12, 26].map((n) => <button key={n} className={weeks === n ? "on" : ""} onClick={() => setWeeks(n)}>{n} wks</button>)}</div>
      </div>

      {!hasData ? <div className="sheet"><Empty title="Not enough history yet" mood="calm">Plan a couple of weeks and your trends will show up here.</Empty></div> : (
        <>
          <div className="grid cols-3">
            <div className="sheet forest stat"><b>{totalMeals}</b><span>meals planned</span></div>
            <div className="sheet stat"><b>{totalMeals ? Math.round((totalCooked / totalMeals) * 100) : 0}%</b><span>marked as cooked</span></div>
            <div className="sheet stat"><b>{money(Math.round(avg))}</b><span>avg weekly estimate</span></div>
          </div>

          <div className="grid cols-2">
            <section className="sheet">
              <h2>Weekly spend</h2>
              <p className="muted small" style={{ marginBottom: 8 }}>Estimated from ingredient prices. Red ticks mark each week's budget.</p>
              <StackedBars data={s.weekly.map((w) => ({ label: shortWeek(w.weekStart), values: { meals: Math.round(w.mealsCost), extras: Math.round(w.extrasCost) }, marker: w.budget }))}
                keys={["meals", "extras"]} colors={{ meals: "#1d4a35", extras: "#d4a763" }} fmt={(n) => "$" + n} />
              <div className="legend"><span><i style={{ background: "#1d4a35" }} />Meals</span><span><i style={{ background: "#d4a763" }} />Off-menu extras</span></div>
            </section>
            <section className="sheet">
              <h2>Planned vs. cooked</h2>
              <p className="muted small" style={{ marginBottom: 8 }}>Mark meals in History to see what actually happens.</p>
              <StackedBars data={s.weekly.map((w) => ({ label: shortWeek(w.weekStart), values: { cooked: w.cooked, skipped: w.skipped, open: Math.max(0, w.meals - w.cooked - w.skipped) } }))}
                keys={["cooked", "skipped", "open"]} colors={{ cooked: "#1d4a35", skipped: "#f2462e", open: "#d9ccb0" }} />
              <div className="legend"><span><i style={{ background: "#1d4a35" }} />Cooked</span><span><i style={{ background: "#f2462e" }} />Skipped</span><span><i style={{ background: "#d9ccb0" }} />Not marked</span></div>
            </section>
          </div>

          <section className="sheet">
            <h2>Grocery list makeup</h2>
            <p className="muted small" style={{ marginBottom: 8 }}>Items per aisle, week over week.</p>
            <StackedBars height={220} data={s.weekly.map((w) => ({ label: shortWeek(w.weekStart), values: w.byCategory }))} keys={cats} colors={catColors} />
            <div className="legend">{cats.map((c) => <span key={c}><i style={{ background: catColors[c] }} />{c}</span>)}</div>
          </section>

          <div className="grid cols-3">
            <section className="sheet"><h3 style={{ marginBottom: 8 }}>Most-planned meals</h3>{s.topRecipes.length ? <HBars items={s.topRecipes} /> : <p className="muted">—</p>}</section>
            <section className="sheet"><h3 style={{ marginBottom: 8 }}>Favorite tags</h3>{s.tags.length ? <HBars accent items={s.tags.slice(0, 8)} /> : <p className="muted">—</p>}</section>
            <section className="sheet"><h3 style={{ marginBottom: 8 }}>By meal type</h3><HBars items={s.mealTypes.map((m) => ({ name: cap(m.name), count: m.count }))} />
              <h3 style={{ margin: "1rem 0 8px" }}>Spend by aisle</h3>
              <HBars accent items={s.categories.filter((c) => c.cost > 0).slice(0, 6).map((c) => ({ name: c.name, count: Math.round(c.cost) }))} fmt={(n) => "$" + n} /></section>
          </div>
        </>
      )}
    </div>
  )
}
