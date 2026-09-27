// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createServerTakt } from '../../src/server/client'

function fakeFetch(status = 202) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(null, { status })
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

function sentBody(call: { init: RequestInit }) {
  return JSON.parse(String(call.init.body))
}

function sentHeaders(call: { init: RequestInit }) {
  return new Headers(call.init.headers)
}

describe('createServerTakt', () => {
  it('posts a pageview to the hosted collect URL by default', async () => {
    const { fetch, calls } = fakeFetch()
    await createServerTakt({ domain: 'example.com', fetch }).pageview({ url: 'https://example.com/docs' })
    expect(calls[0].url).toBe('https://taktlytics.com/api/event')
    expect(calls[0].init.method).toBe('POST')
    expect(sentBody(calls[0])).toEqual({ n: 'pageview', d: 'example.com', u: 'https://example.com/docs', r: '', w: 0 })
    expect(sentHeaders(calls[0]).get('content-type')).toBe('application/json')
  })

  it('honours endpoint and scriptOrigin like createTakt', async () => {
    const a = fakeFetch()
    await createServerTakt({ domain: 'example.com', endpoint: 'https://collect.example.com/api/event', fetch: a.fetch }).pageview()
    expect(a.calls[0].url).toBe('https://collect.example.com/api/event')
    const b = fakeFetch()
    await createServerTakt({ domain: 'example.com', scriptOrigin: 'https://stats.example.com/', fetch: b.fetch }).pageview()
    expect(b.calls[0].url).toBe('https://stats.example.com/api/event')
  })

  it('falls back to the site home when no url is given', async () => {
    const { fetch, calls } = fakeFetch()
    await createServerTakt({ domain: 'example.com', fetch }).event('Signup')
    expect(sentBody(calls[0]).u).toBe('https://example.com/')
  })

  it('sends the api key and visitor headers', async () => {
    const { fetch, calls } = fakeFetch()
    await createServerTakt({ domain: 'example.com', apiKey: 'tk_live_abc', fetch }).pageview({
      url: 'https://example.com/',
      visitor: { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Test' },
    })
    const headers = sentHeaders(calls[0])
    expect(headers.get('authorization')).toBe('Bearer tk_live_abc')
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
    expect(headers.get('user-agent')).toBe('Mozilla/5.0 Test')
  })

  it('strips CR and LF from header values', async () => {
    const { fetch, calls } = fakeFetch()
    await createServerTakt({ domain: 'example.com', apiKey: 'k\r\nX-Evil: 1', fetch }).pageview({
      visitor: { userAgent: 'UA\nX-Other: 2' },
    })
    const headers = sentHeaders(calls[0])
    expect(headers.get('authorization')).toBe('Bearer kX-Evil: 1')
    expect(headers.get('user-agent')).toBe('UAX-Other: 2')
  })

  it('builds props and revenue with the browser SDK rules', async () => {
    const { fetch, calls } = fakeFetch()
    await createServerTakt({ domain: 'example.com', fetch }).event('Purchase', {
      url: 'https://example.com/checkout',
      referrer: 'https://google.com/',
      props: { plan: 'pro', seats: 3, empty: '' },
      revenue: { amount: '29.90', currency: 'eur' },
    })
    expect(sentBody(calls[0])).toMatchObject({
      n: 'Purchase',
      r: 'https://google.com/',
      p: { plan: 'pro', seats: '3' },
      $: { a: '29.90', c: 'EUR' },
    })
  })

  it('strips query strings by default and applies a custom scrubber', async () => {
    const a = fakeFetch()
    await createServerTakt({ domain: 'example.com', fetch: a.fetch }).pageview({
      url: 'https://example.com/reset?token=secret',
      referrer: 'https://ref.io/p?email=a@b.c',
    })
    expect(sentBody(a.calls[0])).toMatchObject({ u: 'https://example.com/reset', r: 'https://ref.io/p' })

    const b = fakeFetch()
    await createServerTakt({
      domain: 'example.com',
      fetch: b.fetch,
      scrubUrl: (raw) => raw.replace(/\/verify\/[^/?]+/, '/verify/:token'),
    }).pageview({ url: 'https://example.com/verify/abc' })
    expect(sentBody(b.calls[0]).u).toBe('https://example.com/verify/:token')
  })

  it('keeps allowlisted query params', async () => {
    const { fetch, calls } = fakeFetch()
    await createServerTakt({ domain: 'example.com', fetch, queryParams: ['utm_source'] }).pageview({
      url: 'https://example.com/?utm_source=news&token=x',
    })
    expect(sentBody(calls[0]).u).toBe('https://example.com/?utm_source=news')
  })

  it('rejects an empty or reserved custom event name', async () => {
    const { fetch } = fakeFetch()
    const takt = createServerTakt({ domain: 'example.com', fetch })
    await expect(takt.event('   ')).rejects.toThrow()
    await expect(takt.event('pageview')).rejects.toThrow()
  })

  it('swallows transport failures unless strict', async () => {
    const failing = vi.fn(async () => { throw new Error('network down') }) as unknown as typeof globalThis.fetch
    await expect(createServerTakt({ domain: 'example.com', fetch: failing }).pageview()).resolves.toBeUndefined()
    await expect(createServerTakt({ domain: 'example.com', fetch: failing, strict: true }).pageview()).rejects.toThrow('network down')
  })

  it('throws on a non-202 response only when strict', async () => {
    const lenient = fakeFetch(401)
    await expect(createServerTakt({ domain: 'example.com', fetch: lenient.fetch }).pageview()).resolves.toBeUndefined()
    const strict = fakeFetch(401)
    await expect(createServerTakt({ domain: 'example.com', fetch: strict.fetch, strict: true }).pageview()).rejects.toThrow('401')
  })

  it('requires a domain', () => {
    expect(() => createServerTakt({ domain: '  ' })).toThrow()
  })
})
