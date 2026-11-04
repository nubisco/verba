// The few Cloudflare runtime types the Worker uses, declared by hand as Acta
// does (acta/server/src/worker.ts), rather than loading
// @cloudflare/workers-types, whose globals collide with Node's in this package.

/** A Worker-side WebSocket: the standard one plus Cloudflare's additions. */
export interface CfWebSocket {
  readonly readyState: number
  accept(): void
  send(message: string): void
  close(code?: number, reason?: string): void
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

/** The `WebSocketPair` global: [the client end, the server end]. */
type WebSocketPairConstructor = new () => { 0: CfWebSocket; 1: CfWebSocket }

export function newWebSocketPair(): [CfWebSocket, CfWebSocket] {
  const Pair = (globalThis as unknown as { WebSocketPair: WebSocketPairConstructor }).WebSocketPair
  const pair = new Pair()
  return [pair[0], pair[1]]
}

/** A 101 answer that hands `client` to the browser. */
export function upgradeResponse(client: CfWebSocket): Response {
  return new Response(null, { status: 101, webSocket: client } as ResponseInit)
}

export interface DurableObjectStateLike {
  acceptWebSocket(ws: CfWebSocket, tags?: string[]): void
  getWebSockets(tag?: string): CfWebSocket[]
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown
  get(id: unknown): DurableObjectStub
}

export interface D1DatabaseLike {
  prepare(query: string): unknown
}

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface ExecutionContextLike {
  waitUntil(work: Promise<unknown>): void
}

/** A Queue producer binding. */
export interface QueueLike<T> {
  sendBatch(messages: { body: T }[]): Promise<void>
}

/** What a Queue consumer receives. */
export interface MessageBatchLike<T> {
  readonly messages: readonly { readonly body: T; ack(): void; retry(): void }[]
}

/** What wrangler.toml binds, beside the vars and secrets (all strings). */
export interface WorkerEnv {
  DB: D1DatabaseLike
  LIVE: DurableObjectNamespaceLike
  ASSETS: AssetsBinding
  JOBS: QueueLike<unknown>
  [name: string]: unknown
}
