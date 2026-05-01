# Open-Core Model

Verba uses an open-core licensing model. The project ships as a single repository containing both the free Community Edition and the optional commercial Enterprise Edition.

## Community Edition (CE)

Everything outside `packages/ee/` is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html).

CE includes the full translation collaboration platform:

- Projects, namespaces, keys, and locales
- Four-stage translation workflow (TODO, IN_PROGRESS, SUBMITTED, APPROVED)
- Role-based access control (Admin, Maintainer, Translator, Reader)
- Import from JSON, CSV, or XLSX
- Export to JSON, CSV, or XLSX (approved translations only)
- Audit log, threaded comments, and history timeline
- OTP-first authentication
- Plugin system for server-side extensions
- Docker-first deployment (SQLite dev, Postgres production)

CE is fully functional on its own. You do not need EE for any core translation workflow.

## Enterprise Edition (EE)

The `packages/ee/` directory contains proprietary code owned by Nubisco Lda, licensed under a separate commercial license.

EE adds features for larger organizations and managed deployments:

- SSO / SAML authentication
- Multi-tenancy and organization management
- Stripe billing integration
- Signed license key validation for self-hosted deployments
- Advanced audit log export
- Background job orchestration
- Transactional email (Resend)

EE features are loaded at boot time only when `ENABLE_EE=true`. Without that flag, the EE code is never imported or executed.

## Boundary rules

| Direction                              | Allowed?                           |
| -------------------------------------- | ---------------------------------- |
| CE code importing from EE              | **No** (enforced by ESLint and CI) |
| EE code importing from CE shared types | Yes                                |
| EE code importing from CE apps         | **No**                             |

This boundary ensures the AGPL-licensed CE build never bundles proprietary code.

## Contributing

Contributions to the CE codebase are welcome under the AGPL-3.0 license. See the [Contributing guide](./contributing.md) for setup instructions, architecture rules, and PR guidelines.

All contributors must sign a Contributor License Agreement (CLA) before their first PR can be merged.
