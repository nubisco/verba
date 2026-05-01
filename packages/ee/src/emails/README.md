# EE: Emails

Transactional email adapter using Resend as the primary provider. Sends notifications
for mentions, review requests, and license events. No-op in OSS mode: missing config
never causes application errors.

**Required env vars:** `LICENSE_KEY`, `RESEND_API_KEY`

Tracked in: Milestone 18: Deployment and provider abstractions
