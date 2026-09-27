import { describe, it, expect } from 'vitest'
import createRouteRedaction, { canonicalRoute } from '../../src/domain/url/RouteRedaction'

const PAGE = 'https://example.com/verify/abc123?next=%2Fapp#top'

describe('canonicalRoute', () => {
  it.each([
    ['/verify/[token]', '/verify/[token]'],
    ['/(auth)/verify/[token]', '/verify/[token]'],
    ['/users/:id(\\d+)', '/users/:id'],
    ['/users/:id?', '/users/:id'],
    ['/files/:path*', '/files/:path'],
    ['/docs/**', '/docs/*'],
    ['verify/:token/', '/verify/:token'],
    ['/(marketing)', '/'],
    ['', '/'],
  ])('%s becomes %s', (template, expected) => {
    expect(canonicalRoute(template)).toBe(expected)
  })
})

describe('createRouteRedaction', () => {
  describe('redactRoutes', () => {
    it.each([
      ['/verify/[token]', '/verify/abc123', '/verify/[token]'],
      ['/verify/:token', '/verify/abc123', '/verify/:token'],
      ['/verify/[token]', '/verify/abc123/', '/verify/[token]'],
      ['/(auth)/reset/[code]', '/reset/xyz', '/reset/[code]'],
      ['/orders/[id=integer]', '/orders/42', '/orders/[id=integer]'],
      ['/p/[slug]-[id]', '/p/shoes-42', '/p/[slug]-[id]'],
      ['/share/[...rest]', '/share/a/b/c', '/share/[...rest]'],
      ['/share/*', '/share/a/b', '/share/*'],
      ['/share/*rest', '/share/a/b', '/share/*rest'],
      ['/[[lang]]/invite/[code]', '/fr/invite/k9', '/[[lang]]/invite/[code]'],
      ['/[[lang]]/invite/[code]', '/invite/k9', '/[[lang]]/invite/[code]'],
      ['/users/:id?', '/users', '/users/:id'],
      ['/users/:id(\\d+)', '/users/7', '/users/:id'],
      ['/users/:id(\\d+)?', '/users', '/users/:id'],
    ])('%s rewrites %s to %s', (pattern, path, expected) => {
      expect(createRouteRedaction({ redactRoutes: [pattern] }).path(path)).toBe(expected)
    })

    it.each([
      ['/verify/[token]', '/verify'],
      ['/verify/[token]', '/verify/a/b'],
      ['/verify/[token]', '/verifyx/abc'],
      ['/verify/:token', '/other/abc'],
      ['/p/[slug]-[id]', '/p/shoes'],
    ])('%s leaves %s untouched', (pattern, path) => {
      expect(createRouteRedaction({ redactRoutes: [pattern] }).path(path)).toBe(path)
    })

    it('uses the first matching pattern', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/email', '/verify/[token]'] })
      expect(routes.path('/verify/email')).toBe('/verify/email')
      expect(routes.path('/verify/abc')).toBe('/verify/[token]')
    })

    it('keeps the query and hash of the page URL for the scrubber to handle', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]?next=%2Fapp#top')
    })

    it('leaves unmatched and unparsable URLs untouched', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.page('https://example.com/pricing')).toBe('https://example.com/pricing')
      expect(routes.page('not a url')).toBe('not a url')
    })

    it('rewrites same-origin links and leaves other origins alone', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/invoices/[id]'] })
      expect(routes.link('https://example.com/invoices/991.pdf', PAGE)).toBe('https://example.com/invoices/[id]')
      expect(routes.link('https://cdn.io/invoices/991', PAGE)).toBe('https://cdn.io/invoices/991')
    })

    it('rewrites a same-origin referrer and keeps an external one', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.referrer('https://example.com/verify/abc', PAGE)).toBe('https://example.com/verify/[token]')
      expect(routes.referrer('https://google.com/verify/abc', PAGE)).toBe('https://google.com/verify/abc')
      expect(routes.referrer('', PAGE)).toBe('')
    })

    it('ignores blank patterns', () => {
      const routes = createRouteRedaction({ redactRoutes: ['', '  '] })
      expect(routes.path('/anything')).toBe('/anything')
    })
  })

  describe('routeTemplates', () => {
    it('sends the template of the current route for every page', () => {
      const routes = createRouteRedaction({ routeTemplates: true, routeTemplate: () => '/(auth)/verify/[token]' })
      expect(routes.templated).toBe(true)
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]?next=%2Fapp#top')
    })

    it('falls back to redactRoutes, then to the real path, when the router has no template', () => {
      const routes = createRouteRedaction({
        routeTemplates: true,
        routeTemplate: () => null,
        redactRoutes: ['/verify/[token]'],
      })
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]?next=%2Fapp#top')
      expect(routes.page('https://example.com/about')).toBe('https://example.com/about')
    })

    it('survives a resolver that throws', () => {
      const routes = createRouteRedaction({
        routeTemplates: true,
        routeTemplate: () => {
          throw new Error('router not ready')
        },
      })
      expect(routes.page('https://example.com/a')).toBe('https://example.com/a')
    })

    it('drops the path of a same-origin referrer, whose template is unknown', () => {
      const routes = createRouteRedaction({ routeTemplates: true, routeTemplate: () => '/x' })
      expect(routes.referrer('https://example.com/verify/abc?x=1', PAGE)).toBe('https://example.com/')
      expect(routes.referrer('https://google.com/search', PAGE)).toBe('https://google.com/search')
    })

    it('stays off without a resolver or when the flag is false', () => {
      expect(createRouteRedaction({ routeTemplates: true }).templated).toBe(false)
      expect(createRouteRedaction({ routeTemplate: () => '/x' }).templated).toBe(false)
      expect(createRouteRedaction({ routeTemplate: () => '/x' }).page(PAGE)).toBe(PAGE)
    })
  })

  it('is the identity with no option', () => {
    const routes = createRouteRedaction()
    expect(routes.page(PAGE)).toBe(PAGE)
    expect(routes.referrer('https://example.com/a', PAGE)).toBe('https://example.com/a')
    expect(routes.path('/a/b')).toBe('/a/b')
  })
})
