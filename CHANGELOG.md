# [1.16.0](https://github.com/nubisco/verba/compare/v1.15.1...v1.16.0) (2026-10-24)


### Features

* **user-menu:** Profile opens Nubisco Platform, the profile page becomes Your settings ([3db2fe4](https://github.com/nubisco/verba/commit/3db2fe4693b56cffdefb86aa08e6bf67da26adab))

## [1.15.1](https://github.com/nubisco/verba/compare/v1.15.0...v1.15.1) (2026-10-24)


### Bug Fixes

* **ui:** pin the light theme ahead of the user menu's theme picker ([6b52552](https://github.com/nubisco/verba/commit/6b5255270aa39d7c607d917e8d9d8f90167ee641))

# [1.15.0](https://github.com/nubisco/verba/compare/v1.14.0...v1.15.0) (2026-10-24)


### Features

* **auth:** keep the Platform avatar, and return it from /auth/me ([eca77ec](https://github.com/nubisco/verba/commit/eca77ec9582b387843e84280788ca11911cea97b))
* **web:** the rail's fleet anatomy, with the bell on NbNotificationCenter ([c9226af](https://github.com/nubisco/verba/commit/c9226af7dde2a9b25d7078ed39fd750f1a43ff78))

# [1.14.0](https://github.com/nubisco/verba/compare/v1.13.1...v1.14.0) (2026-10-24)


### Bug Fixes

* **web:** project settings fit a phone ([9e67f8e](https://github.com/nubisco/verba/commit/9e67f8eb8989a0265c418075a760fd7e8635230a))


### Features

* **ai:** the project's own key, sealed under AI_ENCRYPTION_KEY, with usage and fetched prices ([44a6f1d](https://github.com/nubisco/verba/commit/44a6f1da0c591c0fe80d0f04dd948b22dfd749f3))
* **web:** one AI tab in project settings, built from @nubisco/ui ([7a8a1c0](https://github.com/nubisco/verba/commit/7a8a1c0a964da9f2eda74a6d41e3f7feaa29c89a))

## [1.13.1](https://github.com/nubisco/verba/compare/v1.13.0...v1.13.1) (2026-10-24)


### Bug Fixes

* **acl:** find every nested row through the project in the URL ([623f954](https://github.com/nubisco/verba/commit/623f9544210151cf655f67cf475cdfd4eb6959fa))
* **admin:** operators are named in VERBA_OPERATORS, not first to sign up ([34387db](https://github.com/nubisco/verba/commit/34387db4df07e4b90ca0a540122c20bb747e226a))
* **ai:** encrypt AI keys with a dedicated secret, with no fallback ([dcaad16](https://github.com/nubisco/verba/commit/dcaad16f612530b9a7343f3ec03201c58d5de891))
* **auth:** cap OTP guesses and rate limit every sign-in door ([f230e92](https://github.com/nubisco/verba/commit/f230e927a8aeafbc90f9222d3a9fbb041a1ae830))
* **auth:** refuse Platform tokens minted for another Nubisco app ([aa1d43b](https://github.com/nubisco/verba/commit/aa1d43b405bedc0abc5b27a467d4ca13eed2e62b))
* **auth:** sessions expire and renew, and cookies are secure and lax ([7278dc2](https://github.com/nubisco/verba/commit/7278dc291370e9d76b2fbae790c107c1b0ff2bc0))
* **db:** apply a reviewed PostgreSQL migration history instead of db push ([9f51998](https://github.com/nubisco/verba/commit/9f51998b986046a8f53b559925a66d9136e22430))
* **members:** scope the user directory to people who share a project ([e8da04e](https://github.com/nubisco/verba/commit/e8da04e66abf6c8355fde874b9d78ea0eb45af4b))
* **workflow:** a translation's status moves only through the workflow route ([72162ad](https://github.com/nubisco/verba/commit/72162adbd8579d7beed13f4d57691e30c55dd3ec))
* **ws:** join a project's room only as a member of the project ([e73a145](https://github.com/nubisco/verba/commit/e73a14570c98ee1f301c9b420793f6b3fd602f00))

# [1.13.0](https://github.com/nubisco/verba/compare/v1.12.0...v1.13.0) (2026-10-24)


### Bug Fixes

* **deps:** upgrade zod from 4.3.6 to 4.6.7 ([8935387](https://github.com/nubisco/verba/commit/89353871866baff20a9d1c33feefc2ad32294e4c))
* **web:** keep every topbar action on screen on a phone ([2533219](https://github.com/nubisco/verba/commit/2533219b0252b5b163dc595cab5bcec242d162e8))
* **web:** keep the project overview's export buttons on screen on a phone ([75b4eb8](https://github.com/nubisco/verba/commit/75b4eb880154dfedab211fbc041184bb5f602799))


### Features

* **cli:** make prisma db push the supported way to apply the schema ([e298863](https://github.com/nubisco/verba/commit/e298863d7f2ba74f73ec3dcb2be696736b1f224c))
* **web:** render in Plus Jakarta Sans and Fira Code ([b11af0d](https://github.com/nubisco/verba/commit/b11af0dadae71a9a27aa7c038cce54608420c3cb))

# [1.12.0](https://github.com/nubisco/verba/compare/v1.11.3...v1.12.0) (2026-10-23)


### Features

* **shell:** collapsible rail with the toggle beside the brand ([8f6fc58](https://github.com/nubisco/verba/commit/8f6fc58e30b1b701514e2e0f73893730491ecb8b))

## [1.11.3](https://github.com/nubisco/verba/compare/v1.11.2...v1.11.3) (2026-10-23)


### Bug Fixes

* **import:** read CSV as UTF-8 and every cell as text ([220eaa4](https://github.com/nubisco/verba/commit/220eaa433261f170c6c06645c4baa356fcaedf8f))

## [1.11.2](https://github.com/nubisco/verba/compare/v1.11.1...v1.11.2) (2026-10-23)


### Bug Fixes

* **deps:** take xlsx 0.20.3 from SheetJS to clear two high advisories ([69a373c](https://github.com/nubisco/verba/commit/69a373cc0272f8e7ec1e34a3f5f26b6855fadb52))

## [1.11.1](https://github.com/nubisco/verba/compare/v1.11.0...v1.11.1) (2026-10-23)


### Bug Fixes

* **deps:** patch api security advisories ([d331481](https://github.com/nubisco/verba/commit/d3314811f6d41f586114d4bd462d55fb643a5ce0))
* **deps:** refresh web vue and vite within their majors ([c3f1a77](https://github.com/nubisco/verba/commit/c3f1a77a07e228b86345d81e1df46829eb12858a))
* **docker:** copy referenced tsconfigs into the web build stage ([02a4911](https://github.com/nubisco/verba/commit/02a49119a40ffc31af12b740260f285088711e76))

# [1.11.0](https://github.com/nubisco/verba/compare/v1.10.2...v1.11.0) (2026-09-25)


### Features

* **theme:** take the accent from the engineers category ([8b315e2](https://github.com/nubisco/verba/commit/8b315e23afbee0d0568a61c3b0947daf98ba6e4d)), closes [#5b48c9](https://github.com/nubisco/verba/issues/5b48c9) [#a99dff](https://github.com/nubisco/verba/issues/a99dff)

## [1.10.2](https://github.com/nubisco/verba/compare/v1.10.1...v1.10.2) (2026-09-17)


### Bug Fixes

* generate the Prisma client before building ([7e118ee](https://github.com/nubisco/verba/commit/7e118ee84a79a3172f4bc768b5af6d1da1d8da5d))

## [1.10.1](https://github.com/nubisco/verba/compare/v1.10.0...v1.10.1) (2026-09-15)


### Bug Fixes

* **auth:** reach the EE package only through the typed boundary ([72c22ff](https://github.com/nubisco/verba/commit/72c22ffac295dd8c71d915eb0dc992ca3527a8ca))

# [1.10.0](https://github.com/nubisco/verba/compare/v1.9.2...v1.10.0) (2026-09-15)


### Bug Fixes

* **auth:** send the app id Platform actually knows this deployment by ([1ed02a8](https://github.com/nubisco/verba/commit/1ed02a83d9e96bba6c1689c95e8f02712d57d79c))


### Features

* **auth:** OpenID Connect against any provider, run server-side ([aca3b4f](https://github.com/nubisco/verba/commit/aca3b4f6b3c984bb0f6130807a486e71c3aacb55))

## [1.9.2](https://github.com/nubisco/verba/compare/v1.9.1...v1.9.2) (2026-09-14)


### Bug Fixes

* **deps:** upgrade @nubisco/ui to 5.0.0 ([cbb0afb](https://github.com/nubisco/verba/commit/cbb0afb342459457f579339918d0f15793f7baba))

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
