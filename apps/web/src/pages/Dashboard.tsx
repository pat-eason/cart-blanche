import { useMutation, useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { Bag } from "../components/Bag"
import { Icon } from "../components/Icon"
import { Spinner } from "../components/ui"
import { api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { useMenuCache, useMenuWeek, useRecipes } from "../lib/hooks"
import { greeting, minutesLabel, money, todayIndex, weekLabel, weekStartOf, WEEKDAYS_LONG } from "../lib/util"

const fade = (i: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.07, type: "spring" as const, stiffness: 200, damping: 22 } })

export default function Dashboard() {
  const { user } = useAuth()
  const nav = useNavigate()
  const week = weekStartOf()
  const menuQ = useMenuWeek(week)
  const recipesQ = useRecipes()
  const setMenu = useMenuCache()
  const menu = menuQ.data
  const recs = useQuery({
    queryKey: ["recs", "dash", menu?.id ?? 0, menu?.meals.length ?? 0], staleTime: Infinity,
    queryFn: () => api.recommend({ count: 3 + (menu?.meals.length ?? 0), mealType: "dinner", skip: menu?.meals.map((m) => m.recipeId) }),
    enabled: !menuQ.isLoading && (recipesQ.data?.length ?? 0) > 0,
  })
  const add = useMutation({
    mutationFn: async (rid: string) => {
      const m = menu ?? await api.createMenu(week)
      return api.addMeal(m.id, rid)
    }, onSuccess: setMenu,
  })

  if (menuQ.isLoading || recipesQ.isLoading) return <Spinner />
  const today = menu?.meals.filter((m) => m.day === todayIndex(week)) ?? []
  const pct = menu && menu.itemCount ? (menu.checkedCount / menu.itemCount) * 100 : 0
  const suggestions = (recs.data ?? []).filter((s) => !menu?.meals.some((m) => m.recipeId === s.recipe.id)).slice(0, 3)
  const noRecipes = (recipesQ.data?.length ?? 0) === 0

  return (
    <div className="stack" style={{ gap: "1.4rem" }}>
      <motion.div {...fade(0)} className="page-head" style={{ marginBottom: 0 }}>
        <div><div className="eyebrow">{weekLabel(week)}</div><h1>{greeting()}, {user?.name.split(" ")[0]}.</h1><p className="muted">{WEEKDAYS_LONG[new Date().getDay()]} — what's the plan?</p></div>
      </motion.div>

      <div className="split">
        <motion.section {...fade(1)} className="sheet forest" style={{ overflow: "hidden", minHeight: 230 }}>
          <div className="eyebrow" style={{ color: "var(--kraft)" }}>This week's menu</div>
          {menu && menu.meals.length > 0 ? (
            <>
              <h2 style={{ margin: "6px 0 12px" }}>{menu.meals.length} meals · {money(menu.estCost)} est.</h2>
              <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
                {menu.meals.slice(0, 6).map((m) => <span key={m.id} className="chip" style={{ background: "rgba(238,229,212,.16)", color: "var(--paper)" }}>{m.name}</span>)}
                {menu.meals.length > 6 && <span className="chip" style={{ background: "rgba(238,229,212,.16)", color: "var(--paper)" }}>+{menu.meals.length - 6}</span>}
              </div>
              {menu.budget != null && <div className="small muted" style={{ marginBottom: 12 }}>{menu.estCost > menu.budget ? `${money(menu.estCost - menu.budget)} over` : `${money(menu.budget - menu.estCost)} under`} your {money(menu.budget)} budget</div>}
              <div className="row wrap"><Link to={`/plan?week=${week}`} className="btn primary">Edit menu</Link><Link to="/shop" className="btn">Open list</Link><Link to="/plan" className="btn ghost">Plan next week</Link></div>
            </>
          ) : (
            <>
              <h2 style={{ margin: "6px 0 8px" }}>Nothing planned yet</h2>
              <p className="muted" style={{ marginBottom: 14, maxWidth: 330 }}>Pick 5–6 dinners and we'll build the grocery list from them.</p>
              <Link to={`/plan?week=${week}`} className="btn primary"><Icon name="plus" size={16} />Plan this week</Link>
            </>
          )}
          <Bag mood={menu?.meals.length ? "full" : "happy"} size={120} className="hero-bag wobble" />
        </motion.section>

        <motion.section {...fade(2)} className="sheet stacked">
          <span className="tape" />
          <div className="row spread"><h2>Grocery run</h2>{menu && menu.itemCount > 0 && <span className="chip accent">{menu.checkedCount}/{menu.itemCount}</span>}</div>
          {menu && menu.itemCount > 0 ? (
            <>
              <div className="progress" style={{ margin: "14px 0 8px" }}><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} /></div>
              <p className="muted small" style={{ marginBottom: 12 }}>{menu.itemCount - menu.checkedCount} items left to grab.</p>
              <Link to="/shop" className="btn forest"><Icon name="cart" size={16} />Start shopping</Link>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: "8px 0 12px" }}>{menu && menu.meals.length ? "Your menu is ready — turn it into a list." : "Your list appears once you've planned some meals."}</p>
              {menu && menu.meals.length > 0 && <button className="btn primary" onClick={async () => { await api.generateGrocery(menu.id); nav("/shop") }}>Build grocery list</button>}
            </>
          )}
        </motion.section>
      </div>

      {today.length > 0 && (
        <motion.section {...fade(3)} className="sheet kraft row spread wrap">
          <div><div className="eyebrow" style={{ color: "var(--forest-deep)" }}>Tonight</div><h2 style={{ color: "var(--forest-deep)" }}>{today.map((t) => t.name).join(" & ")}</h2></div>
          {today[0].minutes > 0 && <span className="chip on"><Icon name="clock" size={13} />{minutesLabel(today[0].minutes)}</span>}
        </motion.section>
      )}

      <motion.section {...fade(4)}>
        <div className="row spread" style={{ marginBottom: 10 }}><h2>Suggested for you</h2><Link to="/plan" className="small">More in the planner →</Link></div>
        {noRecipes ? (
          <div className="sheet row wrap"><Bag mood="calm" size={70} /><div className="grow"><b>Start with a few recipes</b><div className="muted small">Suggestions learn from what you cook. Add your own or load a starter set.</div></div><Link to="/recipes" className="btn">Open recipes</Link></div>
        ) : (
          <div className="grid cols-3">
            {suggestions.map((s, i) => (
              <motion.div key={s.recipe.id} className="sheet stacked stack tight" whileHover={{ y: -4, rotate: i % 2 ? 0.6 : -0.6 }}>
                <span className={`tape ${i % 2 ? "green r" : "l"}`} />
                <h3>{s.recipe.name}</h3>
                <div className="hand" style={{ fontSize: "1.25rem", color: "var(--tomato-deep)", lineHeight: 1.05 }}>{s.reasons[0]}</div>
                <div className="row spread" style={{ marginTop: 6 }}>
                  <span className="small muted">{s.recipe.estCost != null ? money(s.recipe.estCost) : ""} {s.recipe.prepMinutes + s.recipe.cookMinutes > 0 && `· ${minutesLabel(s.recipe.prepMinutes + s.recipe.cookMinutes)}`}</span>
                  <button className="btn small primary" onClick={() => add.mutate(s.recipe.id)} disabled={add.isPending}><Icon name="plus" size={14} />Add</button>
                </div>
              </motion.div>
            ))}
            {suggestions.length === 0 && <div className="sheet muted">You've added every suggestion — nice. Shuffle for more in the planner.</div>}
          </div>
        )}
      </motion.section>
    </div>
  )
}
