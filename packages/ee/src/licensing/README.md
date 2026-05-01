# EE: Licensing

Signed license key validation for self-hosted EE deployments. Verifies RSA-signed
license payloads, checks seat counts, feature flags, and expiry. Includes an offline
verification path with a configurable grace period.

**Required env vars:** `LICENSE_KEY`

Tracked in: Milestone 17: Self-hosted commercial licensing
