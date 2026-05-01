# Self-Hosted Commercial Licensing

## Running Verba CE for free

The Community Edition can be self-hosted on any infrastructure at no cost. There are no seat limits, expiry dates, or registration requirements. See [docs/self-hosting.md](./docs/self-hosting.md) for setup instructions.

## Unlocking Enterprise Edition features on self-hosted deployments

To enable EE features (`packages/ee/`) on a self-hosted instance, you need a **signed license key** issued by Nubisco Lda.

### How it works

1. Contact [licensing@nubisco.io](mailto:licensing@nubisco.io) with your deployment details (estimated seats, use case, jurisdiction).
2. Nubisco Lda issues a signed license key scoped to your organisation.
3. Set the `LICENSE_KEY` environment variable and restart with `ENABLE_EE=true`.
4. Verba validates the key at boot and unlocks the EE features covered by your plan.

### Offline and air-gapped deployments

License keys include a signature that can be validated locally without phoning home. A configurable grace period allows continued operation if the key cannot be verified (e.g. during network outages).

### What commercial self-hosting means

- You run Verba on your own servers and control your data.
- You are responsible for backups, upgrades, and infrastructure.
- Your license key is tied to your organisation and may not be shared or resold.
- Nubisco Lda does not have access to your data.

### Pricing

Self-hosted EE licenses are priced annually based on seat count. Contact [licensing@nubisco.io](mailto:licensing@nubisco.io) for a quote.

## Evaluation

You may run the EE code locally for development and evaluation without a license key. The `ENABLE_EE=true` flag loads EE modules; without `LICENSE_KEY`, EE features will return `402 Payment Required`. This is intentional. It lets you verify integration before committing to a license.

## Legal

Use of the EE Software is governed by [packages/ee/LICENSE](./packages/ee/LICENSE). The CE is governed by the AGPL-3.0 (see [LICENSE](./LICENSE) and [LICENSE-AGPL.txt](./LICENSE-AGPL.txt)).
