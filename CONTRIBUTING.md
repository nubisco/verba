# Contributing to Verba

Thank you for your interest in contributing! This document explains how to contribute, what the boundaries are between the open-source core and the Enterprise Edition, and what rights you grant Nubisco Lda by submitting contributions.

For the developer-focused setup guide, see [docs/contributing.md](./docs/contributing.md).

## What you can contribute to

### Community Edition (CE): open to all contributors

All code outside `packages/ee/` is part of the AGPL-3.0-licensed Community Edition. Bug fixes, new features, documentation improvements, and tests are all welcome here.

### Enterprise Edition (EE): Nubisco Lda only

The `packages/ee/` directory contains proprietary code owned by Nubisco Lda. External contributions to EE code are not accepted at this time. If you have a feature request for an EE feature, please open an issue tagged `area:ee`.

## Contributor License Agreement

By submitting a pull request you agree to the [Contributor License Agreement](./CLA.md). The key points:

- **You keep your copyright.** The CLA grants Nubisco Lda a license to use your contribution. It does not transfer ownership.
- **Commercial use.** Nubisco Lda may include your CE contributions in commercial products, including the Enterprise Edition. This is how open-core projects are funded.
- **Your AGPL rights are unaffected.** The CLA does not limit your rights as a user of the Community Edition.

## How to contribute

1. **Open an issue first** for non-trivial changes. Alignment before implementation saves everyone time.
2. **Fork and branch** from `master`. Use a descriptive branch name (`fix/import-csv-encoding`, `feat/key-search-debounce`).
3. **Follow the architecture rules** in [AGENTS.md](./AGENTS.md): routes call services, never Prisma directly; Zod for all input; emit events after mutations; audit every mutation.
4. **Write tests.** Every ACL rule and workflow transition must be covered.
5. **Run `pnpm build && pnpm test`** before opening a PR.
6. **Keep PRs focused.** One concern per PR.

## Code of conduct

All contributors are expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Questions?

Open a [GitHub Discussion](https://github.com/nubisco/verba/discussions) or email [legal@nubisco.io](mailto:legal@nubisco.io) for licensing questions.

## Quality gate

Before committing or pushing, run:

```sh
pnpm run quality:check
```

The local Git hooks are expected to enforce the same gate automatically. Commits must not proceed unless tests, linting, formatting, and type checks all pass.
