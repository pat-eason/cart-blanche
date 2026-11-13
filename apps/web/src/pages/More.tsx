import { Link } from "react-router-dom"
import { Icon } from "../components/Icon"
import { useAuth } from "../lib/auth"

export default function More() {
  const { user, logout } = useAuth()
  const items = [
    { to: "/history", icon: "history", t: "History", d: "Past menus, skipped & shelved meals" },
    { to: "/trends", icon: "chart", t: "Trends", d: "Spending, favorites & grocery mix" },
    { to: "/ingredients", icon: "leaf", t: "Ingredients", d: "Your pantry catalog & prices" },
    { to: "/settings", icon: "gear", t: "Settings", d: "Display preferences, like fractions" },
    { to: "/household", icon: "users", t: "Household", d: "Members & invite code" },
  ]
  return (
    <div className="stack">
      <h1>More</h1>
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="sheet row" style={{ textDecoration: "none", color: "inherit" }}>
          <span style={{ color: "var(--tomato)" }}><Icon name={i.icon} size={26} /></span>
          <div className="grow"><h3>{i.t}</h3><div className="muted small">{i.d}</div></div>
          <Icon name="right" />
        </Link>
      ))}
      <div className="sheet flat row spread">
        <div><b>{user?.name}</b><div className="muted small">{user?.email}</div></div>
        <button className="btn small" onClick={logout}>Sign out</button>
      </div>
    </div>
  )
}
