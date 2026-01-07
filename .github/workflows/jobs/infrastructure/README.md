# Terraform Jobs

This directory documents the Terraform-related CI/CD jobs.

## Jobs Overview

| Job | Workflow | Purpose |
|-----|----------|---------|
| Terraform Format | `job.terraform-fmt.yml` | Validates Terraform code formatting |
| Terraform | `job.terraform.yml` | Runs Terraform plan/apply |

---

## Terraform Format Job

### Purpose

Validates that all Terraform files are properly formatted. Fails fast if formatting issues are detected.

### Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `working-directory` | No | `infrastructure` | Directory containing Terraform files |

### Artifacts

None

### Secrets

None required - format check runs without Azure authentication.

### Outputs

None

### Usage

```yaml
terraform-fmt:
  uses: ./.github/workflows/job.terraform-fmt.yml
```

---

## Terraform Job

### Purpose

Runs Terraform plan and optionally apply against Azure infrastructure. Follows HMCTS patterns for state management using Azure Storage backend.

### Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `environment` | Yes | - | Target environment (e.g., `aat`) |
| `subscription` | Yes | - | Azure subscription name (`nonprod`, `prod`) |
| `plan-only` | No | `false` | Run plan only, skip apply |
| `working-directory` | No | `infrastructure` | Directory containing Terraform files |

### Outputs

| Name | Description |
|------|-------------|
| `plan-exitcode` | Terraform plan exit code: `0` = no changes, `2` = changes detected |

### Secrets

| Name | Required | Description |
|------|----------|-------------|
| `AZURE_CREDENTIALS_CFT_AAT` | Yes | Azure Service Principal credentials (JSON) |

The Service Principal requires:
- Storage Account Key access (to read/write Terraform state)
- Contributor on target resource groups
- Key Vault Secrets Officer (to write secrets)

### State Storage

| Component | Pattern |
|-----------|---------|
| Storage Account | `mgmtstatestore{subscription}` |
| Resource Group | `mgmt-state-store-{subscription}` |
| Container | `mgmtstatestorecontainer{environment}` |
| State Key | `{product}/{environment}/terraform.tfstate` |

The product name is extracted from `helm/expressjs-monorepo-template/Chart.yaml`.

### Usage

**Plan only (PRs):**
```yaml
terraform:
  uses: ./.github/workflows/job.terraform.yml
  with:
    environment: aat
    subscription: nonprod
    plan-only: true
  secrets: inherit
```

**Plan and Apply (main branch):**
```yaml
terraform:
  uses: ./.github/workflows/job.terraform.yml
  with:
    environment: aat
    subscription: nonprod
    plan-only: false
  secrets: inherit
```

---

## Pipeline Integration

The terraform jobs are split across two stages:

```
Build Stage (parallel):
├── Lint
├── Terraform Format  ← Fast validation, skipped if no infra changes
├── Test
├── OSV Scanner
└── Build Images
        ↓
Infrastructure Stage:
└── Terraform         ← Plan (PRs) or Plan+Apply (main), skipped if no infra changes
        ↓
Deploy Stage:
└── Helm Deploy
```

- `terraform-fmt` runs in parallel with other lint jobs in Build Stage
- `terraform` runs in its own Infrastructure Stage after Build completes
- Infrastructure Stage runs before Deploy Stage (infra changes applied before app deployment)
- State locking prevents concurrent applies (built into Azure Storage backend)
- **Both jobs skip execution if no files changed in `infrastructure/`**

### Stage Workflows

| Stage | Workflow | Jobs |
|-------|----------|------|
| Build | `stage.build.yml` | terraform-fmt (parallel with lint, test, etc.) |
| Infrastructure | `stage.infrastructure.yml` | terraform (plan or plan+apply) |

### Change Detection

Both terraform jobs detect changes by comparing the current HEAD with:
- **PRs**: The base branch (`origin/master`)
- **Push to main**: The previous commit (`github.event.before`)

If no files in the `infrastructure/` directory have changed, the jobs will complete successfully without running terraform commands, saving CI time and Azure API calls.

## Local Development

### Format Terraform files

```bash
cd infrastructure
terraform fmt -recursive
```

### Run plan locally

```bash
cd infrastructure
az login
terraform init \
  -backend-config="storage_account_name=mgmtstatestorenonprod" \
  -backend-config="container_name=mgmtstatestorecontaineraat" \
  -backend-config="resource_group_name=mgmt-state-store-nonprod" \
  -backend-config="key=expressjs-monorepo-template/aat/terraform.tfstate"

terraform plan -var "env=aat" -var "product=expressjs-monorepo-template" -var "subscription=nonprod"
```

## Version Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Terraform CLI | 1.14.x | Pinned in `.terraform-version` |
| AzureRM Provider | ~> 4.57 | Allows patch updates within 4.57.x |
| actions/checkout | v6 | Latest major version |
| hashicorp/setup-terraform | v3 | Latest major version |
| azure/login | v2 | Latest major version |
