import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Bag } from "../components/Bag"
import { Icon } from "../components/Icon"
import { Empty, Spinner } from "../components/ui"
import { api, type Grocery, type GroceryItem, type Menu } from "../lib/api"
import { useGrocery, useMenuCache, useMenuWeek, useWeekParam } from "../lib/hooks"
import { useSettings } from "../lib/settings"
import { parseQty } from "../lib/units"
import { addWeeks, CATEGORIES, money, qty, weekLabel, weekStartOf } from "../lib/util"

export default function Shop() {
  const [week, setWeek] = useWeekParam()
  const menuQ = useMenuWeek(week)
  const menu = menuQ.data
  const groceryQ = useGrocery(menu?.id)
  const qc = useQueryClient()
  const setMenu = useMenuCache()
  const [hideDone, setHideDone] = useState(false)

  const setGrocery = (g: Grocery) => qc.setQueryData(["grocery", menu?.id], g)
  const afterChange = (g: Grocery) => { setGrocery(g); qc.invalidateQueries({ queryKey: ["menu", week] }) }

  const gen = useMutation({
    mutationFn: async () => {
      const g = await api.generateGrocery(menu!.id)
      if (menu!.status === "draft") setMenu(await api.updateMenu(menu!.id, { status: "shopping" }))
      return g
    },
    onSuccess: afterChange,
  })
  const toggle = useMutation({
    mutationFn: (it: GroceryItem) => api.updateItem(it.id, { checked: !it.checked }),
    onMutate: async (it) => {
      await qc.cancelQueries({ queryKey: ["grocery", menu?.id] })
      const prev = qc.getQueryData<Grocery>(["grocery", menu?.id])
      if (prev) qc.setQueryData<Grocery>(["grocery", menu?.id], { ...prev, items: prev.items.map((x) => x.id === it.id ? { ...x, checked: !x.checked } : x) })
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && setGrocery(ctx.prev),
    onSuccess: afterChange,
  })
  const finish = useMutation({ mutationFn: () => api.updateMenu(menu!.id, { status: "complete" }), onSuccess: setMenu })

  const g = groceryQ.data
  const items = g?.items ?? []
  const done = items.filter((i) => i.checked).length
  const remaining = items.length - done
  const allDone = items.length > 0 && remaining === 0
  const visible = hideDone ? items.filter((i) => !i.checked) : items
  const cats = [...new Set(visible.map((i) => i.category))].sort((a, b) => {
    const ia = CATEGORIES.indexOf(a), ib = CATEGORIES.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })

  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Steps 2 &amp; 3 · List &amp; shop</div><h1>Grocery list</h1></div>
        <div className="week-switch">
          <button className="btn small icon" onClick={() => setWeek(addWeeks(week, -1))} aria-label="Previous week"><Icon name="left" size={16} /></button>
          <span className="label-w">{weekLabel(week)}</span>
          <button className="btn small icon" onClick={() => setWeek(addWeeks(week, 1))} aria-label="Next week"><Icon name="right" size={16} /></button>
          {week !== weekStartOf() && <button className="btn small ghost" onClick={() => setWeek(weekStartOf())}>This week</button>}
        </div>
      </div>

      {menuQ.isLoading ? <Spinner /> : !menu ? (
        <div className="sheet stacked" style={{ maxWidth: 520, margin: "2rem auto" }}>
          <span className="tape" />
          <Empty title="No menu for this week yet" mood="calm">Plan a few meals first — your list is built from the menu.</Empty>
          <div className="row" style={{ justifyContent: "center" }}><Link className="btn primary" to={`/plan${week === weekStartOf() ? "" : `?week=${week}`}`}>Plan the menu</Link></div>
        </div>
      ) : (
        <div className="pad-wrap">
          <div className="zig-wrap">
            <div className="zig" style={{ background: "#fbf7ec", borderRadius: "10px 10px 0 0" }}>
              <div className="pad-top" aria-hidden="true">{Array.from({ length: 9 }).map((_, i) => <i key={i} />)}</div>
              <div className="pad" style={{ paddingTop: 22 }}>
                <div className="pad-head">
                  <div className="pad-title">This week's list</div>
                  <div className="row wrap small muted" style={{ gap: 10, marginTop: 2 }}>
                    <span>{done} of {items.length} in the cart</span>
                    <button className="chip off" onClick={() => setHideDone((h) => !h)}>{hideDone ? "Show checked" : "Hide checked"}</button>
                  </div>
                </div>

                {g && items.length === 0 && (
                  <div style={{ padding: "1rem 1rem 1rem 74px" }}>
                    <div className="hand" style={{ fontSize: "1.6rem", color: "var(--forest)" }}>
                      {menu.meals.length ? "Nothing here yet…" : "Add meals to the menu first."}
                    </div>
                    {menu.meals.length > 0 ? (
                      <button className="btn primary" style={{ marginTop: 8 }} onClick={() => gen.mutate()} disabled={gen.isPending}>Build list from {menu.meals.length} meals</button>
                    ) : <Link to="/plan" className="btn" style={{ marginTop: 8 }}>Go to planner</Link>}
                  </div>
                )}

                {cats.map((cat) => (
                  <section key={cat}>
                    <div className="pad-cat"><span>{cat}</span><span className="muted" style={{ letterSpacing: 0, fontWeight: 600 }}>{visible.filter((i) => i.category === cat && i.checked).length}/{visible.filter((i) => i.category === cat).length}</span></div>
                    <AnimatePresence initial={false}>
                      {visible.filter((i) => i.category === cat).map((it) => (
                        <Row key={it.id} item={it} onToggle={() => toggle.mutate(it)} onChange={afterChange} />
                      ))}
                    </AnimatePresence>
                  </section>
                ))}

                {menu && <AddItem menu={menu} onAdded={afterChange} />}
              </div>
              <div className="pad-foot">
                <div>
                  <div className="small muted">{g && g.total > 0 ? `${money(g.remaining)} left to buy` : "Add prices to see totals"}</div>
                  <div className="total">{money(g?.total ?? 0)}</div>
                </div>
                <div className="row">
                  {menu.meals.length > 0 && items.length > 0 && <button className="btn small" onClick={() => gen.mutate()} disabled={gen.isPending} title="Re-sync with the menu (keeps your checkmarks and extras)"><Icon name="undo" size={14} />Sync menu</button>}
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {allDone && (
              <motion.div className="sheet forest row" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 28 }}>
                <Bag mood="full" size={70} className="wobble" />
                <div className="grow"><h3>Everything's in the cart!</h3><div className="muted small">Nice work. Mark this trip complete to move it into your history.</div></div>
                {menu.status !== "complete" ? <button className="btn primary" onClick={() => finish.mutate()}>Complete</button> : <span className="chip on">Completed</span>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function Row({ item, onToggle, onChange }: { item: GroceryItem; onToggle: () => void; onChange: (g: Grocery) => void }) {
  useSettings()
  const [open, setOpen] = useState(false)
  const [cost, setCost] = useState(item.unitCost == null ? "" : String(item.unitCost))
  const [q, setQ] = useState(qty(item.quantity))
  const upd = useMutation({ mutationFn: (b: Parameters<typeof api.updateItem>[1]) => api.updateItem(item.id, b), onSuccess: onChange })
  const del = useMutation({ mutationFn: () => api.deleteItem(item.id), onSuccess: onChange })
  const line = item.unitCost != null ? item.unitCost * item.quantity : null
  return (
    <motion.div layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
      <div className={`pad-row ${item.checked ? "done" : ""}`} onClick={onToggle} role="checkbox" aria-checked={item.checked} tabIndex={0}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle() } }}>
        <div className="box">
          <AnimatePresence>
            {item.checked && (
              <motion.svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </motion.svg>
            )}
          </AnimatePresence>
        </div>
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" }}>
          <span className="name">{item.name}<i className="strike" /></span>
          {(item.source === "extra" || item.checkedBy) && (
            <span className="sub">{item.source === "extra" ? "off-menu" : ""}{item.source === "extra" && item.checked && item.checkedBy ? " · " : ""}{item.checked && item.checkedBy ? `got by ${item.checkedBy}` : ""}</span>
          )}
        </div>
        <div className="meta">
          <span>{qty(item.quantity)}{item.unit ? ` ${item.unit}` : ""}</span>
          {line != null && <span className="cost">{money(line)}</span>}
          <button className="btn ghost icon small" aria-label={`Edit ${item.name}`} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}><Icon name="more" size={16} /></button>
        </div>
      </div>
      {open && (
        <div className="pad-edit" onClick={(e) => e.stopPropagation()}>
          <div className="field"><label>Qty</label><input className="input num" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { const v = parseQty(q); if (v > 0 && v !== item.quantity) upd.mutate({ quantity: v }) }} /></div>
          <div className="field"><label>Cost each</label><input className="input num" inputMode="decimal" placeholder="—" value={cost} onChange={(e) => setCost(e.target.value)}
            onBlur={() => { if (cost.trim() === "") { if (item.unitCost != null) upd.mutate({ clearCost: true }) } else { const v = parseFloat(cost); if (!isNaN(v) && v >= 0 && v !== item.unitCost) upd.mutate({ unitCost: v }) } }} /></div>
          <button className="btn small danger" onClick={() => del.mutate()}><Icon name="trash" size={14} />Remove</button>
        </div>
      )}
    </motion.div>
  )
}

function AddItem({ menu, onAdded }: { menu: Menu; onAdded: (g: Grocery) => void }) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState("Household")
  const [q, setQ] = useState("1")
  const [cost, setCost] = useState("")
  const add = useMutation({
    mutationFn: () => api.addItem(menu.id, { name, category, quantity: parseQty(q) || 1, unitCost: cost.trim() === "" ? null : parseFloat(cost) }),
    onSuccess: (g) => { onAdded(g); setName(""); setQ("1"); setCost("") },
  })
  const submit = (e: FormEvent) => { e.preventDefault(); if (name.trim()) add.mutate() }
  return (
    <form className="pad-add" onSubmit={submit}>
      <input className="input" style={{ gridColumn: "1 / -1" }} placeholder="＋ Add something off-menu (laundry soap, chips…)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Item name" />
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      <input className="input" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Quantity" placeholder="Qty" />
      <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Cost each" placeholder="$ each" />
      <button className="btn forest" disabled={!name.trim() || add.isPending}><Icon name="plus" size={16} />Add</button>
    </form>
  )
}
