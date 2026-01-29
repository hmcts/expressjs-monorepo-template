# Terraform Format Job

## Purpose

Validates that all Terraform files are properly formatted. This job uses the [cnp-githubactions-library terraform-fmt action](https://github.com/hmcts/cnp-githubactions-library/blob/main/terraform-fmt/README.md).

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `working-directory` | No | `infrastructure` | Directory containing Terraform files |

## Outputs

None

## Secrets

None required - format check runs without Azure authentication.

## Usage

```yaml
terraform-fmt:
  name: Terraform Format
  uses: ./.github/workflows/job.terraform-fmt.yml
```

The job is typically called from `stage.infrastructure.yml` which handles change detection at the workflow level.

## Local Development

```bash
cd infrastructure
terraform fmt -recursive
```

## Implementation

This job uses `hmcts/cnp-githubactions-library/terraform-fmt@main`. See the [library documentation](https://github.com/hmcts/cnp-githubactions-library/blob/main/terraform-fmt/README.md) for full details.
