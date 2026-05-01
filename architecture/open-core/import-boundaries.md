# Import Boundaries

_Last updated: 2026-03-21_

## Rule

**CE code must never import from `@nubisco/verba-ee`.**

The EE package contains proprietary code. Any CE module importing it would inadvertently
bundle closed-source IP into the AGPL build, violating the license split.

The allowed dependency direction is:

```
EE  →  CE shared  (allowed)
CE  →  EE         (FORBIDDEN)
```

## Enforcement

An ESLint `no-restricted-imports` rule in `eslint.config.mjs` applies to all CE source:

```js
// eslint.config.mjs
{
  files: [
    'apps/api/**/*.{ts,js}',
    'apps/web/**/*.{ts,vue}',
    'packages/shared/**/*.ts',
    'packages/cli/**/*.ts',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@nubisco/verba-ee', '@nubisco/verba-ee/*', '*/packages/ee*'],
        message: 'CE code must not import from the Enterprise Edition package.',
      }],
    }],
  },
}
```

Any attempt to `import` from the EE package in CE code will fail `pnpm lint`.
CI enforces this on every PR via the lint step.

## Path aliases

| Alias                   | Resolves to                    | Scope                                 |
| ----------------------- | ------------------------------ | ------------------------------------- |
| `@nubisco/verba-shared` | `packages/shared/src/index.ts` | both CE and EE                        |
| `@nubisco/verba-ee`     | `packages/ee/src/index.ts`     | EE internals and API boot loader only |
| `@/`                    | `apps/web/src/`                | web frontend only                     |

Aliases are declared in both `tsconfig.json` (for type resolution) and `vite.config.ts`
(for bundling) where applicable.

## What EE code is allowed to import

EE code (`packages/ee/**`) may import:

- `@nubisco/verba-shared` (shared types)
- Any npm dependency declared in `packages/ee/package.json`
- Nothing from `apps/api`, `apps/web`, or `packages/cli` directly

## Boot-time EE loading

The API entry point (`apps/api/src/index.ts`) is the only CE location permitted to
_optionally_ load EE modules, and only when `ENABLE_EE=true`. This dynamic import
is isolated to the bootstrap sequence and never re-exported into CE services.

See: [adr-open-core-split.md](./adr-open-core-split.md)
