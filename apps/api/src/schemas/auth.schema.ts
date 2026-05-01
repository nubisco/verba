import { z } from 'zod'

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type OtpRequestInput = z.infer<typeof OtpRequestSchema>
export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>
