// Refusals because an account's hosted plan is full (402 `plan_limit`).
//
// Any request the plan refuses, from any create flow, reaches every listener
// here, and PlanLimitPrompt shows it once, in the server's own words, with the
// way to upgrade. Nothing is ever refused on an instance without hosted plans,
// so nothing opens there.

export interface PlanLimit {
  code: 'plan_limit'
  resource: 'projects' | 'members' | 'keys'
  limit: number
  current: number
  adding?: number
  /** Set when the account is read-only because it is over its plan. */
  readOnly?: boolean
  over?: { resource: PlanLimit['resource']; limit: number; current: number }[]
  /** What the server said, ready to show. */
  message: string
}

type Listener = (limit: PlanLimit) => void
const listeners = new Set<Listener>()

/** Called for every refusal by the plan. Returns the unsubscribe. */
export function onPlanLimit(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tells the listeners when a response body is a plan_limit refusal. */
export function notePlanLimit(status: number, body: unknown): void {
  const b = body as Partial<PlanLimit> & { error?: unknown }
  if (status !== 402 || b?.code !== 'plan_limit') return
  const limit = { ...(b as PlanLimit), message: typeof b.error === 'string' ? b.error : '' }
  for (const l of listeners) l(limit)
}

type WriteListener = () => void
const writeListeners = new Set<WriteListener>()

/**
 * Called after every write the API accepted. The read-only banner listens, so
 * deleting the last project over the limit lifts it at once.
 */
export function onWrite(listener: WriteListener): () => void {
  writeListeners.add(listener)
  return () => writeListeners.delete(listener)
}

export function noteWrite(): void {
  for (const l of writeListeners) l()
}
