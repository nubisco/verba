// Work that finishes after the response, such as an analytics event or a live
// update sent to other tabs.
//
// On Node the process keeps running, so a promise left to finish on its own
// does finish. On a Cloudflare Worker, work still running when the response
// is sent can be cancelled, so the Worker entry points this at
// `executionCtx.waitUntil` for every request (as Acta's `setDeferrer` does).
// Failures are logged here, never thrown at the caller.

type Deferrer = (work: Promise<unknown>) => void

let deferrer: Deferrer = () => {}

/** Who keeps deferred work alive. The Worker entry sets this per request. */
export function setDeferrer(next: Deferrer): void {
  deferrer = next
}

/** Let `work` finish after the response without holding it up. */
export function defer(work: Promise<unknown>, what = 'deferred work'): void {
  const guarded = work.catch((err) => console.warn(`[defer] ${what} failed:`, err?.message ?? err))
  deferrer(guarded)
}
