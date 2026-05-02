# [1.1.0](https://github.com/nubisco/verba/compare/v1.0.2...v1.1.0) (2026-05-02)


### Features

* **auth:** force prompt=login and call platform end-session on logout ([48670be](https://github.com/nubisco/verba/commit/48670bef0358290f991b635bb43c6c8df356f141))

## [1.0.2](https://github.com/nubisco/verba/compare/v1.0.1...v1.0.2) (2026-05-02)


### Bug Fixes

* use prisma db push instead of migrate deploy for PostgreSQL compat ([2d15d2d](https://github.com/nubisco/verba/commit/2d15d2dac8c1fbab8e5dbe4c0da2ac8119882191))

## [1.0.1](https://github.com/nubisco/verba/compare/v1.0.0...v1.0.1) (2026-05-02)


### Bug Fixes

* auto-run migrations in Docker and show Platform-only login ([e354e8f](https://github.com/nubisco/verba/commit/e354e8fe6da0cba41d7086ac07a44aa481e112ff))

# 1.0.0 (2026-05-02)


### Bug Fixes

* add prisma generate to API Dockerfile before TypeScript build ([c6c6482](https://github.com/nubisco/verba/commit/c6c648229cdd954a1189f644521d0e70167682a6))
* copy generated Prisma client from build stage instead of regenerating ([ed9a112](https://github.com/nubisco/verba/commit/ed9a11276225bbf046b6c4c7a90fdddf4d55115f))
* copy Prisma generated client to pnpm store path in Docker bundle ([971f3e0](https://github.com/nubisco/verba/commit/971f3e0bad03c59c0ef0da0874c5476df5e22efe))
* remove hardcoded VITE_API_URL from web Dockerfile so /api proxy is used ([a965c02](https://github.com/nubisco/verba/commit/a965c02290f3d0a21fe05d7185b82148025e9ed1))
* run prisma generate in bundle stage for runtime client ([03adac7](https://github.com/nubisco/verba/commit/03adac708b1727059491729c12e75fb92de26f25))
* switch Prisma provider to postgresql in Docker build ([5bc4e67](https://github.com/nubisco/verba/commit/5bc4e676dfcb078cef364667a4dbaaa7becd0f78))
* use router.push for NbSidebarLink navigation and reset version ([da4e5f9](https://github.com/nubisco/verba/commit/da4e5f90801f45949e6350813648130e726971d9))


### Features

* proxy API through nginx so web image works without baked URL ([66560cd](https://github.com/nubisco/verba/commit/66560cdb2421c10cadf31e32ad6a898993b66463))
* Verba v1.0.0, open-source i18n collaboration engine ([1fbb9c4](https://github.com/nubisco/verba/commit/1fbb9c4f0e569ab65d34924b8047c5e06142d33c))

## [1.1.4](https://github.com/nubisco/verba/compare/v1.1.3...v1.1.4) (2026-05-02)


### Bug Fixes

* switch Prisma provider to postgresql in Docker build ([5bc4e67](https://github.com/nubisco/verba/commit/5bc4e676dfcb078cef364667a4dbaaa7becd0f78))

## [1.1.4](https://github.com/nubisco/verba/compare/v1.1.3...v1.1.4) (2026-05-01)


### Bug Fixes

* switch Prisma provider to postgresql in Docker build ([5bc4e67](https://github.com/nubisco/verba/commit/5bc4e676dfcb078cef364667a4dbaaa7becd0f78))

## [1.1.3](https://github.com/nubisco/verba/compare/v1.1.2...v1.1.3) (2026-05-01)


### Bug Fixes

* remove hardcoded VITE_API_URL from web Dockerfile so /api proxy is used ([a965c02](https://github.com/nubisco/verba/commit/a965c02290f3d0a21fe05d7185b82148025e9ed1))

## [1.1.2](https://github.com/nubisco/verba/compare/v1.1.1...v1.1.2) (2026-05-01)


### Bug Fixes

* copy Prisma generated client to pnpm store path in Docker bundle ([971f3e0](https://github.com/nubisco/verba/commit/971f3e0bad03c59c0ef0da0874c5476df5e22efe))

## [1.1.1](https://github.com/nubisco/verba/compare/v1.1.0...v1.1.1) (2026-05-01)


### Bug Fixes

* copy generated Prisma client from build stage instead of regenerating ([ed9a112](https://github.com/nubisco/verba/commit/ed9a11276225bbf046b6c4c7a90fdddf4d55115f))

# [1.1.0](https://github.com/nubisco/verba/compare/v1.0.1...v1.1.0) (2026-05-01)


### Bug Fixes

* run prisma generate in bundle stage for runtime client ([03adac7](https://github.com/nubisco/verba/commit/03adac708b1727059491729c12e75fb92de26f25))


### Features

* proxy API through nginx so web image works without baked URL ([66560cd](https://github.com/nubisco/verba/commit/66560cdb2421c10cadf31e32ad6a898993b66463))

## [1.0.1](https://github.com/nubisco/verba/compare/v1.0.0...v1.0.1) (2026-05-01)


### Bug Fixes

* add prisma generate to API Dockerfile before TypeScript build ([c6c6482](https://github.com/nubisco/verba/commit/c6c648229cdd954a1189f644521d0e70167682a6))

# 1.0.0 (2026-05-01)


### Features

* Verba v1.0.0, open-source i18n collaboration engine ([1fbb9c4](https://github.com/nubisco/verba/commit/1fbb9c4f0e569ab65d34924b8047c5e06142d33c))

# 1.0.0 (2026-05-01)


### Features

* Verba v1.0.0, open-source i18n collaboration engine ([1fbb9c4](https://github.com/nubisco/verba/commit/1fbb9c4f0e569ab65d34924b8047c5e06142d33c))
