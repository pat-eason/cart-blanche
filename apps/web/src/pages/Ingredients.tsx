import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { Icon } from "../components/Icon"
import { Empty, Spinner } from "../components/ui"
import { api, ApiError, type Ingredient } from "../lib/api"
import { useIngredients } from "../lib/hooks"
import { CATEGORIES } from "../lib/util"

export default function Ingredients() {
  const q = useIngredients()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [err, setErr] = useState("")
  const [name, setName] = useState("")
  const [unit, setUnit] = useState("")
  const [category, setCategory] = useState("Produce")
  const [cost, setCost] = useState("")
  const done = () => { setErr(""); qc.invalidateQueries({ queryKey: ["ingredients"] }); qc.invalidateQueries({ queryKey: ["recipes"] }) }
  const fail = (e: unknown) => setErr(e instanceof ApiError ? e.message : "Something went wrong")
  const create = useMutation({
    mutationFn: () => api.createIngredient({ name, unit, category, unitCost: cost.trim() === "" ? null : parseFloat(cost) }),
    onSuccess: () => { done(); setName(""); setUnit(""); setCost("") }, onError: fail,
  })
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate() }
  const list = (q.data ?? []).filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Your catalog</div><h1>Ingredients</h1><p className="muted">Everything you shop for. Set an optional price per unit and meal costs add up automatically.</p></div></div>
      {err && <div className="error" role="alert" style={{ marginBottom: "1rem" }}>{err}</div>}
      <form className="sheet row wrap" style={{ marginBottom: "1.4rem", alignItems: "flex-end" }} onSubmit={submit}>
        <div className="field grow" style={{ minWidth: 160 }}><label htmlFor="in">New ingredient</label><input id="in" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Red onion" required /></div>
        <div className="field"><label htmlFor="iu">Unit</label><input id="iu" className="input" style={{ width: 90 }} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lb, pc…" /></div>
        <div className="field"><label htmlFor="ic">Aisle</label><select id="ic" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="ip">$ / unit</label><input id="ip" className="input" style={{ width: 90 }} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="optional" /></div>
        <button className="btn forest" disabled={create.isPending}><Icon name="plus" size={16} />Add</button>
      </form>
      <div className="sheet">
        <input className="input" style={{ maxWidth: 280, marginBottom: "0.8rem" }} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {q.isLoading ? <Spinner /> : list.length === 0 ? <Empty title="No ingredients yet" mood="calm">Add some above, or create them while writing a recipe.</Empty> : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Unit</th><th>Aisle</th><th>$ / unit</th><th /></tr></thead>
              <tbody>{list.map((i) => <Row key={i.id} ing={i} onDone={done} onFail={fail} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ ing, onDone, onFail }: { ing: Ingredient; onDone: () => void; onFail: (e: unknown) => void }) {
  const [v, setV] = useState({ name: ing.name, unit: ing.unit, category: ing.category, cost: ing.unitCost == null ? "" : String(ing.unitCost) })
  const dirty = v.name !== ing.name || v.unit !== ing.unit || v.category !== ing.category || v.cost !== (ing.unitCost == null ? "" : String(ing.unitCost))
  const save = useMutation({
    mutationFn: () => api.updateIngredient({ ...ing, name: v.name, unit: v.unit, category: v.category, unitCost: v.cost.trim() === "" ? null : parseFloat(v.cost) }),
    onSuccess: onDone, onError: onFail,
  })
  const del = useMutation({ mutationFn: () => api.deleteIngredient(ing.id), onSuccess: onDone, onError: onFail })
  return (
    <tr>
      <td><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Name" /></td>
      <td><input className="input" style={{ width: 80 }} value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} aria-label="Unit" /></td>
      <td><select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} aria-label="Aisle">{[...new Set([...CATEGORIES, ing.category])].map((c) => <option key={c}>{c}</option>)}</select></td>
      <td><input className="input" style={{ width: 80 }} inputMode="decimal" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} aria-label="Cost per unit" /></td>
      <td style={{ whiteSpace: "nowrap" }}>
        {dirty && <button className="btn small forest" onClick={() => save.mutate()}>Save</button>}{" "}
        <button className="btn ghost small icon danger" aria-label={`Delete ${ing.name}`} onClick={() => del.mutate()}><Icon name="trash" size={15} /></button>
      </td>
    </tr>
  )
}
