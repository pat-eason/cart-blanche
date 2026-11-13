import { useSyncExternalStore } from "react"

interface Settings { fractions: boolean }
const KEY = "cart-blanche:settings"
const defaults: Settings = { fractions: true }

function load(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } } catch { return defaults }
}
let current = load()
const listeners = new Set<() => void>()

export const getSettings = () => current
export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
export const useSettings = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, getSettings)
