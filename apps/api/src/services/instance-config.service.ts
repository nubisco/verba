export interface AuthConfig {
  /**
   * `platform`: federated sign-in only (VERBA_AUTH_MODE=platform). No setup
   * wizard, no email codes, no passwords. Hosted Verba runs this way, with
   * Accord as the identity provider.
   */
  mode: 'local_otp' | 'local_password' | 'hybrid' | 'platform'
  localOtpEnabled: boolean
  localPasswordEnabled: boolean
  platformEnabled: boolean
  platformIssuer: string | null
  /**
   * Where the browser talks to the platform: sign-in, the account switcher's
   * identities calls. Accord keeps the issuer as an identifier in tokens and
   * holds browser sessions on its auth host. Defaults to the issuer.
   */
  platformAuthOrigin: string | null
  platformAppId: string | null
}

/** Federated sign-in, resolved asynchronously from the EE package in routes/config. */
export interface SsoPublicConfig {
  enabled: boolean
  mode: 'oidc' | 'handover' | null
  label: string | null
}

export interface PublicInstanceConfig {
  // Accounts used to sit behind ENABLE_ORGANIZATIONS, reported here. They are
  // always on now, so there are no instance feature flags left to report. The
  // object stays so a client reading `features` keeps working.
  features: Record<string, boolean>
  auth: AuthConfig & { sso?: SsoPublicConfig }
}

/**
 * Whether this instance signs people in through its identity provider only
 * (VERBA_AUTH_MODE=platform, decided by Jose on 2026-11-04 for hosted Verba).
 *
 * On: no first-run wizard, no email codes, no password sign-in or
 * registration, whatever ENABLE_LOCAL_PASSWORD and DISABLE_LOCAL_OTP say. The
 * operator's first federated sign-in provisions them instead
 * (platform-auth.service.ts). Unset, or any other value, keeps the local
 * methods, so a self-hosted instance is unaffected.
 */
export function platformOnlyAuth(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERBA_AUTH_MODE?.trim().toLowerCase() === 'platform'
}

export function getAuthConfig(): AuthConfig {
  const platformOnly = platformOnlyAuth()
  const localPasswordEnabled = !platformOnly && process.env.ENABLE_LOCAL_PASSWORD === 'true'
  const localOtpEnabled = !platformOnly && process.env.DISABLE_LOCAL_OTP !== 'true'
  const platformIssuer = process.env.PLATFORM_ISSUER ?? null
  const platformAppId = process.env.PLATFORM_APP_ID ?? null
  // `||`, not `??`: compose passes an unset variable through as ''.
  const platformAuthOrigin = process.env.PLATFORM_AUTH_ORIGIN?.replace(/\/$/, '') || platformIssuer
  // Both, not just the issuer. The app id is the slug the platform knows this
  // deployment by, and it is not guessable: ours is registered as
  // `nubisco-verba`, while the frontend used to fall back to `verba` when the
  // variable was unset. That fallback is why platform sign-in was returning
  // `unknown_app` rather than a login screen, and a wrong guess is
  // indistinguishable from an outage from the browser. An issuer with no app
  // id is a half-configured instance, so the button is not offered at all.
  const platformEnabled = Boolean(platformIssuer && platformAppId)

  if (platformOnly) {
    return {
      mode: 'platform',
      localOtpEnabled,
      localPasswordEnabled,
      platformEnabled,
      platformIssuer,
      platformAuthOrigin,
      platformAppId,
    }
  }

  if (localPasswordEnabled && localOtpEnabled) {
    return {
      mode: 'hybrid',
      localOtpEnabled,
      localPasswordEnabled,
      platformEnabled,
      platformIssuer,
      platformAuthOrigin,
      platformAppId,
    }
  }

  return {
    mode: localPasswordEnabled ? 'local_password' : 'local_otp',
    localOtpEnabled,
    localPasswordEnabled,
    platformEnabled,
    platformIssuer,
    platformAuthOrigin,
    platformAppId,
  }
}

export function getPublicInstanceConfig(): PublicInstanceConfig {
  return {
    features: {},
    auth: getAuthConfig(),
  }
}
