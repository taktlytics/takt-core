import compileConstraint from './RouteConstraint'

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
  outboundDestination(rawUrl: string, pageUrl: string): string
  downloadDestination(rawUrl: string): string
  path(pathname: string): string
  pattern(pathname: string): string
}

const GROUP = /^\(.+\)$/
const REST = /^(\[\.\.\.[^\]]+\]|\*\*?|\*\w+|:\w+(\([^)]*\))?[*+])$/
const OPTIONAL = /^(\[\[[^\]]+\]\]|:\w+(\([^)]*\))?\?|\{\w+(<[^>]*>)?\?[^}]*\})$/
const PARAM = /\[[^\]]+\]|:\w+(\([^)]*\))?|\{\w+(<[^>]*>)?(\?[^}]*)?\}/g
const BRACE = /\{(\w+)(<[^>]*>)?(\?[^}]*)?\}/g
const STRAY_BRACE = /[{}]/

function routeSegments(template: string): string[] {
  return template.split(/(?<!<[^>]*)\//).filter((segment) => segment !== '' && !GROUP.test(segment))
}

function canonicalSegment(segment: string): string {
  if (segment === '**') return '*'
  return segment.replace(/:(\w+)(\([^)]*\))?[?*+]?/g, ':$1').replace(BRACE, '{$1}')
}

export function canonicalRoute(template: string): string {
  return '/' + routeSegments(template).map(canonicalSegment).join('/')
}

const MAX_DECODE_PASSES = 5
const REDACTED_PATH = '/[redacted]'
const HTTP_PROTOCOLS = ['http:', 'https:']
const RESERVED_ESCAPES = ['23', '24', '26', '2B', '2C', '2F', '3A', '3B', '3D', '3F', '40']
const ENCODED_SPLIT = /(%[0-9A-Fa-f]{2})/
const ENCODED_TOKEN = /^%[0-9A-Fa-f]{2}$/
const UTF8_ENCODER = new TextEncoder()
const UTF8_STRICT_DECODER = new TextDecoder('utf-8', { fatal: true })

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

function byteValues(form: string): number[] {
  return [...form].flatMap((char) => {
    const code = char.charCodeAt(0)
    return code >= BYTE_OFFSET && code < BYTE_OFFSET + 0x100 ? [code - BYTE_OFFSET] : [...UTF8_ENCODER.encode(char)]
  })
}

function decodeLenient(form: string): string {
  return byteString(
    form.split(ENCODED_SPLIT).flatMap((token) => (ENCODED_TOKEN.test(token) ? [parseInt(token.slice(1), 16)] : byteValues(token))),
  )
}

function decodeChain(start: string, decodeStep: DecodeStep): string[] | null {
  const forms = [start]
  let current = start
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

interface DecodingMode {
  decode: DecodeStep
  toForm: (pathname: string) => string
  toCandidate: (form: string) => string
}

const STRICT_MODE: DecodingMode = { decode: decodeStrict, toForm: (pathname) => pathname, toCandidate: toByteString }
const LENIENT_MODE: DecodingMode = { decode: decodeLenient, toForm: toByteString, toCandidate: (form) => form }

function candidatePaths(pathname: string, mode: DecodingMode): string[] | null {
  const decoded = decodeChain(mode.toForm(pathname), mode.decode)
  if (decoded === null) return null
  const forms = [...decoded.map(mode.toCandidate), toByteString(decodeUri(pathname))]
  return [...new Set([...forms, ...forms.map(stripMatrixParameters)].map(normalizePath))]
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CONSTRAINT = /<([^>]*)>/
const MAX_CONSTRAINED_SEGMENT_BYTES = 256
const MAX_ROUTE_VARIABLE_QUANTIFIERS = 2
const MAX_SEGMENT_VARIABLE_QUANTIFIERS = 2
const BYTE_OFFSET = 0xe000
const encoder = new TextEncoder()

interface BuildState {
  unusable: boolean
  variables: number
  degree: number
  rest: number
}

const MAX_ROUTE_DEGREE = 1
const MAX_ROUTE_REST_SEGMENTS = 1

function freshState(): BuildState {
  return { unusable: false, variables: 0, degree: 0, rest: 0 }
}

function segmentDegree(variables: number): number {
  return Math.max(0, variables - 1)
}

function byteString(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte < 0x80 ? byte : BYTE_OFFSET + byte)).join('')
}

function toByteString(text: string): string {
  return byteString(encoder.encode(text))
}

function constraintBody(param: string): string | undefined {
  return param.startsWith('{') ? CONSTRAINT.exec(param)?.[1] : undefined
}

type BuildMode = 'strict' | 'loose' | 'shape'

interface ParamPiece {
  source: string
  variables: number
  constrained: boolean
}

function paramSource(param: string, mode: BuildMode, state: BuildState): ParamPiece {
  if (mode === 'shape') return { source: '[^/]+', variables: 0, constrained: false }
  const body = constraintBody(param)
  if (body === undefined) return { source: '[^/]+', variables: 1, constrained: false }
  const constraint = compileConstraint(body)
  if (constraint === null) {
    state.unusable = true
    return { source: '[^/]+', variables: 1, constrained: true }
  }
  state.variables += constraint.variables
  return {
    source: mode === 'strict' ? `(?:${constraint.source})` : '([^/]+)',
    variables: constraint.variables,
    constrained: true,
  }
}

function segmentSource(segment: string, mode: BuildMode, state: BuildState): string {
  const params = [...segment.matchAll(PARAM)]
  if (mode === 'shape' && (params.length > 1 || STRAY_BRACE.test(segment.replace(PARAM, '')))) return '[^/]+'
  const pieces = params.map((param) => paramSource(param[0], mode, state))
  const constrainedCount = pieces.filter((piece) => piece.constrained).length
  const variables = pieces.reduce((sum, piece) => sum + piece.variables, 0)
  if (STRAY_BRACE.test(segment.replace(PARAM, '')) || constrainedCount > 1 || variables > MAX_SEGMENT_VARIABLE_QUANTIFIERS) {
    state.unusable = true
    return '[^/]+'
  }
  state.degree += segmentDegree(variables)
  let source = ''
  let last = 0
  params.forEach((param, index) => {
    source += escapeRegExp(toByteString(segment.slice(last, param.index))) + pieces[index].source
    last = param.index + param[0].length
  })
  return source + escapeRegExp(toByteString(segment.slice(last)))
}

function shapeSegments(segments: string[]): string[] {
  const isRest = segments.map((segment) => REST.test(segment))
  const first = isRest.indexOf(true)
  if (first === -1) return segments
  const last = isRest.lastIndexOf(true)
  return [...segments.slice(0, first), '**', ...segments.slice(last + 1)]
}

function buildSource(segments: string[], mode: BuildMode, state: BuildState): string {
  return segments
    .map((segment) => {
      if (REST.test(segment)) {
        state.rest += 1
        return '(?:/.*)?'
      }
      if (OPTIONAL.test(segment)) {
        const piece = paramSource(segment, mode, state)
        if (mode !== 'shape') state.degree += segmentDegree(piece.variables + 1)
        return `(?:/${piece.source})?`
      }
      return '/' + segmentSource(segment, mode, state)
    })
    .join('')
}

interface CompiledRoute {
  regex: RegExp
  loose: RegExp
  unusable: boolean
}

function compileRoute(pattern: string): CompiledRoute {
  const segments = routeSegments(pattern)
  const state = freshState()
  const source = buildSource(segments, 'strict', state)
  const loose = buildSource(segments, 'loose', freshState())
  const shape = buildSource(shapeSegments(segments), 'shape', freshState())
  const unusable =
    state.unusable ||
    state.variables > MAX_ROUTE_VARIABLE_QUANTIFIERS ||
    state.degree > MAX_ROUTE_DEGREE ||
    state.rest > MAX_ROUTE_REST_SEGMENTS
  return {
    regex: new RegExp(`^${unusable ? shape : source}/?$`, 'i'),
    loose: new RegExp(`^${unusable ? shape : loose}/?$`, 'i'),
    unusable,
  }
}

function hasOverlongConstrainedSegment(route: CompiledRoute, candidate: string): boolean {
  const match = route.loose.exec(candidate)
  return match !== null && match.slice(1).some((group) => group !== undefined && group.length > MAX_CONSTRAINED_SEGMENT_BYTES)
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
  const mode = options.redactUndecodablePaths === false ? LENIENT_MODE : STRICT_MODE

  function redactedPath(pathname: string): string | null {
    if (routes.length === 0) return null
    const candidates = candidatePaths(pathname, mode)
    if (candidates === null) return REDACTED_PATH
    for (const route of routes) {
      if (candidates.some((candidate) => hasOverlongConstrainedSegment(route, candidate))) return REDACTED_PATH
      if (candidates.some((candidate) => route.regex.test(candidate))) return route.unusable ? REDACTED_PATH : route.output
    }
    return null
  }

  function patternPath(pathname: string): string {
    return redactedPath(pathname) ?? pathname
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

  function sameHost(url: URL, pageUrl: string): boolean {
    return parseUrl(pageUrl)?.hostname === url.hostname
  }

  function siteRoot(raw: string): string {
    const url = parseUrl(raw)
    return url && HTTP_PROTOCOLS.includes(url.protocol) ? url.origin + '/' : ''
  }

  return {
    templated,
    page: (rawUrl) => (templated || routes.length ? rewrite(rawUrl, currentTemplate()) : rawUrl),
    link(rawUrl, pageUrl) {
      if (!routes.length || !sameOrigin(rawUrl, pageUrl)) return rawUrl
      return rewrite(rawUrl, null)
    },
    referrer(rawUrl, pageUrl) {
      if (templated) return siteRoot(rawUrl)
      const url = sameOrigin(rawUrl, pageUrl)
      if (!url) return rawUrl
      return routes.length ? rewrite(rawUrl, null) : rawUrl
    },
    outboundDestination(rawUrl, pageUrl) {
      const url = parseUrl(rawUrl)
      if (!url) return rawUrl
      return url.origin + (templated && sameHost(url, pageUrl) ? REDACTED_PATH : patternPath(url.pathname))
    },
    downloadDestination(rawUrl) {
      const url = parseUrl(rawUrl)
      if (!url) return rawUrl
      return url.origin + (templated ? REDACTED_PATH : patternPath(url.pathname))
    },
    path: (pathname) => currentTemplate() ?? (templated ? REDACTED_PATH : patternPath(pathname)),
    pattern: patternPath,
  }
}
