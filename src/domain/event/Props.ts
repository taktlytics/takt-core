import { warnOnce } from '../util/warn'

// Sanitised string→string map. Non-strings are coerced, empty values dropped,
// keys/values truncated, count capped: the event still sends, clamps warn once.
export class Props {
  static readonly MAX_PROPS = 30
  static readonly MAX_KEY_LENGTH = 64
  static readonly MAX_VALUE_LENGTH = 1024

  private readonly map: Record<string, string>

  constructor(raw?: Record<string, unknown>) {
    const cleaned: Record<string, string> = {}
    if (raw) {
      const entries = Object.entries(raw)
      if (entries.length > Props.MAX_PROPS) {
        warnOnce(`props capped to ${Props.MAX_PROPS} keys (received ${entries.length})`)
      }
      for (const [rawKey, rawValue] of entries.slice(0, Props.MAX_PROPS)) {
        if (rawValue === undefined || rawValue === null || rawValue === '') continue
        const value = typeof rawValue === 'string' ? rawValue : String(rawValue)
        if (value === '') continue
        cleaned[clamp(rawKey, Props.MAX_KEY_LENGTH, 'prop key')] = clamp(
          value,
          Props.MAX_VALUE_LENGTH,
          'prop value',
        )
      }
    }
    this.map = cleaned
  }

  isEmpty(): boolean {
    return Object.keys(this.map).length === 0
  }

  toWire(): Record<string, string> | undefined {
    return this.isEmpty() ? undefined : { ...this.map }
  }
}

function clamp(value: string, max: number, label: string): string {
  if (value.length <= max) return value
  warnOnce(`${label} truncated to ${max} chars`)
  return value.slice(0, max)
}
