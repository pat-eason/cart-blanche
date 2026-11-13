import { getSettings } from "./settings"
import { toFraction } from "./units"

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
export const MEAL_TYPES = ["dinner", "lunch", "breakfast", "snack", "dessert"]
export const CATEGORIES = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry", "Frozen",
  "Snacks", "Beverages", "Household", "Other",
]

const pad = (n: number) => String(n).padStart(2, "0")
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Monday of the week containing `d` (local time). */
export function weekStartOf(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // Mon=0
  x.setDate(x.getDate() - dow)
  return iso(x)
}

export function addWeeks(week: string, n: number): string {
  const d = parseISO(week)
  d.setDate(d.getDate() + n * 7)
  return iso(d)
}

export function todayIndex(): number {
  return (new Date().getDay() + 6) % 7
}

export function weekLabel(week: string): string {
  const s = parseISO(week)
  const e = parseISO(addWeeks(week, 1))
  e.setDate(e.getDate() - 1)
  const f = (d: Date, y = false) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}) })
  return `${f(s)} – ${f(e, true)}`
}

export function shortWeek(week: string): string {
  return parseISO(week).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: n % 1 === 0 ? 0 : 2 })

/** Quantity for display: a readable fraction when the "fractions" setting is on, else a decimal. */
export function qty(n: number): string {
  return getSettings().fractions ? toFraction(n) : String(Math.round(n * 100) / 100)
}

export function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

export function minutesLabel(m: number): string {
  if (!m) return ""
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
