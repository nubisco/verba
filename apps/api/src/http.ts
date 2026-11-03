// The HTTP layer's shared pieces: the Hono app type every route file
// registers on, and the few request helpers the routes need.
//
// The API is one Hono app (app.ts). On Node it is served by
// @hono/node-server (index.ts), which is what the Docker image runs. Nothing
// in the routes or services depends on Node's HTTP server, so the same app can
// later be served by a Cloudflare Worker (docs/hosting-on-cloudflare.md).

import type { Context, Hono } from 'hono'
import type { IncomingMessage } from 'node:http'

/** Who a request is signed in as, set by `authenticate` (session.ts). */
export interface SessionUser {
  userId: string
  email: string
  plan?: string
  platformSub?: string
  iat?: number
  exp?: number
}

/**
 * What a request can carry. `incoming` is the Node request, present when
 * @hono/node-server serves the app and absent anywhere else.
 */
export interface AppEnv {
  Bindings: { incoming?: IncomingMessage }
  Variables: { user: SessionUser; body: unknown }
}

export type Api = Hono<AppEnv>
export type Ctx = Context<AppEnv>

/** An error the error handler answers with its status and message (app.ts). */
export function httpError(statusCode: number, message: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { statusCode, ...(details ? { details } : {}) })
}

/**
 * The parsed request body, read once per request.
 *
 * JSON for `application/json` (a malformed one is a 400, as Fastify answered
 * it), text for `text/plain`, and undefined when there is no body or it is
 * multipart, which only the import routes read (routes/import.ts). Routes
 * validate what they get with Zod, so an unexpected shape is still a 400.
 * `T` only names what the route expects: it is not checked.
 */
export async function readBody<T = unknown>(c: Ctx): Promise<T | undefined> {
  const cached = c.get('body')
  if (cached !== undefined) return cached as T
  if ((c.req.header('content-type') ?? '').toLowerCase().startsWith('multipart/')) return undefined
  const raw = await c.req.text()
  if (raw.length === 0) return undefined
  const type = (c.req.header('content-type') ?? '').toLowerCase()
  let body: unknown = raw
  if (type.includes('application/json')) {
    try {
      body = JSON.parse(raw)
    } catch {
      throw httpError(400, "Body is not valid JSON but content-type is set to 'application/json'")
    }
  }
  c.set('body', body)
  return body as T
}

/** A route parameter. Hono types it per route, these routes read it by name. */
export function param(c: Ctx, name: string): string {
  return c.req.param(name) as string
}
