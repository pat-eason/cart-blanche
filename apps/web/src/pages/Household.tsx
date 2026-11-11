import { useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { useState } from "react"
import { Bag } from "../components/Bag"
import { Icon } from "../components/Icon"
import { Spinner, useToast } from "../components/ui"
import { api, ApiError } from "../lib/api"
import { useAuth } from "../lib/auth"
import { useHousehold } from "../lib/hooks"

export default function HouseholdPage() {
  const q = useHousehold()
  const qc = useQueryClient()
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [name, setName] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [err, setErr] = useState("")
  const h = q.data
  const fail = (e: unknown) => setErr(e instanceof ApiError ? e.message : "Something went wrong")
  const rename = useMutation({ mutationFn: (n: string) => api.renameHousehold(n), onSuccess: (x) => { qc.setQueryData(["household"], x); setName(null); toast.show("Renamed") }, onError: fail })
  const reset = useMutation({ mutationFn: api.resetInvite, onSuccess: (x) => { qc.setQueryData(["household"], x); toast.show("New code generated") } })
  const join = useMutation({
    mutationFn: () => api.joinHousehold(code),
    onSuccess: () => { setCode(""); setErr(""); refresh() }, onError: fail,
  })
  if (!h) return <Spinner />
  const link = `${location.origin}/register?invite=${h.inviteCode}`
  const copy = async (t: string, m: string) => { try { await navigator.clipboard.writeText(t); toast.show(m) } catch { toast.show("Copy failed") } }

  return (
    <div className="stack" style={{ gap: "1.4rem" }}>
      <div className="page-head" style={{ marginBottom: 0 }}><div><div className="eyebrow">Shop together</div><h1>Household</h1><p className="muted">Everyone in your household shares recipes, menus, and grocery lists.</p></div></div>
      {err && <div className="error" role="alert">{err}</div>}
      <div className="grid cols-2">
        <section className="sheet stacked stack">
          <span className="tape" />
          <div className="field"><label htmlFor="hn">Household name</label>
            <div className="row"><input id="hn" className="input" value={name ?? h.name} onChange={(e) => setName(e.target.value)} />
              {name !== null && name !== h.name && <button className="btn forest" onClick={() => rename.mutate(name)}>Save</button>}</div></div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Members · {h.members.length}</div>
            <div className="stack tight">
              {h.members.map((m, i) => (
                <motion.div key={m.id} className="row" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <div className="meal" style={{ width: "100%", gridTemplateColumns: "auto 1fr auto" }}>
                    <div className={`dot ${m.id === user?.id ? "accent" : ""}`}>{m.name[0]?.toUpperCase()}</div>
                    <div><div className="title" style={{ fontSize: "1rem" }}>{m.name}</div><div className="small muted">{m.email}</div></div>
                    {m.id === user?.id && <span className="chip kraft">you</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="sheet kraft stack">
          <div className="row"><Bag mood="wink" size={64} /><div><h2 style={{ color: "var(--forest-deep)" }}>Invite someone</h2><div className="small">Share the code or link. They'll join when they sign up.</div></div></div>
          <div className="sheet" style={{ textAlign: "center" }}>
            <div className="label">Invite code</div>
            <div className="hand" style={{ fontSize: "3rem", letterSpacing: "0.12em", color: "var(--tomato-deep)", lineHeight: 1.1 }}>{h.inviteCode}</div>
            <div className="row wrap" style={{ justifyContent: "center", marginTop: 8 }}>
              <button className="btn small" onClick={() => copy(h.inviteCode, "Code copied")}><Icon name="copy" size={14} />Copy code</button>
              <button className="btn small" onClick={() => copy(link, "Link copied")}><Icon name="copy" size={14} />Copy link</button>
              <button className="btn small ghost" onClick={() => reset.mutate()}>Reset</button>
            </div>
          </div>
          <div className="small" style={{ color: "var(--forest-deep)" }}>Resetting the code stops the old one from working. Existing members stay.</div>
        </section>
      </div>

      <section className="sheet flat">
        <h3>Join a different household</h3>
        <p className="muted small" style={{ margin: "4px 0 10px" }}>Have a code from someone else? You'll switch to their household and see their menus and lists instead of these.</p>
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (code.trim() && confirm("Switch households? You'll stop seeing this household's data.")) join.mutate() }}>
          <input className="input" style={{ maxWidth: 220 }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-2345" aria-label="Invite code" />
          <button className="btn" disabled={!code.trim()}>Join</button>
        </form>
      </section>
      {toast.node}
    </div>
  )
}
