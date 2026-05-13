# @hmcts-cft/cloud-native-platform

## 2.0.0

### Major Changes

- a5f94f2: First publish of `@hmcts-cft/cloud-native-platform` to the HMCTS Azure Artifacts `hmcts-lib` feed. Provides health-check middleware (`/health`, `/health/liveness`, `/health/readiness`), Application Insights monitoring middleware, a free-function `trackException` helper, and properties-volume / Azure Key Vault secret loading (`getPropertiesVolumeSecrets`, `addFromAzureVault`). Previously workspace-only as `@hmcts/cloud-native-platform`; the new published name is `@hmcts-cft/cloud-native-platform`, matching the `@hmcts-cft` scope used for other libraries on the same feed. Consumers must update their imports and add an `.npmrc` scope mapping for `@hmcts-cft` to the Azure feed.
