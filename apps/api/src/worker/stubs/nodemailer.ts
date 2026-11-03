// Stands in for nodemailer in the Worker bundle (wrangler.toml [alias]). A
// Worker cannot open SMTP connections, so hosted Verba sends one-time codes
// through Resend (RESEND_API_KEY) and never reaches this.
export function createTransport(): never {
  throw new Error('SMTP is not available on Cloudflare Workers. Set RESEND_API_KEY instead.')
}
export default { createTransport }
