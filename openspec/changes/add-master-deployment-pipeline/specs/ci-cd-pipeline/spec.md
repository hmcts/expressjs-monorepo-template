# Spec: CI/CD Pipeline

## ADDED Requirements

### Requirement: Terraform Infrastructure Provisioning
The pipeline SHALL provision Azure infrastructure using Terraform following HMCTS cloud native platform patterns.

#### Scenario: Successful infrastructure provisioning
- **WHEN** code is pushed to master branch
- **THEN** terraform plan is generated and reviewed
- **AND** terraform apply executes with Azure Storage backend
- **AND** infrastructure state is persisted

#### Scenario: No infrastructure changes
- **WHEN** terraform detects no changes
- **THEN** pipeline skips apply and proceeds to next stage

### Requirement: Affected Apps Detection
The pipeline SHALL detect which apps have changed using Turborepo, reusing the preview pipeline detection logic.

#### Scenario: Multiple apps changed
- **WHEN** changes affect api and web apps
- **THEN** both apps are included in the build matrix
- **AND** apps without changes are skipped

#### Scenario: No app changes detected
- **WHEN** only documentation or configuration changes are pushed
- **THEN** image build stage is skipped
- **AND** pipeline completes without building images

### Requirement: Docker Image Building and Publishing
The pipeline SHALL build Docker images for affected apps and publish them to Azure Container Registry with production tags.

#### Scenario: Build and publish affected apps
- **WHEN** affected apps are detected
- **THEN** Docker images are built in parallel for each app using `apps/$app/Dockerfile`
- **AND** images are tagged with git SHA (full and short)
- **AND** images are tagged with `latest`
- **AND** images are pushed to `hmctspublic.azurecr.io`

#### Scenario: Image build failure
- **WHEN** any app fails to build
- **THEN** pipeline fails immediately
- **AND** subsequent stages are skipped

### Requirement: Helm Chart Packaging and Publishing
The pipeline SHALL package the umbrella Helm chart and publish it to the ACR OCI registry.

#### Scenario: Package umbrella chart
- **WHEN** images are successfully published
- **THEN** chart dependencies are updated
- **AND** umbrella chart is packaged from `helm/expressjs-monorepo-template/`
- **AND** chart version is incremented

#### Scenario: Publish chart to ACR
- **WHEN** chart is successfully packaged
- **THEN** chart is authenticated to ACR Helm registry
- **AND** chart is pushed to `oci://hmctspublic.azurecr.io/helm/`
- **AND** chart is available for helm install

### Requirement: Deployment Stage Ordering
The pipeline SHALL execute stages in the correct dependency order.

#### Scenario: Sequential execution
- **WHEN** workflow is triggered
- **THEN** terraform apply completes before image builds start
- **AND** image builds complete before helm chart is packaged
- **AND** helm chart is packaged before publishing

#### Scenario: Stage failure propagation
- **WHEN** any stage fails
- **THEN** dependent stages are skipped
- **AND** workflow status is marked as failed

### Requirement: Workflow Concurrency Control
The pipeline SHALL prevent concurrent deployments to master to avoid conflicts.

#### Scenario: Concurrent push to master
- **WHEN** multiple commits are pushed to master in quick succession
- **THEN** only one deployment runs at a time
- **AND** subsequent runs wait for completion or are cancelled

### Requirement: Azure Authentication
The pipeline SHALL authenticate to Azure services using service principal credentials stored in GitHub secrets.

#### Scenario: Terraform authentication
- **WHEN** terraform needs to provision resources
- **THEN** Azure credentials from GitHub secrets are used
- **AND** credentials are not exposed in logs

#### Scenario: ACR authentication
- **WHEN** pushing images or charts to ACR
- **THEN** ACR credentials from GitHub secrets are used
- **AND** authentication succeeds before push
