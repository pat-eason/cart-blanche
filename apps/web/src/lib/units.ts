export const UNIT_GROUPS: { label: string; units: string[] }[] = [
  { label: "Volume", units: ["tsp", "tbsp", "fl oz", "cup", "pint", "quart", "gallon", "ml", "l"] },
  { label: "Weight", units: ["oz", "lb", "g", "kg"] },
  { label: "Count", units: ["pc", "clove", "can", "bunch", "head", "pack", "box", "bag", "bottle", "dozen", "wedge"] },
]
const KNOWN = new Set(UNIT_GROUPS.flatMap((g) => g.units))

/** Options for a unit <select>. Legacy free-text units already in the data are kept selectable. */
export const unitOptions = (current: string) => (current && !KNOWN.has(current) ? [current] : [])

const GLYPHS: Record<string, string> = { "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" }

/** Parses "1/3", "1 1/2", "1½", "0.25" or "2" into a number; NaN when it isn't one. */
export function parseQty(input: string): number {
  let s = input.trim()
  for (const [g, f] of Object.entries(GLYPHS)) s = s.replace(g, ` ${f}`)
  s = s.trim().replace(/\s+/g, " ")
  if (s === "") return NaN
  let total = 0
  for (const part of s.split(" ")) {
    const m = part.match(/^(\d+)\/(\d+)$/)
    if (m) { if (+m[2] === 0) return NaN; total += +m[1] / +m[2] }
    else if (/^\d*\.?\d+$/.test(part)) total += parseFloat(part)
    else return NaN
  }
  return Math.round(total * 1000) / 1000
}

const DENOMS = [2, 3, 4, 6, 8]

/** Renders a decimal as a readable fraction (0.333 → "1/3", 1.5 → "1 1/2"); falls back to a rounded decimal. */
export function toFraction(n: number): string {
  if (!isFinite(n)) return String(n)
  const whole = Math.floor(n + 1e-9)
  const frac = n - whole
  if (frac < 0.01) return String(whole)
  if (frac > 0.99) return String(whole + 1)
  for (const d of DENOMS) {
    const num = Math.round(frac * d)
    if (num > 0 && num < d && Math.abs(frac - num / d) < 0.01) {
      const f = `${num}/${d}`
      return whole > 0 ? `${whole} ${f}` : f
    }
  }
  return String(Math.round(n * 100) / 100)
}
