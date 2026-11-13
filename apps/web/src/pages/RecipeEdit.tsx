import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Icon } from "../components/Icon"
import { Spinner, TagInput, UnitSelect, useConfirm, useToast } from "../components/ui"
import { api, ApiError, type Ingredient, type RecipeInput } from "../lib/api"
import { useIngredients } from "../lib/hooks"
import { useSettings } from "../lib/settings"
import { parseQty } from "../lib/units"
import { CATEGORIES, cap, MEAL_TYPES, money, qty } from "../lib/util"

/** How many of `to` one `from` is (1 when they aren't comparable). Mirrors the server's conversion for the cost estimate. */
function unitRatio(from: string, to: string): number {
  if (!from || !to || from === to) return 1
  const vol: Record<string, number> = { tsp: 4.92892, tbsp: 14.7868, "fl oz": 29.5735, cup: 236.588, pint: 473.176, quart: 946.353, gallon: 3785.41, ml: 1, l: 1000 }
  const wt: Record<string, number> = { oz: 28.3495, lb: 453.592, g: 1, kg: 1000 }
  for (const t of [vol, wt]) if (t[from] && t[to]) return t[from] / t[to]
  return 1
}

interface Line { ingredientId: string; quantity: string; unit: string; note: string }

export default function RecipeEdit() {
  const { id } = useParams()
  const editing = !!id
  const nav = useNavigate()
  const qc = useQueryClient()
  const ingsQ = useIngredients()
  const recipeQ = useQuery({ queryKey: ["recipe", id], queryFn: () => api.recipe(id!), enabled: editing })

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [mealType, setMealType] = useState("dinner")
  const [tags, setTags] = useState<string[]>([])
  const [prep, setPrep] = useState("0")
  const [cook, setCook] = useState("0")
  const [servings, setServings] = useState("4")
  const [instructions, setInstructions] = useState("")
  const [lines, setLines] = useState<Line[]>([])
  const toast = useToast()
  const confirm = useConfirm()
  const loaded = useRef(false)
  useSettings() // re-render when the fractions preference changes

  useEffect(() => {
    const r = recipeQ.data
    if (!r || loaded.current) return
    loaded.current = true
    setName(r.name); setDescription(r.description); setMealType(r.mealType); setTags(r.tags)
    setPrep(String(r.prepMinutes)); setCook(String(r.cookMinutes)); setServings(String(r.servings)); setInstructions(r.instructions)
    setLines(r.ingredients.map((i) => ({ ingredientId: i.ingredientId, quantity: qty(i.quantity), unit: i.unit, note: i.note })))
  }, [recipeQ.data])

  const ings = ingsQ.data ?? []
  const byId = useMemo(() => new Map(ings.map((i) => [i.id, i])), [ings])
  const cost = lines.reduce((a, l) => { const i = byId.get(l.ingredientId); return i?.unitCost != null ? a + i.unitCost * (parseQty(l.quantity) || 0) * unitRatio(l.unit, i.unit) : a }, 0)

  const save = useMutation({
    mutationFn: () => {
      const body: RecipeInput = {
        name, description, mealType, tags, servings: parseInt(servings) || 2,
        prepMinutes: parseInt(prep) || 0, cookMinutes: parseInt(cook) || 0, instructions,
        ingredients: lines.map((l) => ({ ingredientId: l.ingredientId, quantity: parseQty(l.quantity) || 1, unit: l.unit, note: l.note })),
      }
      return editing ? api.updateRecipe(id!, body) : api.createRecipe(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); qc.invalidateQueries({ queryKey: ["recipe"] }); nav("/recipes") },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save"),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteRecipe(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); nav("/recipes") },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't delete"),
  })
  const avoid = useMutation({
    mutationFn: (v: boolean) => api.setAvoid(id!, v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); qc.invalidateQueries({ queryKey: ["recipe", id] }) },
  })

  if (editing && recipeQ.isLoading) return <Spinner />
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const bad = lines.find((l) => isNaN(parseQty(l.quantity)))
    if (bad) { toast.error(`"${bad.quantity}" isn't a valid quantity. Try 2, 0.5 or 1/3.`); return }
    save.mutate()
  }

  return (
    <form onSubmit={submit}>
      <div className="page-head">
        <div>
          <Link to="/recipes" className="small muted" style={{ textDecoration: "none" }}>← Recipes</Link>
          <h1>{editing ? "Edit recipe" : "New recipe"}</h1>
        </div>
        <div className="row wrap">
          {editing && <button type="button" className="btn small" onClick={() => avoid.mutate(!recipeQ.data?.avoid)}><Icon name="ban" size={14} />{recipeQ.data?.avoid ? "Allow again" : "Never again"}</button>}
          {editing && <button type="button" className="btn small danger" onClick={async () => { if (await confirm.ask({ title: "Delete this recipe?", message: "It will be removed from your recipes and any menus. This can't be undone.", confirmLabel: "Delete", danger: true })) remove.mutate() }}><Icon name="trash" size={14} />Delete</button>}
          <button className="btn primary" disabled={save.isPending || !name.trim()}><Icon name="check" size={18} />Save recipe</button>
        </div>
      </div>
      {toast.node}{confirm.node}

      <div className="split">
        <div className="stack">
          <div className="sheet stacked stack">
            <span className="tape" />
            <div className="field"><label htmlFor="rname">Name</label><input id="rname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sheet-pan fajitas" required autoFocus={!editing} /></div>
            <div className="field"><label htmlFor="rdesc">Short description</label><input id="rdesc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="row wrap" style={{ alignItems: "flex-end" }}>
              <div className="field"><label htmlFor="rtype">Meal</label>
                <select id="rtype" className="input" value={mealType} onChange={(e) => setMealType(e.target.value)}>{MEAL_TYPES.map((t) => <option key={t} value={t}>{cap(t)}</option>)}</select></div>
              <div className="field"><label htmlFor="rprep">Prep min</label><input id="rprep" className="input num" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} /></div>
              <div className="field"><label htmlFor="rcook">Cook min</label><input id="rcook" className="input num" inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value)} /></div>
              <div className="field"><label htmlFor="rserv">Serves</label><input id="rserv" className="input num" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} /></div>
            </div>
            <div className="field"><label>Tags <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>(used for filtering suggestions)</span></label><TagInput value={tags} onChange={setTags} placeholder="quick, mexican…" /></div>
          </div>
          <div className="sheet stack">
            <div className="field"><label htmlFor="rins">Instructions / notes</label><textarea id="rins" className="input" rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
          </div>
        </div>

        <div className="sheet kraft">
          <div className="row spread"><h2 style={{ color: "var(--forest-deep)" }}>Ingredients</h2><span className="chip on">{money(cost || null)} est.</span></div>
          <p className="small" style={{ margin: "4px 0 10px", color: "var(--forest-deep)" }}>Pick from your catalog, or create a new one on the spot. Fractions like 1/3 are fine, and each line can use its own unit.</p>
          <div className="stack tight" style={{ background: "var(--paper-hi)", borderRadius: 12, padding: "0.4rem 0.8rem 0.8rem" }}>
            {lines.length === 0 && <div className="muted small" style={{ padding: "0.8rem 0" }}>No ingredients yet.</div>}
            {lines.map((l, idx) => {
              const ing = byId.get(l.ingredientId)
              return (
                <div key={idx} className="ing-row">
                  <div><b>{ing?.name ?? "?"}</b><div className="small muted">{ing?.category}{ing?.unitCost != null ? ` · ${money(ing.unitCost)}/${ing.unit || "ea"}` : ""}</div></div>
                  <input className="input" inputMode="decimal" placeholder="Amt" aria-label={`Quantity of ${ing?.name}`} value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} style={{ textAlign: "right" }} />
                  <UnitSelect label={`Unit for ${ing?.name}`} value={l.unit} onChange={(u) => setLines(lines.map((x, i) => i === idx ? { ...x, unit: u } : x))} />
                  <button type="button" className="btn ghost icon small" aria-label={`Remove ${ing?.name}`} onClick={() => setLines(lines.filter((_, i) => i !== idx))}><Icon name="x" size={15} /></button>
                </div>
              )
            })}
            <IngredientPicker ingredients={ings} used={new Set(lines.map((l) => l.ingredientId))}
              onPick={(i) => setLines([...lines, { ingredientId: i.id, quantity: "1", unit: i.unit, note: "" }])} />
          </div>
        </div>
      </div>
    </form>
  )
}

export function IngredientPicker({ ingredients, used, onPick }: { ingredients: Ingredient[]; used: Set<string>; onPick: (i: Ingredient) => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [unit, setUnit] = useState("")
  const [category, setCategory] = useState("Produce")
  const [cost, setCost] = useState("")
  const [err, setErr] = useState("")
  const [hl, setHl] = useState(0)

  const matches = ingredients.filter((i) => !used.has(i.id) && i.name.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 30)
  const exact = ingredients.some((i) => i.name.toLowerCase() === text.trim().toLowerCase())

  const create = useMutation({
    mutationFn: () => api.createIngredient({ name: text.trim(), unit: unit.trim(), category, unitCost: cost.trim() === "" ? null : parseFloat(cost) }),
    onSuccess: (i) => { qc.invalidateQueries({ queryKey: ["ingredients"] }); onPick(i); setText(""); setCreating(false); setUnit(""); setCost(""); setErr("") },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Couldn't create"),
  })
  const pick = (i: Ingredient) => { onPick(i); setText(""); setOpen(false); setHl(0) }

  return (
    <div style={{ paddingTop: "0.7rem" }}>
      <div className="combo">
        <input className="input" placeholder="Search or add an ingredient…" value={text} aria-label="Add ingredient"
          onChange={(e) => { setText(e.target.value); setOpen(true); setCreating(false); setHl(0) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHl((h) => Math.min(h + 1, matches.length - 1)) }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)) }
            else if (e.key === "Enter") { e.preventDefault(); if (matches[hl]) pick(matches[hl]); else if (text.trim() && !exact) setCreating(true) }
          }} />
        {open && text.trim() !== "" && (matches.length > 0 || !exact) && (
          <div className="combo-list">
            {matches.map((i, k) => <button type="button" key={i.id} className={k === hl ? "hl" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}><span>{i.name}</span><span className="muted small">{i.category}</span></button>)}
            {!exact && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setCreating(true); setOpen(false) }}><span><b>＋ Create “{text.trim()}”</b></span></button>}
          </div>
        )}
      </div>
      {creating && (
        <div className="row wrap" style={{ marginTop: 8, alignItems: "flex-end" }}>
          <div className="field"><label>Unit</label><UnitSelect value={unit} onChange={setUnit} style={{ width: 110 }} /></div>
          <div className="field"><label>Aisle</label><select className="input" style={{ width: 150 }} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label>$ / unit</label><input className="input" style={{ width: 80 }} inputMode="decimal" placeholder="opt." value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          <button type="button" className="btn small forest" onClick={() => create.mutate()} disabled={create.isPending}>Create &amp; add</button>
          {err && <div className="error" style={{ width: "100%" }}>{err}</div>}
        </div>
      )}
    </div>
  )
}
