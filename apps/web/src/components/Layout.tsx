import { motion } from "framer-motion"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { NavLink, Link, useLocation } from "react-router-dom"
import { useAuth } from "../lib/auth"
import { useHouseholdConfig } from "../lib/hooks"
import { Spinner } from "./ui"
import { Bag } from "./Bag"
import { Icon } from "./Icon"

const HOME = { to: "/", label: "Home", icon: "home", end: true }
const GROUPS = [
  { title: "Planning", items: [
    { to: "/plan", label: "Plan menu", icon: "calendar" },
    { to: "/shop", label: "Shop", icon: "cart" },
    { to: "/menu", label: "Cook", icon: "utensils" },
  ] },
  { title: "Management", items: [
    { to: "/recipes", label: "Recipes", icon: "book" },
    { to: "/ingredients", label: "Ingredients", icon: "leaf" },
    { to: "/history", label: "History", icon: "history" },
    { to: "/trends", label: "Trends", icon: "chart" },
  ] },
]
const COLLAPSE_KEY = "cb-nav-collapsed"
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === "1" } catch { return false } }
const TABS = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/plan", label: "Plan", icon: "calendar" },
  { to: "/shop", label: "Shop", icon: "cart" },
  { to: "/menu", label: "Cook", icon: "utensils" },
  { to: "/more", label: "More", icon: "more" },
]

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation() // router-relative: excludes the base path
  const cfg = useHouseholdConfig() // week math depends on it, so hold the page until it loads
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1") } catch { /* storage unavailable */ }
    return !c
  })
  const link = (n: { to: string; label: string; icon: string; end?: boolean }) => (
    <NavLink key={n.to} to={n.to} end={n.end} data-tip={collapsed ? n.label : undefined} aria-label={collapsed ? n.label : undefined}>
      <Icon name={n.icon} size={19} /><span className="lbl">{n.label}</span>
    </NavLink>
  )
  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="side">
        <div className="side-top">
          <Link to="/" className="brand" aria-label="Cart Blanche home">
            <Bag mood="happy" size={44} />
            <span className="lbl"><b>Cart Blanche</b><small>menu · list · cart</small></span>
          </Link>
          <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
            data-tip={collapsed ? "Expand" : undefined}>
            <Icon name={collapsed ? "right" : "left"} size={16} />
          </button>
        </div>
        <nav className="nav" aria-label="Main">
          {link(HOME)}
          {GROUPS.map((g) => (
            <div key={g.title} className="nav-group" role="group" aria-label={g.title}>
              <div className="nav-title">{g.title}</div>
              {g.items.map(link)}
            </div>
          ))}
        </nav>
        <SettingsMenu collapsed={collapsed} pathname={pathname} />
      </aside>
      <main className="main">{cfg.isLoading ? <Spinner /> : children}</main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => (isActive || (n.to === "/more" && ["/recipes", "/history", "/trends", "/ingredients", "/household", "/settings"].some((p) => pathname.startsWith(p))) ? "active" : "")}>
            {({ isActive }) => (
              <>
                {isActive && <motion.i layoutId="tabpill" className="pill" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <Icon name={n.icon} size={22} /><span>{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** Bottom-of-sidebar account button; opens a popout with the user, Settings, Household and Sign out. */
function SettingsMenu({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
  }, [open])
  const here = pathname.startsWith("/settings") || pathname.startsWith("/household")
  return (
    <div className="side-foot" ref={ref}>
      {open && (
        <div className="pop" role="menu" aria-label="Account">
          <div className="pop-user"><b>{user?.name}</b><span>{user?.email}</span></div>
          <Link to="/settings" role="menuitem"><Icon name="gear" size={17} />Settings</Link>
          <Link to="/household" role="menuitem"><Icon name="users" size={17} />Household</Link>
          <button role="menuitem" onClick={logout}><Icon name="logout" size={17} />Sign out</button>
        </div>
      )}
      <button className={`foot-btn ${here || open ? "active" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label={collapsed ? "Settings and account" : undefined} data-tip={collapsed && !open ? "Settings" : undefined}>
        <Icon name="gear" size={19} />
        <span className="lbl foot-who"><b>{user?.name}</b><small>Settings</small></span>
      </button>
    </div>
  )
}
