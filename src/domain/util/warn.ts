const seen = new Set<string>()

// Warns once per unique message: dev diagnostics without spamming prod consoles.
export function warnOnce(message: string): void {
  if (seen.has(message) || typeof console === 'undefined') return
  seen.add(message)
  console.warn(`[takt] ${message}`)
}

export function _resetWarnings(): void {
  seen.clear()
}
