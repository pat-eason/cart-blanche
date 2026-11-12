import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { useState } from "react"
import { Link } from "react-router-dom"
import { Icon } from "../components/Icon"
import { Empty, Spinner, useToast } from "../components/ui"
import { api, ApiError, type Menu, type MealStatus } from "../lib/api"
import { useMenus, useRecipes } from "../lib/hooks"
import { cap, money, weekLabel, weekStartOf } from "../lib/util"

async function ensureCurrentMenu(): Promise<Menu> {
  const week = weekStartOf()
  try { return await api.menuByWeek(week) } catch (e) { if (e instanceof ApiError && e.status === 404) return api.createMenu(week); throw e }
}

export default function History() {
  const menusQ = useMenus()
  const recipesQ = useRecipes()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState<string | null>(null)
  const refresh = () => { qc.invalidateQueries({ queryKey: ["menus"] }); qc.invalidateQueries({ queryKey: ["menu"] }); qc.invalidateQueries({ queryKey: ["recipes"] }) }

  const status = useMutation({ mutationFn: ({ id, s }: { id: string; s: MealStatus }) => api.updateMeal(id, { status: s }), onSuccess: refresh })
  const avoid = useMutation({ mutationFn: ({ id, v }: { id: string; v: boolean }) => api.setAvoid(id, v), onSuccess: () => { refresh(); toast.show("Got it") } })
  const addRecipes = useMutation({
    mutationFn: async (ids: string[]) => {
      const m = await ensureCurrentMenu()
      const have = new Set(m.meals.map((x) => x.recipeId))
      let n = 0
      for (const id of ids) if (!have.has(id)) { await api.addMeal(m.id, id); n++ }
      return n
    },
    onSuccess: (n) => { refresh(); toast.show(n ? `Added ${n} to this week's menu` : "Already on this week's menu") },
  })

  const thisWeek = weekStartOf()
  const menus = (menusQ.data ?? []).filter((m) => m.weekStart < thisWeek)
  const all = menusQ.data ?? []

  // recipes whose most recent appearance was "skipped"
  const lastByRecipe = new Map<string, { status: MealStatus; name: string; week: string }>()
  for (const m of [...all].sort((a, b) => a.weekStart.localeCompare(b.weekStart)))
    for (const ml of m.meals) lastByRecipe.set(ml.recipeId, { status: ml.status, name: ml.name, week: m.weekStart })
  const recipesById = new Map((recipesQ.data ?? []).map((r) => [r.id, r]))
  const skipped = [...lastByRecipe.entries()].filter(([id, v]) => v.status === "skipped" && !recipesById.get(id)?.avoid)
  const avoided = (recipesQ.data ?? []).filter((r) => r.avoid)

  if (menusQ.isLoading) return <Spinner />
  return (
    <div className="stack" style={{ gap: "1.6rem" }}>
      <div className="page-head" style={{ marginBottom: 0 }}><div><div className="eyebrow">Step 4 · Look back</div><h1>History</h1><p className="muted">What you planned, what you actually made, and what to retire.</p></div></div>

      <div className="grid cols-2">
        <section className="sheet stacked">
          <span className="tape l" />
          <h2>Planned, never made</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>Meals you skipped last time they were on the menu.</p>
          {skipped.length === 0 ? <Empty title="You made everything!" mood="happy" /> : (
            <div className="stack tight">
              {skipped.map(([id, v]) => (
                <div key={id} className="suggest">
                  <div><b style={{ fontFamily: "var(--font-display)", color: "var(--forest)" }}>{v.name}</b><div className="small muted">skipped week of {weekLabel(v.week).split(" – ")[0]}</div></div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn small primary" onClick={() => addRecipes.mutate([id])}>Plan it</button>
                    <button className="btn small ghost danger" onClick={() => avoid.mutate({ id, v: true })} title="Never suggest this again"><Icon name="ban" size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="sheet stacked">
          <span className="tape r green" />
          <h2>Never again</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>Hidden from suggestions and the planner.</p>
          {avoided.length === 0 ? <Empty title="No retired recipes" mood="calm" /> : (
            <div className="stack tight">
              {avoided.map((r) => (
                <div key={r.id} className="suggest"><b style={{ fontFamily: "var(--font-display)" }}>{r.name}</b>
                  <button className="btn small" onClick={() => avoid.mutate({ id: r.id, v: false })}><Icon name="undo" size={14} />Restore</button></div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 style={{ marginBottom: "0.9rem" }}>Past menus</h2>
        {menus.length === 0 ? (
          <div className="sheet"><Empty title="No past weeks yet" mood="calm">Finished weeks will collect here so you can see what you cooked and reuse a favorite menu. <Link to="/plan">Plan this week</Link></Empty></div>
        ) : (
          <div className="stack">
            {menus.map((m) => (
              <motion.div key={m.id} layout className="sheet">
                <div className="row spread wrap" style={{ cursor: "pointer" }} onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <div><h3>Week of {weekLabel(m.weekStart)}</h3>
                    <div className="muted small">{m.meals.length} meals · {m.meals.filter((x) => x.status === "cooked").length} cooked · {m.meals.filter((x) => x.status === "skipped").length} skipped{m.estCost > 0 && ` · ${money(m.estCost)}`}</div></div>
                  <div className="row">
                    <button className="btn small" onClick={(e) => { e.stopPropagation(); addRecipes.mutate(m.meals.map((x) => x.recipeId)) }}><Icon name="copy" size={14} />Reuse this menu</button>
                    <Icon name={open === m.id ? "x" : "right"} size={18} />
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {open === m.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                      <div className="stack tight" style={{ paddingTop: "1rem" }}>
                        {m.meals.map((ml) => (
                          <div key={ml.id} className={`meal ${ml.status}`} style={{ gridTemplateColumns: "1fr auto" }}>
                            <div className="title">{ml.name} <span className="chip" style={{ marginLeft: 6 }}>{cap(ml.status)}</span></div>
                            <div className="row" style={{ gap: 4 }}>
                              <div className="seg">
                                {(["cooked", "skipped", "planned"] as MealStatus[]).map((s) => (
                                  <button key={s} className={ml.status === s ? "on" : ""} onClick={() => status.mutate({ id: ml.id, s })}>{s === "planned" ? "?" : cap(s)}</button>
                                ))}
                              </div>
                              <button className="btn small ghost danger icon" aria-label="Never again" title="Never again" onClick={() => avoid.mutate({ id: ml.recipeId, v: true })}><Icon name="ban" size={15} /></button>
                            </div>
                          </div>
                        ))}
                        {m.meals.length === 0 && <div className="muted small">No meals were planned.</div>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </section>
      {toast.node}
    </div>
  )
}
