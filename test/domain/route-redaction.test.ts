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
    ['/orders/{id}', '/orders/{id}'],
    ['/posts/{page?}', '/posts/{page}'],
    ['/orders/{id<\\d+>}', '/orders/{id}'],
    ['/users/{id?<\\d+>}', '/users/{id}'],
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
      ['/orders/{id}', '/orders/123', '/orders/{id}'],
      ['/posts/{page?}', '/posts', '/posts/{page}'],
      ['/posts/{page?}', '/posts/3', '/posts/{page}'],
      ['/orders/{id<\\d+>}', '/orders/abc', '/orders/{id}'],
      ['/users/{id?<\\d+>}', '/users', '/users/{id}'],
    ])('%s rewrites %s to %s',(pattern, path, expected) => {
      expect(createRouteRedaction({ redactRoutes: [pattern] }).path(path)).toBe(expected)
    })

    it.each([
      ['/verify/[token]', '/verify'],
      ['/verify/[token]', '/verify/a/b'],
      ['/verify/[token]', '/verifyx/abc'],
      ['/verify/:token', '/other/abc'],
      ['/p/[slug]-[id]', '/p/shoes'],
      ['/orders/[id]', '/orders%252F123/items'],
      ['/orders/[id]', '/orders/%2e%2e/123'],
      ['/orders/{id}', '/orders'],
      ['/orders/{id}', '/orders/1/2'],
    ])('%s leaves %s untouched',(pattern, path) => {
      expect(createRouteRedaction({ redactRoutes: [pattern] }).path(path)).toBe(path)
    })

    it('uses the first matching pattern', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/email', '/verify/[token]'] })
      expect(routes.path('/verify/email')).toBe('/verify/email')
      expect(routes.path('/verify/abc')).toBe('/verify/[token]')
    })

    it('drops the query and hash of a masked page URL', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]')
    })

    it('keeps the query and hash of an unmatched page URL', () => {
      const routes = createRouteRedaction({ redactRoutes: ['/verify/[token]'] })
      expect(routes.page('https://example.com/pricing?next=%2Fapp#top')).toBe('https://example.com/pricing?next=%2Fapp#top')
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
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]')
    })

    it('falls back to redactRoutes, then to the real path, when the router has no template', () => {
      const routes = createRouteRedaction({
        routeTemplates: true,
        routeTemplate: () => null,
        redactRoutes: ['/verify/[token]'],
      })
      expect(routes.page(PAGE)).toBe('https://example.com/verify/[token]')
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

  it('matches a route whatever the case of the path', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/Orders/123')).toBe('/orders/[id]')
    expect(routes.path('/ORDERS/123')).toBe('/orders/[id]')
    expect(routes.page('https://example.com/Orders/123?x=1')).toBe('https://example.com/orders/[id]')
  })

  it('matches a route on a double-encoded slash', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/orders%252F123')).toBe('/orders/[id]')
    expect(routes.path('/orders%25252F123')).toBe('/orders/[id]')
  })

  it('normalizes dot segments before matching, encoded or not', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/orders/../orders/123')).toBe('/orders/[id]')
    expect(routes.path('/./orders/123')).toBe('/orders/[id]')
    expect(routes.path('/orders/./123')).toBe('/orders/[id]')
    expect(routes.path('/orders/%2e%2e/orders/123')).toBe('/orders/[id]')
    expect(routes.path('/orders/%2E/123')).toBe('/orders/[id]')
    expect(routes.path('/x/../orders/123/')).toBe('/orders/[id]')
  })

  it('collapses repeated slashes before matching', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('//orders/123')).toBe('/orders/[id]')
    expect(routes.path('/orders//123')).toBe('/orders/[id]')
    expect(routes.path('/orders/123//')).toBe('/orders/[id]')
  })

  it('masks a path that cannot be decoded instead of sending it raw', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/orders/%FF%FE')).toBe('/[redacted]')
    expect(routes.path('/orders/%E0%A4%A')).toBe('/[redacted]')
    expect(routes.page('https://example.com/orders/%ZZ?token=t')).toBe('https://example.com/[redacted]')
  })

  it('keeps an undecodable path raw when redactUndecodablePaths is false', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'], redactUndecodablePaths: false })
    expect(routes.path('/orders/%ZZ')).toBe('/orders/%ZZ')
    expect(routes.page('https://example.com/orders/%ZZ?token=t')).toBe('https://example.com/orders/%ZZ?token=t')
    expect(routes.path('/orders/123')).toBe('/orders/[id]')
  })

  it('masks an undecodable path when redactUndecodablePaths is true', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'], redactUndecodablePaths: true })
    expect(routes.path('/orders/%ZZ')).toBe('/[redacted]')
  })

  it('leaves an undecodable path alone when no route is configured', () => {
    expect(createRouteRedaction().path('/orders/%ZZ')).toBe('/orders/%ZZ')
    expect(createRouteRedaction().page('https://example.com/%E0%A4%A')).toBe('https://example.com/%E0%A4%A')
  })

  it('matches a route under triple encoding of the slash', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/orders%25252F123')).toBe('/orders/[id]')
  })

  it('matches a route encoded five times, the deepest depth the decoder follows', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    let encoded = '/'
    for (let depth = 0; depth < 5; depth++) encoded = encodeURIComponent(encoded)
    expect(routes.path('/orders' + encoded + '123')).toBe('/orders/[id]')
  })

  it('masks a path encoded deeper than the decoder follows', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    let encoded = '/'
    for (let depth = 0; depth < 6; depth++) encoded = encodeURIComponent(encoded)
    expect(routes.path('/orders' + encoded + '123')).toBe('/[redacted]')
  })

  it('normalizes dot segments that are encoded more than once', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]'] })
    expect(routes.path('/%25252e%25252e/orders/123')).toBe('/orders/[id]')
  })

  it('ignores matrix parameters on each segment', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/orders/[id]', '/admin/[page]'] })
    expect(routes.path('/orders;a=1/123')).toBe('/orders/[id]')
    expect(routes.path('/admin;x/secret')).toBe('/admin/[page]')
    expect(routes.path('/orders%3Ba=1/123')).toBe('/orders/[id]')
  })

  it('keeps an encoded slash literal in a route while decoding the other escapes', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/files%2Fx/[id]'] })
    expect(routes.path('/files%2Fx/%41')).toBe('/files%2Fx/[id]')
  })

  it('matches a route on an encoded slash and masks a malformed path', () => {
    const routes = createRouteRedaction({ redactRoutes: ['/invoices/[id]'] })
    expect(routes.pattern('/invoices%2F991')).toBe('/invoices/[id]')
    expect(routes.pattern('/%ZZ/invoices/991')).toBe('/[redacted]')
    expect(routes.pattern('/invoices/%ZZ')).toBe('/[redacted]')
  })
})
