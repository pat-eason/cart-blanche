import { motion } from "framer-motion"
import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Bag } from "../components/Bag"
import { api, ApiError } from "../lib/api"
import { useAuth } from "../lib/auth"
import { useQuery } from "@tanstack/react-query"

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const nav = useNavigate()
  const { setUser } = useAuth()
  const [sp] = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [invite, setInvite] = useState(sp.get("invite") ?? "")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const reg = mode === "register"
  const cfg = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, retry: false })
  const canRegister = cfg.data?.registration !== "closed"
  const needsCode = cfg.data?.registration === "invite"
  const [regCode, setRegCode] = useState(sp.get("code") ?? "")

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(""); setBusy(true)
    try {
      const u = reg ? await api.register({ email, password, name, inviteCode: invite || undefined, registrationCode: needsCode ? regCode : undefined }) : await api.login(email, password)
      setUser(u)
      nav("/", { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't reach the server")
    } finally { setBusy(false) }
  }

  return (
    <div className="auth">
      <motion.div className="auth-card" initial={{ opacity: 0, y: 30, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 160, damping: 20 }}>
        <div className="bag-hero"><Bag mood="wink" size={150} className="wobble" /></div>
        <div className="sheet stacked" style={{ marginTop: -22, paddingTop: "2rem" }}>
          <span className="tape" />
          <div style={{ textAlign: "center", marginBottom: "1.2rem" }}>
            <div className="eyebrow">Cart Blanche</div>
            <h1 style={{ fontSize: "2rem" }}>{reg ? "Start your list" : "Welcome back"}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{reg ? "Plan the week, build the list, shop together." : "Pick up where the list left off."}</p>
          </div>
          <form className="stack" onSubmit={submit}>
            {reg && (
              <div className="field"><label htmlFor="name">Your name</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div>
            )}
            <div className="field"><label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
            <div className="field"><label htmlFor="pw">Password</label>
              <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={reg ? "new-password" : "current-password"} minLength={reg ? 8 : undefined} required />
              {reg && <span className="muted small">At least 8 characters.</span>}</div>
            {reg && needsCode && (
              <div className="field"><label htmlFor="rc">Registration code</label>
                <input id="rc" className="input" value={regCode} onChange={(e) => setRegCode(e.target.value)} autoComplete="off" required /></div>
            )}
            {reg && (
              <div className="field"><label htmlFor="inv">Household invite code <span className="muted">(optional)</span></label>
                <input id="inv" className="input" value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} placeholder="ABCD-2345" /></div>
            )}
            {err && <div className="error" role="alert">{err}</div>}
            <button className="btn primary" disabled={busy}>{busy ? "One moment…" : reg ? "Create account" : "Sign in"}</button>
          </form>
          <p className="small muted" style={{ textAlign: "center", marginTop: "1rem" }}>
            {reg ? <>Already have an account? <Link to="/login">Sign in</Link></> : canRegister ? <>New here? <Link to="/register">Create an account</Link></> : null}
          </p>
        </div>
      </motion.div>
    </div>
  )
}
