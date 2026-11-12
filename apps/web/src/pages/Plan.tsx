import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Icon } from "../components/Icon"
import { Empty, Spinner, Tags } from "../components/ui"
import { api, type Meal, type Menu, type Recipe, type Suggestion } from "../lib/api"
import { useMenuCache, useMenuWeek, useRecipes, useWeekParam } from "../lib/hooks"
import { addWeeks, DAYS, MEAL_TYPES, minutesLabel, money, cap, weekLabel, weekStartOf } from "../lib/util"

export default function Plan() {
  const [week, setWeek] = useWeekParam()
  const menuQ = useMenuWeek(week)
  const recipesQ = useRecipes()
  const qc = useQueryClient()
  const setMenu = useMenuCache()
  const nav = useNavigate()
  const menu = menuQ.data

  const create = useMutation({ mutationFn: () => api.createMenu(week), onSuccess: setMenu })
  const build = useMutation({
    mutationFn: async (m: Menu) => {
      await api.generateGrocery(m.id)
      if (m.status === "draft") await api.updateMenu(m.id, { status: "shopping" })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["menu"] }); nav(`/shop${week === weekStartOf() ? "" : `?week=${week}`}`) },
  })

  const isThis = week === weekStartOf()
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Step 1 · Plan</div>
          <h1>Plan the week</h1>
        </div>
        <div className="week-switch">
          <button className="btn small icon" onClick={() => setWeek(addWeeks(week, -1))} aria-label="Previous week"><Icon name="left" size={16} /></button>
          <span className="label-w">{weekLabel(week)}</span>
          <button className="btn small icon" onClick={() => setWeek(addWeeks(week, 1))} aria-label="Next week"><Icon name="right" size={16} /></button>
          {!isThis && <button className="btn small ghost" onClick={() => setWeek(weekStartOf())}>This week</button>}
        </div>
      </div>

      {menuQ.isLoading || recipesQ.isLoading ? <Spinner /> : !menu ? (
        <div className="sheet stacked" style={{ maxWidth: 560, margin: "2rem auto" }}>
          <span className="tape" />
          <Empty title="A blank page — let's fill it" mood="happy">
            Start a menu for {weekLabel(week)}. Pick 5–6 dinners, then we'll turn them into a grocery list.
          </Empty>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn primary" onClick={() => create.mutate()} disabled={create.isPending}><Icon name="plus" size={18} />Start this menu</button>
          </div>
        </div>
      ) : (
        <div className="split">
          <MenuSheet menu={menu} week={week} onBuild={() => build.mutate(menu)} building={build.isPending} />
          <Finder menu={menu} recipes={recipesQ.data ?? []} />
        </div>
      )}
    </div>
  )
}

function MenuSheet({ menu, week, onBuild, building }: { menu: Menu; week: string; onBuild: () => void; building: boolean }) {
  const setMenu = useMenuCache()
  const upd = useMutation({ mutationFn: (b: Parameters<typeof api.updateMenu>[1]) => api.updateMenu(menu.id, b), onSuccess: setMenu })
  const [budget, setBudget] = useState<string | null>(null)
  const pct = menu.budget ? Math.min(100, (menu.estCost / menu.budget) * 100) : 0
  const over = menu.budget != null && menu.estCost > menu.budget

  return (
    <div className="stack">
      <div className="sheet stacked">
        <span className="tape l" />
        <div className="row spread" style={{ marginBottom: "0.9rem" }}>
          <div>
            <h2>{menu.meals.length ? `${menu.meals.length} meals on the menu` : "Menu is empty"}</h2>
            <span className="muted small">Week of {weekLabel(week)}</span>
          </div>
          <span className={`chip ${menu.status === "draft" ? "kraft" : menu.status === "shopping" ? "accent" : "on"}`}>{cap(menu.status)}</span>
        </div>

        <div className="stack tight">
          <AnimatePresence initial={false}>
            {menu.meals.map((m) => <MealRow key={m.id} meal={m} />)}
          </AnimatePresence>
          {menu.meals.length === 0 && <div className="slot-empty">Add meals from suggestions or your recipe box →</div>}
        </div>
      </div>

      <div className="sheet">
        <div className="row spread wrap">
          <div className="stat"><b>{money(menu.estCost)}</b><span>estimated · meals {money(menu.mealsCost)}{menu.extrasCost > 0 && ` + extras ${money(menu.extrasCost)}`}</span></div>
          <div className="field" style={{ width: 150 }}>
            <label htmlFor="budget">Budget (optional)</label>
            <input id="budget" className="input" inputMode="decimal" placeholder="$0" value={budget ?? (menu.budget ?? "")}
              onChange={(e) => setBudget(e.target.value)}
              onBlur={() => {
                if (budget === null) return
                const v = parseFloat(budget)
                if (budget.trim() === "" ) upd.mutate({ clearBudget: true })
                else if (!isNaN(v) && v >= 0) upd.mutate({ budget: v })
                setBudget(null)
              }} />
          </div>
        </div>
        {menu.budget != null && (
          <div style={{ marginTop: "0.8rem" }}>
            <div className={`progress ${over ? "over" : ""}`}><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} /></div>
            <div className="small muted" style={{ marginTop: 4 }}>{over ? `${money(menu.estCost - menu.budget)} over budget` : `${money(menu.budget - menu.estCost)} left in budget`}</div>
          </div>
        )}
        <p className="small muted" style={{ marginTop: "0.7rem" }}>Costs come from the per-ingredient prices on your <Link to="/ingredients">ingredients</Link>. Missing prices count as zero.</p>
      </div>

      <div className="row wrap">
        <button className="btn primary" onClick={onBuild} disabled={building || menu.meals.length === 0}>
          <Icon name="cart" size={18} />{menu.itemCount > 0 ? "Update grocery list" : "Build grocery list"}
        </button>
        {menu.itemCount > 0 && <span className="muted small">{menu.checkedCount}/{menu.itemCount} items checked off</span>}
      </div>
    </div>
  )
}

function MealRow({ meal }: { meal: Meal }) {
  const setMenu = useMenuCache()
  const upd = useMutation({ mutationFn: (b: Parameters<typeof api.updateMeal>[1]) => api.updateMeal(meal.id, b), onSuccess: setMenu })
  const del = useMutation({ mutationFn: () => api.deleteMeal(meal.id), onSuccess: setMenu })
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.92, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, x: 40 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }} className="meal">
      <div className={`dot ${meal.day == null ? "" : "accent"}`}>{meal.day == null ? "·" : DAYS[meal.day][0]}</div>
      <div style={{ minWidth: 0 }}>
        <div className="title">{meal.name}</div>
        <div className="row wrap small muted" style={{ gap: 8 }}>
          <select className="daysel" aria-label="Day" value={meal.day ?? ""} onChange={(e) => e.target.value === "" ? upd.mutate({ clearDay: true }) : upd.mutate({ day: +e.target.value })}>
            <option value="">Any day</option>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          {meal.minutes > 0 && <span><Icon name="clock" size={13} /> {minutesLabel(meal.minutes)}</span>}
          {meal.estCost != null && <span>{money(meal.estCost)}</span>}
          <Tags tags={meal.tags} max={2} />
        </div>
      </div>
      <button className="btn ghost icon small" aria-label={`Remove ${meal.name}`} onClick={() => del.mutate()}><Icon name="x" size={16} /></button>
    </motion.div>
  )
}

type TagState = "include" | "exclude"

function Finder({ menu, recipes }: { menu: Menu; recipes: Recipe[] }) {
  const setMenu = useMenuCache()
  const [tab, setTab] = useState<"suggest" | "all">("suggest")
  const [mealType, setMealType] = useState("dinner")
  const [tagState, setTagState] = useState<Record<string, TagState>>({})
  const [maxMin, setMaxMin] = useState(0)
  const [count, setCount] = useState(6)
  const [nonce, setNonce] = useState(0)
  const [search, setSearch] = useState("")
  const inMenu = new Set(menu.meals.map((m) => m.recipeId))

  const include = Object.keys(tagState).filter((t) => tagState[t] === "include")
  const exclude = Object.keys(tagState).filter((t) => tagState[t] === "exclude")
  const allTags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort(), [recipes])

  const recs = useQuery({
    queryKey: ["recs", mealType, include.join(), exclude.join(), maxMin, count, nonce, menu.id],
    queryFn: () => api.recommend({ count: 20, mealType, include, exclude, maxMinutes: maxMin || undefined }),
    staleTime: Infinity, enabled: tab === "suggest" && recipes.length > 0,
  })
  const add = useMutation({ mutationFn: (id: string) => api.addMeal(menu.id, id), onSuccess: setMenu })
  const suggestions: Suggestion[] = (recs.data ?? []).filter((s) => !inMenu.has(s.recipe.id)).slice(0, count)

  const cycle = (t: string) => setTagState((s) => {
    const n = { ...s }
    if (!s[t]) n[t] = "include"; else if (s[t] === "include") n[t] = "exclude"; else delete n[t]
    return n
  })

  const filtered = recipes.filter((r) => !r.avoid && (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.tags.some((t) => t.includes(search.toLowerCase()))))

  return (
    <div className="sheet kraft" style={{ position: "sticky", top: 16 }}>
      <div className="row spread" style={{ marginBottom: "0.8rem" }}>
        <h2 style={{ color: "var(--forest-deep)", whiteSpace: "nowrap" }}>Find meals</h2>
        <div className="seg">
          <button className={tab === "suggest" ? "on" : ""} onClick={() => setTab("suggest")}>Suggested</button>
          <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>Recipe box</button>
        </div>
      </div>

      {recipes.length === 0 ? (
        <Empty title="No recipes yet" mood="calm"><Link to="/recipes">Add a few recipes</Link> (or load the starter set) and suggestions will show up here.</Empty>
      ) : tab === "suggest" ? (
        <div className="stack tight">
          <div className="row wrap" style={{ gap: 6 }}>
            <select className="input" style={{ width: "auto", minHeight: 34, padding: "0.2rem 0.6rem" }} value={mealType} onChange={(e) => setMealType(e.target.value)} aria-label="Meal type">
              <option value="any">Any meal</option>
              {MEAL_TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}
            </select>
            <select className="input" style={{ width: "auto", minHeight: 34, padding: "0.2rem 0.6rem" }} value={maxMin} onChange={(e) => setMaxMin(+e.target.value)} aria-label="Max time">
              <option value={0}>Any time</option><option value={20}>≤ 20 min</option><option value={30}>≤ 30 min</option><option value={45}>≤ 45 min</option><option value={60}>≤ 1 hour</option>
            </select>
            <select className="input" style={{ width: "auto", minHeight: 34, padding: "0.2rem 0.6rem" }} value={count} onChange={(e) => setCount(+e.target.value)} aria-label="How many">
              {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} meals</option>)}
            </select>
          </div>
          {allTags.length > 0 && (
            <div>
              <div className="small" style={{ margin: "4px 0", color: "var(--forest-deep)" }}>Tap a tag to want it · tap again to avoid it</div>
              <div className="row wrap" style={{ gap: 5 }}>
                {allTags.map((t) => (
                  <button key={t} className={`chip ${tagState[t] === "include" ? "on" : tagState[t] === "exclude" ? "no" : "off"}`} onClick={() => cycle(t)}>
                    {tagState[t] === "exclude" && <Icon name="ban" size={12} />}{t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="row" style={{ margin: "6px 0" }}>
            <button className="btn small" onClick={() => setNonce((n) => n + 1)}><Icon name="shuffle" size={15} />Shuffle</button>
            <button className="btn small forest" disabled={suggestions.length === 0 || add.isPending}
              onClick={async () => { for (const s of suggestions) { const m = await api.addMeal(menu.id, s.recipe.id); setMenu(m) } }}>
              <Icon name="plus" size={15} />Add all {suggestions.length}
            </button>
          </div>
          {recs.isFetching && !recs.data ? <Spinner /> : (
            <AnimatePresence mode="popLayout">
              {suggestions.map((s, i) => (
                <motion.div key={s.recipe.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }} exit={{ opacity: 0, x: 60 }} className="suggest" style={{ marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--forest)" }}>{s.recipe.name}</div>
                    <div className="why">{s.reasons[0]}</div>
                    <div className="row wrap small muted" style={{ gap: 6 }}>
                      {s.recipe.prepMinutes + s.recipe.cookMinutes > 0 && <span>{minutesLabel(s.recipe.prepMinutes + s.recipe.cookMinutes)}</span>}
                      {s.recipe.estCost != null && <span>{money(s.recipe.estCost)}</span>}
                      <Tags tags={s.recipe.tags} max={2} />
                    </div>
                  </div>
                  <button className="btn small primary icon" aria-label={`Add ${s.recipe.name}`} onClick={() => add.mutate(s.recipe.id)}><Icon name="plus" size={16} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {!recs.isFetching && suggestions.length === 0 && <div className="slot-empty" style={{ borderColor: "var(--kraft-deep)" }}>Nothing matches these filters. Loosen them or shuffle.</div>}
        </div>
      ) : (
        <div className="stack tight">
          <input className="input" placeholder="Search recipes or tags…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ maxHeight: 520, overflow: "auto" }} className="stack tight">
            {filtered.map((r) => (
              <div key={r.id} className="suggest">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--forest)" }}>{r.name}</div>
                  <div className="row wrap small muted" style={{ gap: 6 }}>
                    <span>{cap(r.mealType)}</span>{r.estCost != null && <span>{money(r.estCost)}</span>}<Tags tags={r.tags} max={2} />
                  </div>
                </div>
                {inMenu.has(r.id) ? <span className="chip on"><Icon name="check" size={13} />Added</span> :
                  <button className="btn small primary icon" aria-label={`Add ${r.name}`} onClick={() => add.mutate(r.id)}><Icon name="plus" size={16} /></button>}
              </div>
            ))}
            {filtered.length === 0 && <div className="slot-empty">No matches.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
