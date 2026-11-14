import { useSyncExternalStore } from "react"

/** Per-device preferences (localStorage) plus household config mirrored from the server (in memory). */
interface Settings {
  fractions: boolean
  /** Household config `shopping_day`: day the week starts and groceries are bought, 0=Sun … 6=Sat. */
  shoppingDay: number
}
const KEY = "cart-blanche:settings"
const defaults: Settings = { fractions: true, shoppingDay: 6 }

function load(): Settings {
  try {
    const { fractions } = JSON.parse(localStorage.getItem(KEY) ?? "{}")
    return { ...defaults, ...(typeof fractions === "boolean" ? { fractions } : {}) }
  } catch { return defaults }
}
let current = load()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const getSettings = () => current
export function setSettings(patch: Pick<Partial<Settings>, "fractions">) {
  current = { ...current, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify({ fractions: current.fractions })) } catch { /* private mode */ }
  emit()
}
/** Mirror the household's shopping day (not persisted locally; the server is the source of truth). */
export function applyShoppingDay(day: number) {
  if (day === current.shoppingDay) return
  current = { ...current, shoppingDay: day }
  emit()
}
export const useSettings = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, getSettings)
