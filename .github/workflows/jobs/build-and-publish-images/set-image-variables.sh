#!/usr/bin/env bash
set -euo pipefail

# Script: set-image-variables.sh
# Purpose: Set dynamic image tag variables and release name for Helm deployment
# Arguments:
#   $1: affected_apps - JSON array of affected app names
#   $2: helm_apps - JSON array of all apps with Helm charts
#   $3: change_id - PR/change ID
#   $4: short_sha - Short git SHA
#   $5: timestamp - Build timestamp (unused, kept for compatibility)
#   $6: application_name - Application name for release name
# Outputs:
#   Environment variables:
#   - RELEASE_NAME: {application_name}-pr-{change_id}
#   - {APP}_IMAGE for each Helm app
#     - If app was affected: pr-{change_id}-{sha}
#     - If app was not affected: latest

main() {
  local affected_apps="${1:-}"
  local helm_apps="${2:-}"
  local change_id="${3:-}"
  local short_sha="${4:-}"
  local timestamp="${5:-}"
  local application_name="${6:-}"

  if [ -z "$helm_apps" ] || [ -z "$change_id" ] || [ -z "$application_name" ]; then
    echo "Usage: $0 <affected_apps_json> <helm_apps_json> <change_id> <short_sha> <timestamp> <application_name>"
    exit 1
  fi

  # Default affected_apps to empty array if not provided
  if [ -z "$affected_apps" ]; then
    affected_apps="[]"
  fi

  # Calculate and export release name
  local release_name="${application_name}-pr-${change_id}"
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "RELEASE_NAME=${release_name}" >> "$GITHUB_ENV"
  fi
  echo "Release name: ${release_name}"

  echo "Setting image tag variables for Helm apps..."

  # Process each Helm app
  echo "$helm_apps" | jq -r '.[]' | while read -r app; do
    # Convert app name to environment variable name
    # Example: web -> WEB_IMAGE, my-app -> MY_APP_IMAGE
    local env_var_name
    env_var_name=$(echo "${app}" | tr '[:lower:]' '[:upper:]' | tr '-' '_')_IMAGE

    # Check if app was affected (needs rebuild)
    if echo "$affected_apps" | jq -e --arg app "$app" 'index($app)' > /dev/null 2>&1; then
      # App was affected - use SHA tag to force pod recreation
      local image_tag="pr-${change_id}-${short_sha}"

      if [ -n "${GITHUB_ENV:-}" ]; then
        echo "${env_var_name}=${image_tag}" >> "$GITHUB_ENV"
      fi

      echo "✓ ${app}: ${image_tag} (rebuilt)"
    else
      # App not affected - use latest
      local image_tag="latest"

      if [ -n "${GITHUB_ENV:-}" ]; then
        echo "${env_var_name}=${image_tag}" >> "$GITHUB_ENV"
      fi

      echo "○ ${app}: ${image_tag} (not rebuilt, using static tag)"
    fi
  done
}

main "$@"
