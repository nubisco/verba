import { z } from 'zod'

/** The terms version a person ticked, on an instance that asks for terms. */
const termsVersion = z.string().trim().min(1).max(40).optional()

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  termsVersion,
})

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const OtpRequestSchema = z.object({
  email: z.string().email(),
})

export const OtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Code must be a 6-digit OTP'),
  termsVersion,
})

export const AcceptTermsSchema = z.object({
  version: z.string().trim().min(1).max(40),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type OtpRequestInput = z.infer<typeof OtpRequestSchema>
export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>
