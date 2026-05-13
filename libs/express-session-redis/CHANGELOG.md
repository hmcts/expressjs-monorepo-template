# @hmcts-cft/express-session-redis

## [0.1.2](https://github.com/hmcts/expressjs-monorepo-template/compare/express-session-redis-v0.1.1...express-session-redis-v0.1.2) (2026-05-13)


### Bug Fixes

* add publishConfig.registry to the three new libs ([#644](https://github.com/hmcts/expressjs-monorepo-template/issues/644)) ([80dc36d](https://github.com/hmcts/expressjs-monorepo-template/commit/80dc36d25ddd1e7805c74392c99c314a85201a5f))

## 0.1.1

### Patch Changes

- eb735ed: Drop `publishConfig.registry` from this lib's `package.json` to test the new `npm-scope` defence in `cnp-githubactions-library/npm-changesets-release`. The action now writes `@hmcts-cft:registry=<feed>` to the runtime `.npmrc`, so scoped publishes route to the Azure feed regardless of whether each `package.json` has `publishConfig.registry` set. If this publish succeeds, the defence works.
