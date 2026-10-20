/**
 * Hosted Takt origin. Used as the default for both event ingest and the public
 * stats/widget API, so a bare `init({ domain })` (or `<script>` snippet) talks to
 * the hosted service out of the box. Override with `endpoint`/`scriptOrigin` (or
 * `host`) to proxy first-party (anti-adblock) or to point at a custom host.
 */
export const DEFAULT_TAKT_ORIGIN = 'https://taktlytics.com'
