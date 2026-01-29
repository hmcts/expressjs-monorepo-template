# Terraform Job

## Purpose

Runs Terraform plan and optionally apply against Azure infrastructure. This job is a thin wrapper around the [cnp-githubactions-library terraform-deploy workflow](https://github.com/hmcts/cnp-githubactions-library/blob/main/.github/workflows/terraform-deploy.md).

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `environment` | Yes | - | Target environment (e.g., `aat`) |
| `subscription` | Yes | - | Azure subscription name (e.g., `DCD-CNP-DEV`) |
| `aks-subscription` | Yes | - | Azure subscription for AKS cluster (e.g., `DCD-CFTAPPS-STG`) |
| `storage-account` | Yes | - | Storage account postfix (`nonprod`, `prod`) |
| `plan-only` | No | `false` | Run plan only, skip apply |
| `working-directory` | No | `infrastructure` | Directory containing Terraform files |

## Outputs

| Name | Description |
|------|-------------|
| `plan-exitcode` | Terraform plan exit code: `0` = no changes, `2` = changes detected |
| `has-changes` | Boolean indicating if plan has changes |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `AZURE_CREDENTIALS_CFT_PREVIEW` | Yes | Azure Service Principal credentials (JSON) |

## Usage

**Plan only (PRs):**
```yaml
terraform:
  name: Terraform
  needs: [terraform-fmt]
  uses: ./.github/workflows/job.terraform.yml
  with:
    environment: aat
    subscription: DCD-CNP-DEV
    aks-subscription: DCD-CFTAPPS-STG
    storage-account: nonprod
    plan-only: true
  secrets: inherit
```

**Plan and Apply (main branch):**
```yaml
terraform:
  name: Terraform
  needs: [terraform-fmt]
  uses: ./.github/workflows/job.terraform.yml
  with:
    environment: aat
    subscription: DCD-CNP-DEV
    aks-subscription: DCD-CFTAPPS-STG
    storage-account: nonprod
    plan-only: false
  secrets: inherit
```

The job is typically called from `stage.infrastructure.yml` which handles change detection at the workflow level.

## Implementation

This job delegates to `hmcts/cnp-githubactions-library/.github/workflows/terraform-deploy.yaml@main`. See the [library documentation](https://github.com/hmcts/cnp-githubactions-library/blob/main/.github/workflows/terraform-deploy.md) for full details on:

- State storage configuration
- Environment tag mapping
- PR comment features
- Backend configuration
