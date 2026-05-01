# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |

Verba is pre-1.0. Only the latest commit on `master` receives security fixes.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities by email to **[security@nubisco.io](mailto:security@nubisco.io)**.

Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected versions or commits, if known
- Your preferred contact for follow-up

## Response timeline

- **Acknowledgement:** within 3 business days
- **Initial assessment:** within 7 business days
- **Fix or mitigation:** depends on severity; critical issues are prioritised

We will credit reporters in the release notes unless you prefer to remain anonymous.

## Scope

In scope:

- Authentication and session management (JWT, OTP)
- Access control bypass (ACL, role escalation)
- SQL injection via Prisma queries
- Remote code execution via plugin loader or import processing
- Sensitive data exposure

Out of scope:

- Vulnerabilities in development-only configurations (`JWT_SECRET=dev-secret`)
- Self-XSS or issues requiring physical access to the machine
- Denial-of-service via resource exhaustion without a specific exploit chain
