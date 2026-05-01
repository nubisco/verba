# Verba Open-Core Model

Verba is an open-core product. This document explains what that means, what is free and open, and what requires a commercial license.

## What is open-core?

Open-core means the foundational product is released as genuine open-source software, while advanced features aimed at teams and enterprises are offered under a commercial license. The open-source core is not a stripped-down demo. It is a fully functional, production-ready tool.

## Community Edition (CE)

**License:** AGPL-3.0-or-later
**Code:** everything outside `packages/ee/`

The CE includes:

- Full translation workflow (TODO → IN_PROGRESS → SUBMITTED → APPROVED)
- Role-based access control (Admin, Maintainer, Translator, Reader)
- Namespace-scoped permissions
- Import from CSV and XLSX
- Export to JSON, CSV, and XLSX
- Audit log
- Threaded comments
- Real-time collaboration via WebSocket
- Kanban board and personal dashboard
- CLI installer
- Docker Compose deployment
- Plugin system

The CE is free to self-host, modify, and redistribute under the AGPL. If you run a modified version as a networked service, you must make your modifications available under the AGPL.

## Enterprise Edition (EE)

**License:** Proprietary (Nubisco Lda)
**Code:** `packages/ee/`

The EE adds features for larger teams and organisations:

- SSO / SAML authentication
- Advanced audit log export
- Multi-tenancy / organisation management
- Plan-based resource limits
- Signed license key validation
- Billing integration
- Background job orchestration
- Transactional email (Resend)

EE source code is available for inspection and local development. Production use requires a valid license key from Nubisco Lda.

## Deployment modes

| Mode                | Description                               | CE                  | EE                   |
| ------------------- | ----------------------------------------- | ------------------- | -------------------- |
| **OSS self-hosted** | You run Verba on your own infrastructure  | Free                | n/a                  |
| **Managed SaaS**    | Hosted by Nubisco at verba.io             | Free tier available | Paid plans           |
| **Self-hosted EE**  | Your infrastructure, EE features unlocked | Included            | License key required |

## Licensing philosophy

We believe in honest open-core: the CE is genuinely useful and not artificially limited. EE features exist because they require significant ongoing investment to build and maintain, and commercial licensing is how that investment is funded.

The license split is enforced contractually and legally, not with DRM or obfuscated code. The source is readable, auditable, and available for local development by anyone.

For details: [COMMERCIAL.md](./COMMERCIAL.md)
