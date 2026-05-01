export interface AuthConfig {
  mode: 'local_otp' | 'local_password' | 'hybrid'
  localOtpEnabled: boolean
  localPasswordEnabled: boolean
  platformEnabled: boolean
  platformIssuer: string | null
  platformAppId: string | null
}

export interface PublicInstanceConfig {
  features: {
    organizations: boolean
  }
  auth: AuthConfig
}

export function getAuthConfig(): AuthConfig {
  const localPasswordEnabled = process.env.ENABLE_LOCAL_PASSWORD === 'true'
  const localOtpEnabled = process.env.DISABLE_LOCAL_OTP !== 'true'
  const platformIssuer = process.env.PLATFORM_ISSUER ?? null
  const platformAppId = process.env.PLATFORM_APP_ID ?? null
  const platformEnabled = Boolean(platformIssuer)

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
