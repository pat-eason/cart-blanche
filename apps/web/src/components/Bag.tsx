import type { CSSProperties } from "react"

export type Mood = "happy" | "wink" | "calm" | "empty" | "full" | "wow" | "cheer" | "look-left" | "look-right"

// Aspect ratio (height / width) of each character image, so layout doesn't jump while loading.
const RATIO: Record<Mood, number> = {
  happy: 1.27, wink: 1.28, calm: 1.27, empty: 0.92, full: 1.24, wow: 1.23, cheer: 1.28, "look-left": 1.28, "look-right": 1.28,
}

/** The paper-bag mascot (artwork in /public/bags). `size` is the rendered width in px. */
export function Bag({ mood = "happy", size = 120, style, className }: { mood?: Mood; size?: number; style?: CSSProperties; className?: string }) {
  const w = Math.round(size * 0.9)
  return (
    <img src={`${import.meta.env.BASE_URL}bags/${mood}.png`} alt="" aria-hidden="true" width={w} height={Math.round(w * RATIO[mood])}
      style={{ objectFit: "contain", height: "auto", ...style }} className={className} draggable={false} />
  )
}
