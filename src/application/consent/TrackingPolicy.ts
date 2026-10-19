import type { ConsentStore } from '../ports/ConsentStore'
import type { DoNotTrackProvider } from '../ports/DoNotTrackProvider'
import type { EnvironmentProvider } from '../ports/EnvironmentProvider'
import decodePathSegments from '../../domain/url/decodePathSegments'

export interface TrackingPolicyConfig {
  respectDnt: boolean
  excludeLocalhost: boolean
  // Path prefixes never tracked (e.g. an authenticated dashboard or token-bearing
  // pages). Segment-bounded: '/app' excludes '/app' and '/app/…' but not
  // '/application'. Applies to pageviews and named events alike.
  exclude: string[]
  sampleRate: number
}

function normalizeSegmentPath(path: string): string {
  return decodePathSegments(path).replace(/\/+$/, '').toLowerCase()
}

// Frozen short-circuit order: opt-out → DNT → localhost → exclude → sampling.
export class TrackingPolicy {
  private readonly exclude: string[]

  constructor(
    private readonly consent: ConsentStore,
    private readonly dnt: DoNotTrackProvider,
    private readonly env: EnvironmentProvider,
    private readonly config: TrackingPolicyConfig,
    private readonly random: () => number = Math.random,
  ) {
    this.exclude = config.exclude.map(normalizeSegmentPath).filter(Boolean)
  }

  isBlocked(): boolean {
    if (this.consent.isOptedOut()) return true
    if (this.config.respectDnt && this.dnt.isEnabled()) return true
    if (this.config.excludeLocalhost && this.isLocalhost(this.env.hostname())) return true
    if (this.isExcludedPath(this.env.path())) return true
    if (this.config.sampleRate < 1 && this.random() >= this.config.sampleRate) return true
    return false
  }

  private isExcludedPath(path: string): boolean {
    const normalized = normalizeSegmentPath(path)
    return this.exclude.some((pre) => normalized === pre || normalized.startsWith(pre + '/'))
  }

  private isLocalhost(h: string): boolean {
    return (
      h === 'localhost' ||
      h === '::1' ||
      h === '0.0.0.0' ||
      h.endsWith('.local') ||
      /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)
    )
  }
}
