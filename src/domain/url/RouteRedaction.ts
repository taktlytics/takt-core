export type RouteTemplateResolver = () => string | null | undefined

export interface RouteRedactionOptions {
  redactRoutes?: string[]
  routeTemplates?: boolean
  routeTemplate?: RouteTemplateResolver
  redactUndecodablePaths?: boolean
}

export interface RouteRedaction {
  readonly templated: boolean
  page(rawUrl: string): string
  link(rawUrl: string, pageUrl: string): string
  referrer(rawUrl: string, pageUrl: string): string
  path(pathname: string): string
  pattern(pathname: string): string
}

const GROUP = /^\(.+\)$/
const REST = /^(\[\.\.\.[^\]]+\]|\*\*?|\*\w+|:\w+(\([^)]*\))?[*+])$/
const OPTIONAL = /^(\[\[[^\]]+\]\]|:\w+(\([^)]*\))?\?|\{\w+(<[^>]*>)?\?[^}]*\})$/
const PARAM = /\[[^\]]+\]|:\w+(\([^)]*\))?|\{\w+(<[^>]*>)?(\?[^}]*)?\}/g
const BRACE = /\{(\w+)(<[^>]*>)?(\?[^}]*)?\}/g

function routeSegments(template: string): string[] {
  return template.split(/\/(?![^<]*>)/).filter((segment) => segment !== '' && !GROUP.test(segment))
}

function canonicalSegment(segment: string): string {
  if (segment === '**') return '*'
  return segment.replace(/:(\w+)(\([^)]*\))?[?*+]?/g, ':$1').replace(BRACE, '{$1}')
}

export function canonicalRoute(template: string): string {
  return '/' + routeSegments(template).map(canonicalSegment).join('/')
}

const MAX_DECODE_PASSES = 5
const FAILED_OUTPUT = '/[redacted]'
const RESERVED_ESCAPES = ['23', '24', '26', '2B', '2C', '2F', '3A', '3B', '3D', '3F', '40']
const ENCODED_SPLIT = /(%[0-9A-Fa-f]{2})/
const ENCODED_TOKEN = /^%[0-9A-Fa-f]{2}$/
const UTF8_ENCODER = new TextEncoder()
const UTF8_STRICT_DECODER = new TextDecoder('utf-8', { fatal: true })
const UTF8_LENIENT_DECODER = new TextDecoder('utf-8')

function collapseSlashes(path: string): string {
  return path.replace(/\/{2,}/g, '/')
}

function removeDotSegments(path: string): string {
  const absolute = path.startsWith('/')
  const segments = (absolute ? path.slice(1) : path).split('/')
  const last = segments.length - 1
  const kept: string[] = []
  segments.forEach((segment, index) => {
    if (segment === '.') {
      if (index === last) kept.push('')
    } else if (segment === '..') {
      kept.pop()
      if (index === last) kept.push('')
    } else {
      kept.push(segment)
    }
  })
  return (absolute ? '/' : '') + kept.join('/')
}

function normalizePath(path: string): string {
  return collapseSlashes(removeDotSegments(collapseSlashes(path)))
}

type DecodeStep = (path: string) => string | null

function percentBytes(path: string, decodesEscape: (token: string) => boolean): Uint8Array {
  const bytes = path.split(ENCODED_SPLIT).flatMap((token) =>
    ENCODED_TOKEN.test(token) && decodesEscape(token)
      ? [parseInt(token.slice(1), 16)]
      : [...UTF8_ENCODER.encode(token)],
  )
  return Uint8Array.from(bytes)
}

function decodeStrict(path: string): string | null {
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

function decodeLenient(path: string): string {
  return UTF8_LENIENT_DECODER.decode(percentBytes(path, () => true))
}

function decodeChain(pathname: string, decodeStep: DecodeStep): string[] | null {
  const forms = [pathname]
  let current = pathname
  for (let changes = 0; ; changes++) {
    const next = decodeStep(current)
    if (next === null) return null
    if (next === current) return forms
    if (changes === MAX_DECODE_PASSES) return null
    forms.push(next)
    current = next
  }
}

function decodeUri(path: string): string {
  try {
    return UTF8_STRICT_DECODER.decode(
      percentBytes(path, (token) => !RESERVED_ESCAPES.includes(token.slice(1).toUpperCase())),
    )
  } catch {
    return path
  }
}

function stripMatrixParameters(path: string): string {
  return path
    .split('/')
    .map((segment) => {
      const semicolon = segment.indexOf(';')
      return semicolon === -1 ? segment : segment.slice(0, semicolon)
    })
    .join('/')
}

function candidatePaths(pathname: string, decodeStep: DecodeStep): string[] | null {
  const decoded = decodeChain(pathname, decodeStep)
  if (decoded === null) return null
  const forms = [...decoded, decodeUri(pathname)]
  return [...new Set([...forms, ...forms.map(stripMatrixParameters)].map(normalizePath))]
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CONSTRAINT = /<([^>]*)>/
const MAX_CONSTRAINT_LENGTH = 100
const UNUSABLE_CONSTRAINT = /[/^$]|\(\?<|\\[1-9k]|\([^)]*[*+}]\)[*+{]/

function usableConstraint(body: string): boolean {
  if (body === '' || body.length > MAX_CONSTRAINT_LENGTH || UNUSABLE_CONSTRAINT.test(body)) return false
  try {
    return Boolean(new RegExp(body, 'i')) && Boolean(new RegExp(`^(?:${body})$`, 'i'))
  } catch {
    return false
  }
}

interface CompileState {
  unusable: boolean
}

function paramSource(param: string, state: CompileState): string {
  const body = param.startsWith('{') ? CONSTRAINT.exec(param)?.[1] : undefined
  if (body === undefined) return '[^/]+'
  if (usableConstraint(body)) return `(?:${body})`
  state.unusable = true
  return '[^/]+'
}

function segmentSource(segment: string, state: CompileState): string {
  let source = ''
  let last = 0
  for (const param of segment.matchAll(PARAM)) {
    source += escapeRegExp(segment.slice(last, param.index)) + paramSource(param[0], state)
    last = param.index + param[0].length
  }
  return source + escapeRegExp(segment.slice(last))
}

function compileRoute(pattern: string): { regex: RegExp; unusable: boolean } {
  const state: CompileState = { unusable: false }
  const source = routeSegments(pattern)
    .map((segment) => {
      if (REST.test(segment)) return '(?:/.*)?'
      if (OPTIONAL.test(segment)) return `(?:/${paramSource(segment, state)})?`
      return '/' + segmentSource(segment, state)
    })
    .join('')
  return { regex: new RegExp(`^${source}/?$`, 'i'), unusable: state.unusable }
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

export default function createRouteRedaction(options: RouteRedactionOptions = {}): RouteRedaction {
  const routes = (options.redactRoutes ?? [])
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => ({ ...compileRoute(pattern), output: canonicalRoute(pattern) }))
  const resolver = options.routeTemplates ? options.routeTemplate : undefined
  const templated = typeof resolver === 'function'
  const decodeStep: DecodeStep = options.redactUndecodablePaths === false ? decodeLenient : decodeStrict

  function redactedPath(pathname: string): string | null {
    if (routes.length === 0) return null
    const candidates = candidatePaths(pathname, decodeStep)
    if (candidates === null) return FAILED_OUTPUT
    for (const route of routes) {
      if (candidates.some((candidate) => route.regex.test(candidate))) return route.unusable ? FAILED_OUTPUT : route.output
    }
    return null
  }

  function currentTemplate(): string | null {
    if (!resolver) return null
    try {
      const template = resolver()
      return typeof template === 'string' ? canonicalRoute(template) : null
    } catch {
      return null
    }
  }

  function rewrite(raw: string, template: string | null): string {
    const url = parseUrl(raw)
    if (!url) return raw
    const path = template ?? redactedPath(url.pathname)
    return path === null ? raw : url.origin + path
  }

  function sameOrigin(raw: string, pageUrl: string): URL | null {
    const url = parseUrl(raw)
    const page = parseUrl(pageUrl)
    return url && page && url.origin === page.origin ? url : null
  }

  return {
    templated,
    page: (rawUrl) => (templated || routes.length ? rewrite(rawUrl, currentTemplate()) : rawUrl),
    link(rawUrl, pageUrl) {
      if (!routes.length || !sameOrigin(rawUrl, pageUrl)) return rawUrl
      return rewrite(rawUrl, null)
    },
    referrer(rawUrl, pageUrl) {
      const url = sameOrigin(rawUrl, pageUrl)
      if (!url) return rawUrl
      if (templated) return url.origin + '/'
      return routes.length ? rewrite(rawUrl, null) : rawUrl
    },
    path: (pathname) => currentTemplate() ?? redactedPath(pathname) ?? pathname,
    pattern: (pathname) => redactedPath(pathname) ?? pathname,
  }
}
