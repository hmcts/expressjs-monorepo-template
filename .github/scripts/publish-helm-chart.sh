#!/usr/bin/env bash
set -euo pipefail

# Script: publish-helm-chart.sh
# Purpose: Package and publish the umbrella Helm chart to ACR OCI registry

main() {
  # Navigate to repository root
  cd "$(git rev-parse --show-toplevel)"

  # Read chart metadata
  local chart_path="helm/expressjs-monorepo-template"
  local chart_yaml="${chart_path}/Chart.yaml"

  if [ ! -f "$chart_yaml" ]; then
    echo "Error: Chart.yaml not found at ${chart_yaml}"
    exit 1
  fi

  local chart_name
  chart_name=$(grep '^name:' "$chart_yaml" | awk '{print $2}' | tr -d '"')

  local chart_version
  chart_version=$(grep '^version:' "$chart_yaml" | awk '{print $2}' | tr -d '"')

  echo "=========================================="
  echo "Helm Chart Publishing"
  echo "=========================================="
  echo "Chart:   ${chart_name}"
  echo "Version: ${chart_version}"
  echo "Path:    ${chart_path}"
  echo "=========================================="
  echo

  # Update chart dependencies
  echo "Updating chart dependencies..."
  cd "$chart_path"

  # Update subchart dependencies
  for subchart in ../../apps/*/helm; do
    if [ -f "$subchart/Chart.yaml" ]; then
      echo "  Updating dependencies for $subchart"
      (cd "$subchart" && helm dependency update)
    fi
  done

  # Update parent chart dependencies
  helm dependency update

  # Package the chart
  echo
  echo "Packaging chart..."
  helm package .

  # Publish to ACR OCI registry
  local registry="${REGISTRY:-hmctspublic.azurecr.io}"
  local chart_package="${chart_name}-${chart_version}.tgz"

  echo
  echo "Publishing chart to ${registry}..."
  helm push "${chart_package}" "oci://${registry}/helm"

  echo
  echo "=========================================="
  echo "Chart published successfully!"
  echo "=========================================="
  echo "Chart: ${chart_name}"
  echo "Version: ${chart_version}"
  echo "Registry: oci://${registry}/helm/${chart_name}"
  echo
  echo "To install:"
  echo "  helm install my-release oci://${registry}/helm/${chart_name} --version ${chart_version}"
}

main "$@"
