// Requests against the app in tests, without a server.
//
// The route tests were written for Fastify's `app.inject`, and the API now
// runs on Hono. This keeps the shape they were written against (statusCode,
// json(), headers, parsed cookies, remoteAddress) on top of Hono's
// `app.request`, so each test still asserts exactly what it did before.

import type { IncomingMessage } from 'node:http'
import type { Api } from '../http.js'
import { signSession, type SessionClaims } from '../session.js'

export interface InjectOptions {
  method?: string
  url: string
  payload?: unknown
  headers?: Record<string, string>
  cookies?: Record<string, string>
  /** The socket's address, as Fastify's inject took it. Default 127.0.0.1. */
  remoteAddress?: string
}

export interface InjectedCookie {
  [attribute: string]: unknown
  name: string
  value: string
  path?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
}

export interface InjectResponse {
  statusCode: number
  headers: Record<string, string | string[]>
  body: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(): any
  cookies: InjectedCookie[]
}

function parseSetCookie(raw: string): InjectedCookie {
  const [pair, ...attributes] = raw.split(';').map((part) => part.trim())
  const eq = pair.indexOf('=')
  const cookie: InjectedCookie = {
    name: pair.slice(0, eq),
    value: decodeURIComponent(pair.slice(eq + 1)),
  }
  for (const attribute of attributes) {
    const [key, ...rest] = attribute.split('=')
    const value = rest.join('=')
    switch (key.toLowerCase()) {
      case 'path':
        cookie.path = value
        break
      case 'max-age':
        cookie.maxAge = Number(value)
        break
      case 'expires':
        cookie.expires = new Date(value)
        break
      case 'httponly':
        cookie.httpOnly = true
        break
      case 'secure':
        cookie.secure = true
        break
      case 'samesite':
        cookie.sameSite = value
        break
    }
  }
  return cookie
}

export async function inject(app: Api, options: InjectOptions): Promise<InjectResponse> {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(options.headers ?? {})) headers[key.toLowerCase()] = value
  if (options.cookies) {
    headers.cookie = Object.entries(options.cookies)
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; ')
  }

  let body: string | undefined
  if (options.payload !== undefined) {
    if (typeof options.payload === 'string') {
      body = options.payload
    } else {
      body = JSON.stringify(options.payload)
      headers['content-type'] ??= 'application/json'
    }
  }

  // What @hono/node-server hands the app: the Node request, here only the
  // parts the app reads (the socket's address and the headers).
  const remoteAddress = options.remoteAddress ?? '127.0.0.1'
  const incoming = {
    headers,
    socket: { remoteAddress },
    connection: { remoteAddress },
  } as unknown as IncomingMessage

  const res = await app.request(
    `http://localhost${options.url}`,
    { method: options.method ?? 'GET', headers, body },
    { incoming },
  )

  const text = await res.text()
  const responseHeaders: Record<string, string | string[]> = {}
  res.headers.forEach((value, key) => {
    if (key !== 'set-cookie') responseHeaders[key] = value
  })
  const setCookies = res.headers.getSetCookie()
  if (setCookies.length > 0) responseHeaders['set-cookie'] = setCookies

  return {
    statusCode: res.status,
    headers: responseHeaders,
    body: text,
    json: () => JSON.parse(text),
    cookies: setCookies.map(parseSetCookie),
  }
}

/**
 * A session token as the tests used to make them with `app.jwt.sign`: the
 * claims, signed with JWT_SECRET, and no expiry.
 */
export function signToken(claims: SessionClaims): Promise<string> {
  return signSession(claims, false)
}
