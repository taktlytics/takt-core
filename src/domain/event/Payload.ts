import type { AnalyticsEvent } from './AnalyticsEvent'

/** Wire DTO sent to the backend. Keys are FROZEN: the Go ingestor depends on this shape. */
export interface Payload {
  n: string
  d: string
  u: string
  r: string
  w: number
  p?: Record<string, string>
  $?: { a: string; c: string }
}

/** Environment values needed to complete the payload. */
export interface PayloadEnv {
  domain: string
  url: string
  referrer: string
  width: number
}

/** Maps a domain event + environment → the wire DTO. */
export function buildPayload(event: AnalyticsEvent, env: PayloadEnv): Payload {
  const payload: Payload = {
    n: event.name.value,
    d: env.domain,
    u: env.url,
    r: env.referrer,
    w: env.width,
  }
  const p = event.props.toWire()
  if (p !== undefined) payload.p = p
  if (event.revenue !== undefined) payload.$ = event.revenue.toWire()
  return payload
}
