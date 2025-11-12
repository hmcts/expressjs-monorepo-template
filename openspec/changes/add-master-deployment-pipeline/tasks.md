# Implementation Tasks

## 1. Terraform Infrastructure Setup
- [x] 1.1 Create `infrastructure/` directory with standard HMCTS structure
- [x] 1.2 Add `main.tf` with provider and backend configuration
- [x] 1.3 Add `variables.tf` for environment, product, component
- [x] 1.4 Add `state.tf` for Azure Storage backend
- [x] 1.5 Add `.terraform-version` file
- [x] 1.6 Add `versions.tf` for provider version constraints
- [x] 1.7 Document required Azure resources and permissions

## 2. GitHub Actions Workflow
- [x] 2.1 Create `.github/workflows/master-deploy.yml`
- [x] 2.2 Add job to detect affected apps (reuse `detect-affected-apps.sh`)
- [x] 2.3 Add terraform plan and apply job with Azure authentication
- [x] 2.4 Add matrix build job for affected apps (reuse preview pattern)
- [x] 2.5 Add job to package and publish Helm umbrella chart to ACR
- [x] 2.6 Configure job dependencies: terraform → images → helm chart
- [x] 2.7 Add workflow concurrency controls

## 3. Secrets and Configuration
- [x] 3.1 Document required GitHub secrets (AZURE_CREDENTIALS, ACR credentials)
- [x] 3.2 Configure image tagging for master (git SHA, latest)
- [x] 3.3 Set ACR registry URLs and chart repository paths

## 4. Helm Chart Publishing
- [x] 4.1 Add script to package umbrella chart
- [x] 4.2 Add script to push chart to ACR OCI registry
- [x] 4.3 Update chart version on master builds
- [x] 4.4 Test chart pull from registry

## 5. Documentation
- [x] 5.1 Document deployment process in docs/ or README
- [x] 5.2 Document required Azure permissions and setup
- [x] 5.3 Add troubleshooting guide for common issues
