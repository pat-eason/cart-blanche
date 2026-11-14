import { motion } from "framer-motion"
import type { ReactNode } from "react"
import { NavLink, Link, useLocation } from "react-router-dom"
import { useAuth } from "../lib/auth"
import { useHouseholdConfig } from "../lib/hooks"
import { Spinner } from "./ui"
import { Bag } from "./Bag"
import { Icon } from "./Icon"

const NAV = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/plan", label: "Plan menu", icon: "calendar" },
  { to: "/shop", label: "Shop", icon: "cart" },
  { to: "/recipes", label: "Recipes", icon: "book" },
  { to: "/ingredients", label: "Ingredients", icon: "leaf" },
  { to: "/history", label: "History", icon: "history" },
  { to: "/trends", label: "Trends", icon: "chart" },
  { to: "/household", label: "Household", icon: "users" },
  { to: "/settings", label: "Settings", icon: "gear" },
]
const TABS = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/plan", label: "Plan", icon: "calendar" },
  { to: "/shop", label: "Shop", icon: "cart" },
  { to: "/recipes", label: "Recipes", icon: "book" },
  { to: "/more", label: "More", icon: "more" },
]

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation() // router-relative: excludes the base path
  const cfg = useHouseholdConfig() // week math depends on it, so hold the page until it loads
  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" className="brand">
          <Bag mood="happy" size={44} />
          <span><b>Cart Blanche</b><small>menu · list · cart</small></span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} size={19} />{n.label}</NavLink>
          ))}
        </nav>
        <div className="who">
          <b>{user?.name}</b>
          <span style={{ opacity: 0.7 }}>{user?.email}</span>
          <button className="btn ghost small" onClick={logout}><Icon name="logout" size={16} />Sign out</button>
        </div>
      </aside>
      <main className="main">{cfg.isLoading ? <Spinner /> : children}</main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => (isActive || (n.to === "/more" && ["/history", "/trends", "/ingredients", "/household", "/settings"].some((p) => pathname.startsWith(p))) ? "active" : "")}>
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
