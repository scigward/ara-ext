// a fake site: answers like the real one for the paths we hand it, and logs what was asked

export interface Hit {
  url: string
  range?: string
}

export interface FakeSite {
  fetch: typeof fetch
  hits: Hit[]
}

type Body = string | Uint8Array | { status: number, body?: string }

export interface SiteOptions {
  // false makes it ignore range headers like some servers do
  ranges?: boolean
  // wait this long before answering anything
  delay?: number
  // or only for urls containing the key
  delays?: Record<string, number>
}

function slice (body: Uint8Array, range: string): Uint8Array {
  const suffix = /^bytes=-(\d+)$/.exec(range)
  if (suffix) return body.subarray(Math.max(0, body.length - Number(suffix[1])))
  const [, from, to] = /^bytes=(\d+)-(\d*)$/.exec(range) ?? []
  return body.subarray(Number(from), to ? Number(to) + 1 : undefined)
}

export function fakeSite (routes: Record<string, Body | ((hit: Hit) => Body)>, options: SiteOptions = {}): FakeSite {
  const hits: Hit[] = []

  const fetchFn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const range = new Headers(init?.headers).get('range') ?? undefined
    const hit = { url, range }
    hits.push(hit)
    const wait = options.delay ?? Object.entries(options.delays ?? {}).find(([part]) => url.includes(part))?.[1]
    if (wait) await new Promise(resolve => setTimeout(resolve, wait))

    const found = routes[url]
    if (found === undefined) return new Response('not here', { status: 404 })
    const body = typeof found === 'function' ? found(hit) : found
    if (typeof body === 'object' && !(body instanceof Uint8Array)) return new Response(body.body ?? '', { status: body.status })
    if (typeof body === 'string') return new Response(body)

    const partial = range && options.ranges !== false
    // from() so the bytes sit in a plain arraybuffer, which is what response wants
    return new Response(Uint8Array.from(partial ? slice(body, range) : body), { status: partial ? 206 : 200 })
  }

  return { fetch: fetchFn as typeof fetch, hits }
}

// the ios extension runtime hands back a bare object: status, ok and the body readers, nothing else
export function iosLike (inner: typeof fetch): typeof fetch {
  const wrapped = async (input: string | URL | Request, init?: RequestInit) => {
    const res = await inner(input, init)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const allowed = {
      ok: res.ok,
      status: res.status,
      text: async () => new TextDecoder().decode(bytes),
      json: async () => JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      arrayBuffer: async () => bytes.slice().buffer,
      blob: async () => new Blob([bytes])
    } as Record<string, unknown>
    return new Proxy(allowed, {
      get (target, prop: string | symbol) {
        // await peeks at .then, a plain object just doesn't have it
        if (prop === 'then' || typeof prop === 'symbol') return undefined
        if (!(prop in target)) throw new Error(`the ios fetch proxy has no response.${prop}`)
        return target[prop]
      }
    }) as unknown as Response
  }
  return wrapped as typeof fetch
}
