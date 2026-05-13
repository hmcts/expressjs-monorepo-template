---
"@hmcts-cft/simple-router": major
---

Rename `@hmcts/simple-router` to `@hmcts-cft/simple-router` and publish to the HMCTS Azure Artifacts `hmcts-lib` feed instead of public npm. The previous `@hmcts` scope on npmjs.org was never successfully populated; the CFT-allocated `@hmcts-cft` scope on Azure Artifacts is the canonical home going forward. Consumers must update their imports and add an `.npmrc` scope-mapping for `@hmcts-cft` to the Azure feed.
