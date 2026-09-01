## [1.9.1](https://github.com/nubisco/verba/compare/v1.9.0...v1.9.1) (2026-09-01)


### Bug Fixes

* **deps:** upgrade @nubisco/ui to 2.5.0 ([cb029e3](https://github.com/nubisco/verba/commit/cb029e3301ceeef208a8443ac00f00edec457d74))

# [1.9.0](https://github.com/nubisco/verba/compare/v1.8.1...v1.9.0) (2026-08-15)


### Features

* **web:** accept the SSO token from the URL fragment ([571afda](https://github.com/nubisco/verba/commit/571afda468aa562b147f99e035722e17c9327658))

## [1.8.1](https://github.com/nubisco/verba/compare/v1.8.0...v1.8.1) (2026-08-14)


### Bug Fixes

* **web:** consume the platform SSO token before it can leak from the URL ([ed48ded](https://github.com/nubisco/verba/commit/ed48dedaa82f08b43a2ead21b4014608d8fb811b))
* **web:** consume the platform SSO token before it can leak from the URL ([adf468b](https://github.com/nubisco/verba/commit/adf468b9ba674de9dcd5ec4e6d3a85b89a6953b2))

# [1.8.0](https://github.com/nubisco/verba/compare/v1.7.0...v1.8.0) (2026-07-21)


### Features

* **web:** adopt NbUserMenu for the sidebar account menu ([f5be074](https://github.com/nubisco/verba/commit/f5be0748ef43a5be3abbd68f1122bf84249dcad1))

# [1.7.0](https://github.com/nubisco/verba/compare/v1.6.1...v1.7.0) (2026-07-19)


### Features

* **auth:** support platform multi-account sessions ([eb9f874](https://github.com/nubisco/verba/commit/eb9f874e042dcf4a7ef0634636ce5078dbd6b0f4))
* **xliff:** add XLIFF import/export interop with skeleton preservation ([491db56](https://github.com/nubisco/verba/commit/491db56308262b3752e03cae69528bedda38420f))

## [1.6.1](https://github.com/nubisco/verba/compare/v1.6.0...v1.6.1) (2026-06-16)


### Bug Fixes

* **web:** pipe VITE_ANALYTICS_URL through the Docker build ([4851b54](https://github.com/nubisco/verba/commit/4851b542f66626e51e8b5ca2af417662564d9a1a))

# [1.6.0](https://github.com/nubisco/verba/compare/v1.5.0...v1.6.0) (2026-06-16)


### Features

* **api:** add /version endpoint and wire analytics env into compose ([ca77c1f](https://github.com/nubisco/verba/commit/ca77c1fd3411d2a26ca286304a572d21448ecc48))

# [1.5.0](https://github.com/nubisco/verba/compare/v1.4.1...v1.5.0) (2026-06-16)


### Features

* **analytics:** replace PostHog with @nubisco/analytics across web and api ([ac1ee09](https://github.com/nubisco/verba/commit/ac1ee09d860f92d8390dfbb4d4d645c51bdec74f))

## [1.4.1](https://github.com/nubisco/verba/compare/v1.4.0...v1.4.1) (2026-06-09)


### Bug Fixes

* **auth:** use the same sessionStorage keys as LoginView for SSO state ([7ee69b9](https://github.com/nubisco/verba/commit/7ee69b9b5baef1c0f33e52f7b3511d13192a7a0f))

# [1.4.0](https://github.com/nubisco/verba/compare/v1.3.0...v1.4.0) (2026-06-08)


### Features

* **web:** account menu in sidebar, consolidating profile and sign-out ([ea0c2a3](https://github.com/nubisco/verba/commit/ea0c2a3857e7f679896f078226dd30edf7212ac7))

# [1.3.0](https://github.com/nubisco/verba/compare/v1.2.1...v1.3.0) (2026-06-08)


### Features

* **auth:** per-app account bundle with platform login_hint switching ([f5d68fe](https://github.com/nubisco/verba/commit/f5d68fe8d9379bc45ad46197aa8e7c2f89e6f130))

## [1.2.1](https://github.com/nubisco/verba/compare/v1.2.0...v1.2.1) (2026-06-07)


### Bug Fixes

* **docs:** add xmlns to logo SVGs so they render in <img> tags ([7520968](https://github.com/nubisco/verba/commit/7520968739cf287d4d08adc319f129f1d09f119f))

# [1.2.0](https://github.com/nubisco/verba/compare/v1.1.2...v1.2.0) (2026-06-07)


### Features

* **billing:** enforce per-user project cap from platform app_plan claim ([84b5f8b](https://github.com/nubisco/verba/commit/84b5f8beb9975a490b4c64e746b174eb91cb8109))

## [1.1.2](https://github.com/nubisco/verba/compare/v1.1.1...v1.1.2) (2026-05-14)


### Bug Fixes

* **ci:** drop with.version under pnpm/action-setup v6 in publish-cli ([f3cb3cd](https://github.com/nubisco/verba/commit/f3cb3cd71456d890596203f24ca1ff292aeaa2c2))

## [1.1.1](https://github.com/nubisco/verba/compare/v1.1.0...v1.1.1) (2026-05-02)


### Bug Fixes

* use /api proxy fallback in all frontend API references, not just api.ts ([c885c8f](https://github.com/nubisco/verba/commit/c885c8f3b4a47e20d8fafb8d0d9aa53eeba6ed0e))

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
