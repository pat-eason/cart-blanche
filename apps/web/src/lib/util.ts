import { getSettings } from "./settings"
import { toFraction } from "./units"

/** Weekday names indexed like Date.getDay() (0 = Sunday). */
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
export const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
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

/** First day of the week containing `d`: the configured shopping day on or before `d` (local time). */
export function weekStartOf(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() - getSettings().shoppingDay + 7) % 7))
  return iso(x)
}

export function addWeeks(week: string, n: number): string {
  const d = parseISO(week)
  d.setDate(d.getDate() + n * 7)
  return iso(d)
}

/** The week being planned: the one after the current one. */
export const planWeek = () => addWeeks(weekStartOf(), 1)

/** Day-slot names for a week, starting from the weekday that week begins on (meal `day` 0 = week start). */
export function dayNames(week: string, long = false): string[] {
  const start = parseISO(week).getDay()
  const names = long ? WEEKDAYS_LONG : WEEKDAYS
  return Array.from({ length: 7 }, (_, i) => names[(start + i) % 7])
}

/** Which day slot (0–6) today is within `week`; null if today is outside it. */
export function todayIndex(week: string): number | null {
  const ms = parseISO(iso(new Date())).getTime() - parseISO(week).getTime()
  const i = Math.round(ms / 86400000)
  return i >= 0 && i < 7 ? i : null
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
