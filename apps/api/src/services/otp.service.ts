import crypto from 'node:crypto'
import { prisma } from '../prisma.js'
import { createOtpOnlyUser } from './auth.service.js'

const OTP_EXPIRY_MINUTES = 15

function generateCode(): string {
  // 6-digit numeric code
  return String(crypto.randomInt(100000, 999999))
}

function getOtpEmailHtml(code: string): string {
  return `
      <!doctype html>
      <html lang="en">
        <head><meta charset="UTF-8" /></head>
        <body style="margin:0;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
            <!-- Header: dark bg, logo + product name -->
            <tr>
              <td style="background:#1a1a1a;padding:24px 32px;border-radius:8px 8px 0 0;">
                <img src="https://verba.app/mail-logo.png" width="32" height="32" alt="Verba"
                     style="display:inline-block;vertical-align:middle;margin-right:10px;" />
                <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.3px;vertical-align:middle;">
                  Verba
                </span>
              </td>
            </tr>
            <!-- Content area -->
            <tr>
              <td style="background:#fff;padding:32px 32px 24px;">
                <!-- Eyebrow -->
                <div style="font-size:12px;font-weight:600;letter-spacing:0.5px;color:#888;text-transform:uppercase;margin-bottom:16px;">
                  Sign-in code
                </div>
                <!-- Title -->
                <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a1a;line-height:1.2;">
                  Your one-time login code
                </h1>
                <!-- Description -->
                <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.5;">
                  Use the code below to sign in. It expires in ${OTP_EXPIRY_MINUTES} minutes.
                </p>
                <!-- Code box -->
                <div style="background:#f5f6fa;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
                  <span style="font-size:2.5rem;font-weight:700;letter-spacing:0.5rem;color:#7c3aed;font-family:monospace;">
                    ${code}
                  </span>
                </div>
                <!-- Security note -->
                <p style="margin:0;font-size:12px;color:#888;line-height:1.5;">
                  If you didn't request this code, you can safely ignore this email. Your account remains secure.
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f9f9f9;padding:24px 32px;border-radius:0 0 8px 8px;text-align:center;border-top:1px solid #eee;">
                <p style="margin:0 0 12px;font-size:12px;color:#888;">
                  Verba is the open-source i18n collaboration tool.
                </p>
                <a href="https://verba.app" style="font-size:12px;color:#7c3aed;text-decoration:none;">
                  Learn more at verba.app
                </a>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const subject = `Your Verba login code: ${code}`
  const text = `Your one-time login code is: ${code}\n\nIt expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, you can ignore this email.`
  const html = getOtpEmailHtml(code)

  // Try Resend first if API key is configured
  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'noreply@verba.app',
        to: email,
        subject,
        text,
        html,
      }),
    })
    if (!res.ok) {
      throw new Error(`Resend API error: ${res.statusText}`)
    }
    return
  }

  // Fall back to SMTP if configured
  if (process.env.SMTP_HOST) {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@verba.app',
      to: email,
      subject,
      text,
      html,
    })
    return
  }

  // Dev mode: log to stdout
  console.log(`[OTP] Code for ${email}: ${code}  (expires in ${OTP_EXPIRY_MINUTES}m)`)
}

export async function requestOtp(email: string): Promise<void> {
  // Delete any existing unused OTPs for this email
  await prisma.otpToken.deleteMany({ where: { email, used: false } })

  const code = generateCode()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  await prisma.otpToken.create({ data: { email, code, expiresAt } })
  await sendOtpEmail(email, code)
}

export async function verifyOtp(
  email: string,
  code: string,
): Promise<{ userId: string; email: string; isGlobalAdmin: boolean }> {
  const otp = await prisma.otpToken.findFirst({
    where: { email, code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp) {
    throw Object.assign(new Error('Invalid or expired code'), {
      statusCode: 401,
    })
  }

  // Mark used
  await prisma.otpToken.update({ where: { id: otp.id }, data: { used: true } })

  // Find or create user (passwordless auto-register)
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    await createOtpOnlyUser(email)
    user = await prisma.user.findUnique({ where: { email } })
  }

  if (!user) {
    throw Object.assign(new Error('Unable to provision user for OTP login'), {
      statusCode: 500,
    })
  }

  if (user.deactivatedAt != null) {
    throw Object.assign(new Error('Account is deactivated. Contact an administrator.'), {
      statusCode: 403,
    })
  }

  return {
    userId: user.id,
    email: user.email,
    isGlobalAdmin: user.isGlobalAdmin,
  }
}
