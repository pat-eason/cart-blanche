import { useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Icon } from "../components/Icon"
import { Empty, Spinner, Tags } from "../components/ui"
import { loadStarter } from "../lib/seed"
import { useRecipes } from "../lib/hooks"
import { cap, MEAL_TYPES, minutesLabel, money } from "../lib/util"

export default function Recipes() {
  const q = useRecipes()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [type, setType] = useState("all")
  const [tag, setTag] = useState<string | null>(null)
  const [showAvoid, setShowAvoid] = useState(false)
  const seed = useMutation({ mutationFn: loadStarter, onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); qc.invalidateQueries({ queryKey: ["ingredients"] }) } })

  const recipes = q.data ?? []
  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort(), [recipes])
  const list = recipes.filter((r) =>
    (showAvoid || !r.avoid) && (type === "all" || r.mealType === type) && (!tag || r.tags.includes(tag)) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase())))

  return (
    <div>
      <div className="page-head">
        <div><div className="eyebrow">Your recipe box</div><h1>Recipes</h1><p className="muted">{recipes.length} saved · built from your own ingredients</p></div>
        <Link to="/recipes/new" className="btn primary"><Icon name="plus" size={18} />New recipe</Link>
      </div>

      {q.isLoading ? <Spinner /> : recipes.length === 0 ? (
        <div className="sheet stacked" style={{ maxWidth: 560, margin: "2rem auto" }}>
          <span className="tape" />
          <Empty title="The recipe box is empty" mood="calm">Add your family's go-to dinners — or load a starter set of eight to try things out. You can edit or delete them anytime.</Empty>
          <div className="row wrap" style={{ justifyContent: "center" }}>
            <Link to="/recipes/new" className="btn primary">Add a recipe</Link>
            <button className="btn" onClick={() => seed.mutate()} disabled={seed.isPending}><Icon name="sparkle" size={16} />{seed.isPending ? "Loading…" : "Load starter recipes"}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: "1.2rem" }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="Search recipes…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="seg">
              {["all", ...MEAL_TYPES.slice(0, 3)].map((t) => <button key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{cap(t)}</button>)}
            </div>
            <button className={`chip ${showAvoid ? "on" : "off"}`} onClick={() => setShowAvoid((s) => !s)}>Show “never again”</button>
          </div>
          {tags.length > 0 && (
            <div className="row wrap" style={{ gap: 6, marginBottom: "1.2rem" }}>
              {tags.map((t) => <button key={t} className={`chip ${tag === t ? "on" : "off"}`} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
            </div>
          )}
          <div className="grid auto">
            {list.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 16, rotate: i % 2 ? 0.8 : -0.8 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: Math.min(i, 10) * 0.035 }}>
                <Link to={`/recipes/${r.id}`} className={`sheet rcard ${r.avoid ? "avoid" : ""}`} style={{ paddingTop: "1.6rem" }}>
                  <i className="band" />
                  <div className="row spread"><span className="chip kraft">{cap(r.mealType)}</span>{r.avoid && <span className="chip no">never again</span>}</div>
                  <h3>{r.name}</h3>
                  <div className="ings">{r.ingredients.slice(0, 5).map((i) => i.name).join(", ")}{r.ingredients.length > 5 ? "…" : ""}</div>
                  <div className="row wrap small muted" style={{ gap: 10, marginTop: "auto" }}>
                    {r.prepMinutes + r.cookMinutes > 0 && <span><Icon name="clock" size={13} /> {minutesLabel(r.prepMinutes + r.cookMinutes)}</span>}
                    {r.estCost != null && <span><Icon name="coin" size={13} /> {money(r.estCost)}</span>}
                    {r.timesCooked > 0 && <span>cooked {r.timesCooked}×</span>}
                  </div>
                  <Tags tags={r.tags} />
                </Link>
              </motion.div>
            ))}
          </div>
          {list.length === 0 && <Empty title="Nothing matches" mood="calm" />}
        </>
      )}
    </div>
  )
}
