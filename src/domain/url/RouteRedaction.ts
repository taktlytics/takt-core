export type RouteTemplateResolver = () => string | null | undefined

export interface RouteRedactionOptions {
  redactRoutes?: string[]
  routeTemplates?: boolean
  routeTemplate?: RouteTemplateResolver
}

export interface RouteRedaction {
  readonly templated: boolean
  page(rawUrl: string): string
  link(rawUrl: string, pageUrl: string): string
  referrer(rawUrl: string, pageUrl: string): string
  path(pathname: string): string
}

const GROUP = /^\(.+\)$/
const REST = /^(\[\.\.\.[^\]]+\]|\*\*?|\*\w+|:\w+(\([^)]*\))?[*+])$/
const OPTIONAL = /^(\[\[[^\]]+\]\]|:\w+(\([^)]*\))?\?)$/
const PARAM = /\[[^\]]+\]|:\w+(\([^)]*\))?/g

function routeSegments(template: string): string[] {
  return template.split('/').filter((segment) => segment !== '' && !GROUP.test(segment))
}

function canonicalSegment(segment: string): string {
  if (segment === '**') return '*'
  return segment.replace(/:(\w+)(\([^)]*\))?[?*+]?/g, ':$1')
}

export function canonicalRoute(template: string): string {
  return '/' + routeSegments(template).map(canonicalSegment).join('/')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function segmentSource(segment: string): string {
  let source = ''
  let last = 0
  for (const param of segment.matchAll(PARAM)) {
    source += escapeRegExp(segment.slice(last, param.index)) + '[^/]+'
    last = param.index + param[0].length
  }
  return source + escapeRegExp(segment.slice(last))
}

function compileRoute(pattern: string): RegExp {
  const source = routeSegments(pattern)
    .map((segment) => {
      if (REST.test(segment)) return '(?:/.*)?'
      if (OPTIONAL.test(segment)) return '(?:/[^/]+)?'
      return '/' + segmentSource(segment)
    })
    .join('')
  return new RegExp(`^${source}/?$`)
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function withPath(url: URL, path: string): string {
  return url.origin + path + url.search + url.hash
}

function safeDecode(path: string): string {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

export default function createRouteRedaction(options: RouteRedactionOptions = {}): RouteRedaction {
  const routes = (options.redactRoutes ?? [])
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => ({ regex: compileRoute(pattern), output: canonicalRoute(pattern) }))
  const resolver = options.routeTemplates ? options.routeTemplate : undefined
  const templated = typeof resolver === 'function'

  function redactedPath(pathname: string): string | null {
    const decoded = safeDecode(pathname)
    for (const route of routes) {
      if (route.regex.test(pathname) || route.regex.test(decoded)) return route.output
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
    return path === null ? raw : withPath(url, path)
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
    path: (pathname) => redactedPath(pathname) ?? pathname,
  }
}
