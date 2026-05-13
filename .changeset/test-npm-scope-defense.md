---
"@hmcts-cft/express-session-redis": patch
---

Drop `publishConfig.registry` from this lib's `package.json` to test the new `npm-scope` defence in `cnp-githubactions-library/npm-changesets-release`. The action now writes `@hmcts-cft:registry=<feed>` to the runtime `.npmrc`, so scoped publishes route to the Azure feed regardless of whether each `package.json` has `publishConfig.registry` set. If this publish succeeds, the defence works.
