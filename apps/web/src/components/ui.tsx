import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Bag } from "./Bag"

export function Modal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div className="sheet modal" role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: 40, rotate: -1.5, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}>
            {title && <h2 style={{ marginBottom: "1rem" }}>{title}</h2>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Empty({ title, children, mood = "empty" }: { title: string; children?: ReactNode; mood?: "empty" | "happy" | "calm" | "wink" }) {
  return (
    <div className="empty">
      <Bag mood={mood} size={110} className="wobble" />
      <div className="hand">{title}</div>
      {children && <div className="muted" style={{ maxWidth: 380 }}>{children}</div>}
    </div>
  )
}

export function Spinner() {
  return <div className="center"><div className="spinner" /></div>
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const t = useRef<number | undefined>(undefined)
  const show = (m: string) => {
    setMsg(m)
    window.clearTimeout(t.current)
    t.current = window.setTimeout(() => setMsg(null), 2400)
  }
  const node = (
    <AnimatePresence>
      {msg && (
        <motion.div className="toast" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>{msg}</motion.div>
      )}
    </AnimatePresence>
  )
  return { show, node }
}

export function Tags({ tags, max = 4 }: { tags: string[]; max?: number }) {
  return <span className="row wrap" style={{ gap: 4 }}>{tags.slice(0, max).map((t) => <span key={t} className="chip">{t}</span>)}</span>
}

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState("")
  const add = () => {
    const t = text.trim().toLowerCase()
    if (t && !value.includes(t)) onChange([...value, t])
    setText("")
  }
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {value.map((t) => (
        <span key={t} className="chip">{t}<button type="button" className="x" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button></span>
      ))}
      <input className="input" style={{ width: 150, minHeight: 34, padding: "0.3rem 0.7rem" }} value={text} placeholder={placeholder ?? "add tag…"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add() } }}
        onBlur={add} />
    </div>
  )
}

/** tiny stacked bar chart */
export function StackedBars({ data, keys, colors, height = 180, width = 560, fmt }: {
  data: { label: string; values: Record<string, number>; marker?: number | null }[]
  keys: string[]; colors: Record<string, string>; height?: number; width?: number; fmt?: (n: number) => string
}) {
  const w = width, padL = 38, padB = 24, padT = 10
  const totals = data.map((d) => keys.reduce((a, k) => a + (d.values[k] ?? 0), 0))
  const max = Math.max(1, ...totals, ...data.map((d) => d.marker ?? 0))
  const bw = (w - padL) / Math.max(data.length, 1)
  const ch = height - padB - padT
  const y = (v: number) => padT + ch - (v / max) * ch
  const ticks = [0, 0.5, 1].map((f) => f * max)
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="#d9ccb0" strokeDasharray="4 4" />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end">{fmt ? fmt(Math.round(t)) : Math.round(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        let acc = 0
        const bwi = Math.min(bw * 0.64, 56)
        const x = padL + i * bw + (bw - bwi) / 2
        return (
          <g key={d.label}>
            {keys.map((k) => {
              const v = d.values[k] ?? 0
              if (!v) return null
              const y0 = y(acc + v), h = y(acc) - y0
              acc += v
              return (
                <motion.rect key={k} x={x} width={bwi} rx={4} fill={colors[k]}
                  initial={{ y: y(0), height: 0 }} animate={{ y: y0, height: Math.max(h, 1) }}
                  transition={{ delay: i * 0.04, type: "spring", stiffness: 140, damping: 20 }} />
              )
            })}
            {d.marker != null && <line x1={x - 3} x2={x + bwi + 3} y1={y(d.marker)} y2={y(d.marker)} stroke="#f2462e" strokeWidth="2.5" strokeLinecap="round" />}
            <text x={x + bwi / 2} y={height - 6} textAnchor="middle">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function HBars({ items, accent, fmt }: { items: { name: string; count: number }[]; accent?: boolean; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div>
      {items.map((it, i) => (
        <div key={it.name} className={`hbar ${accent ? "accent" : ""}`}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
          <span className="track"><motion.i initial={{ width: 0 }} animate={{ width: `${(it.count / max) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.6, ease: "easeOut" }} style={{ display: "block" }} /></span>
          <b>{fmt ? fmt(it.count) : it.count}</b>
        </div>
      ))}
    </div>
  )
}
