export interface AuthConfig {
  mode: 'local_otp' | 'local_password' | 'hybrid'
  localOtpEnabled: boolean
  localPasswordEnabled: boolean
  platformEnabled: boolean
  platformIssuer: string | null
  platformAppId: string | null
}

/** Federated sign-in, resolved asynchronously from the EE package in routes/config. */
export interface SsoPublicConfig {
  enabled: boolean
  mode: 'oidc' | 'handover' | null
  label: string | null
}

export interface PublicInstanceConfig {
  features: {
    organizations: boolean
  }
  auth: AuthConfig & { sso?: SsoPublicConfig }
}

export function getAuthConfig(): AuthConfig {
  const localPasswordEnabled = process.env.ENABLE_LOCAL_PASSWORD === 'true'
  const localOtpEnabled = process.env.DISABLE_LOCAL_OTP !== 'true'
  const platformIssuer = process.env.PLATFORM_ISSUER ?? null
  const platformAppId = process.env.PLATFORM_APP_ID ?? null
  // Both, not just the issuer. The app id is the slug the platform knows this
  // deployment by, and it is not guessable: ours is registered as
  // `nubisco-verba`, while the frontend used to fall back to `verba` when the
  // variable was unset. That fallback is why platform sign-in was returning
  // `unknown_app` rather than a login screen, and a wrong guess is
  // indistinguishable from an outage from the browser. An issuer with no app
  // id is a half-configured instance, so the button is not offered at all.
  const platformEnabled = Boolean(platformIssuer && platformAppId)

  if (localPasswordEnabled && localOtpEnabled) {
    return {
      mode: 'hybrid',
      localOtpEnabled,
      localPasswordEnabled,
      platformEnabled,
      platformIssuer,
      platformAppId,
    }
  }

  return {
    mode: localPasswordEnabled ? 'local_password' : 'local_otp',
    localOtpEnabled,
    localPasswordEnabled,
    platformEnabled,
    platformIssuer,
    platformAppId,
  }
}

export function getPublicInstanceConfig(): PublicInstanceConfig {
  return {
    features: {
      organizations: process.env.ENABLE_ORGANIZATIONS === 'true',
    },
    auth: getAuthConfig(),
  }
}
