import { useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { Icon } from "../components/Icon"
import { Empty, Spinner } from "../components/ui"
import { api, type Meal, type MealStatus, type Menu } from "../lib/api"
import { useMenuCache, useMenuWeek, useWeekParam } from "../lib/hooks"
import { addWeeks, dayNames, minutesLabel, planWeek, todayIndex, weekLabel, weekStartOf } from "../lib/util"

/** Step 4: the week's menu as a checklist — cross meals off as you cook them. */
export default function MenuPage() {
  const [week, setWeek] = useWeekParam()
  const menuQ = useMenuWeek(week)
  const menu = menuQ.data
  const qc = useQueryClient()
  const setMenu = useMenuCache()

  const setStatus = useMutation({
    mutationFn: ({ meal, status }: { meal: Meal; status: MealStatus }) => api.updateMeal(meal.id, { status }),
    onMutate: async ({ meal, status }) => {
      await qc.cancelQueries({ queryKey: ["menu", week] })
      const prev = qc.getQueryData<Menu | null>(["menu", week])
      if (prev) qc.setQueryData<Menu>(["menu", week], { ...prev, meals: prev.meals.map((m) => m.id === meal.id ? { ...m, status } : m) })
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["menu", week], ctx.prev),
    onSuccess: setMenu,
  })

  const meals = menu?.meals ?? []
  const cooked = meals.filter((m) => m.status === "cooked").length
  const skipped = meals.filter((m) => m.status === "skipped").length
  const left = meals.length - cooked - skipped
  const pct = meals.length ? ((cooked + skipped) / meals.length) * 100 : 0
  const days = dayNames(week, true)
  const today = todayIndex(week)
  const groups = [
    ...days.map((d, i) => ({ key: String(i), label: d, today: i === today, meals: meals.filter((m) => m.day === i) })),
    { key: "any", label: "Any day", today: false, meals: meals.filter((m) => m.day == null) },
  ].filter((g) => g.meals.length > 0)
  const rel = week === weekStartOf() ? "This week" : week === planWeek() ? "Next week" : null
  const qs = week === weekStartOf() ? "" : `?week=${week}`

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Step 4 · Cook</div>
          <h1>{rel ? `${rel}'s menu` : "The week's menu"}</h1>
        </div>
        <div className="week-switch">
          <button className="btn small icon" onClick={() => setWeek(addWeeks(week, -1))} aria-label="Previous week"><Icon name="left" size={16} /></button>
          <span className="label-w">{weekLabel(week)}</span>
          <button className="btn small icon" onClick={() => setWeek(addWeeks(week, 1))} aria-label="Next week"><Icon name="right" size={16} /></button>
          {week !== weekStartOf() && <button className="btn small ghost" onClick={() => setWeek(weekStartOf())}>This week</button>}
        </div>
      </div>

      {menuQ.isLoading ? <Spinner /> : !menu || meals.length === 0 ? (
        <div className="sheet stacked" style={{ maxWidth: 520, margin: "2rem auto" }}>
          <span className="tape" />
          <Empty title="Nothing on the menu yet" mood="calm">Plan some meals for this week and they'll show up here to cross off.</Empty>
          <div className="row" style={{ justifyContent: "center" }}><Link className="btn primary" to={`/plan${qs}`}>Plan the menu</Link></div>
        </div>
      ) : (
        <div className="stack" style={{ maxWidth: 640, margin: "0 auto" }}>
          <div className="sheet">
            <div className="row spread wrap">
              <div className="stat"><b>{left === 0 ? "All done!" : `${left} to go`}</b><span>{cooked} cooked{skipped > 0 && ` · ${skipped} skipped`} of {meals.length}</span></div>
              <div className="row wrap" style={{ gap: 8 }}>
                <Link to={`/plan${qs}`} className="btn small"><Icon name="calendar" size={15} />Edit menu</Link>
                <Link to={`/shop${qs}`} className="btn small"><Icon name="cart" size={15} />Grocery list{menu.itemCount > 0 && ` (${menu.checkedCount}/${menu.itemCount})`}</Link>
              </div>
            </div>
            <div className="progress" style={{ marginTop: "0.8rem" }}><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} /></div>
          </div>

          {groups.map((g) => (
            <section key={g.key} className="stack tight">
              <div className="row" style={{ gap: 8 }}>
                <h3>{g.label}</h3>{g.today && <span className="chip accent">Today</span>}
              </div>
              {g.meals.map((m) => (
                <MealCheck key={m.id} meal={m} onSet={(status) => setStatus.mutate({ meal: m, status })} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function MealCheck({ meal, onSet }: { meal: Meal; onSet: (s: MealStatus) => void }) {
  const cooked = meal.status === "cooked"
  const skipped = meal.status === "skipped"
  const toggle = () => onSet(cooked ? "planned" : "cooked")
  return (
    <div className={`meal ${meal.status}`}>
      <button className={`meal-box ${cooked ? "on" : ""}`} role="checkbox" aria-checked={cooked} aria-label={`${meal.name} cooked`} onClick={toggle} disabled={skipped}>
        {cooked && <Icon name="check" size={18} stroke={3.4} />}
      </button>
      <div style={{ minWidth: 0 }}>
        <div className="title"><Link to={`/recipes/${meal.recipeId}`} style={{ color: "inherit", textDecoration: "none" }}>{meal.name}</Link></div>
        <div className="row wrap small muted" style={{ gap: 8 }}>
          <span>{meal.slot[0].toUpperCase() + meal.slot.slice(1)}</span>
          {meal.minutes > 0 && <span><Icon name="clock" size={13} /> {minutesLabel(meal.minutes)}</span>}
          {skipped && <span>skipped</span>}
        </div>
      </div>
      {skipped
        ? <button className="btn ghost small" onClick={() => onSet("planned")}><Icon name="undo" size={14} />Undo</button>
        : !cooked && <button className="btn ghost small" onClick={() => onSet("skipped")}>Skip</button>}
    </div>
  )
}
