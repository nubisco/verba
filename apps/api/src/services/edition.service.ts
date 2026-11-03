// Whether this API runs with the Enterprise Edition, and the one way to load it.
//
// The EE package (`@nubisco/verba-ee`) is imported lazily and typed loosely:
// the Community image compiles against a stub that exports almost nothing, so
// a statically typed import naming anything else would not build there.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EeModule = any

/** EE is on with ENABLE_EE=true, unless OSS_ONLY=true forces the Community Edition. */
export function eeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OSS_ONLY !== 'true' && env.ENABLE_EE === 'true'
}

/** The EE module, or null when it is not installed. */
export async function loadEE(): Promise<EeModule | null> {
  try {
    return (await import('@nubisco/verba-ee')) as EeModule
  } catch {
    return null
  }
}
