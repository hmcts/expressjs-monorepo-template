#!/usr/bin/env bash
set -euo pipefail

# Script: generate-build-metadata.sh
# Purpose: Generate build metadata from repository state
# Outputs:
#   - team_name: Extracted from package.json name (first part before -)
#   - application_name: Extracted from package.json name (after first -)
#   - git_repo: Git repository URL (converted to HTTPS)
#   - timestamp: Current timestamp (YYYYMMDDHHmmss format)
#   - short_sha: Short git SHA (first 7 characters)
#   - registry_prefix: ACR registry prefix (team/team-app)
#   - image_tag: Combined image tag for this PR/build

main() {
  local change_id="${1:-}"
  local git_sha="${2:-}"

  if [ -z "$change_id" ] || [ -z "$git_sha" ]; then
    echo "Usage: $0 <change_id> <git_sha>"
    exit 1
  fi

  echo "Generating build metadata..."

  # Parse package.json name and extract team/app names
  local package_name
  package_name=$(node -p "require('./package.json').name.replace('@hmcts/', '').replace(/^@[^/]+\//, '')")

  local team_name
  team_name=$(echo "$package_name" | cut -d'-' -f1)

  local application_name
  application_name=$(echo "$package_name" | cut -d'-' -f2-)

  # Get git repository URL (convert git@ to https://)
  local git_repo
  git_repo=$(git config --get remote.origin.url | sed 's/git@github.com:/https:\/\/github.com\//' | sed 's/\.git$//')

  # Generate timestamp and short SHA
  local timestamp
  timestamp=$(date +%Y%m%d%H%M%S)

  local short_sha
  short_sha=$(echo "$git_sha" | cut -c1-7)

  # Construct derived values
  local registry_prefix="${team_name}/${team_name}-${application_name}"
  local image_tag="pr-${change_id}-${short_sha}-${timestamp}"

  # Output to GitHub Actions
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "team-name=${team_name}" >> "$GITHUB_OUTPUT"
    echo "application-name=${application_name}" >> "$GITHUB_OUTPUT"
    echo "git-repo=${git_repo}" >> "$GITHUB_OUTPUT"
    echo "timestamp=${timestamp}" >> "$GITHUB_OUTPUT"
    echo "short-sha=${short_sha}" >> "$GITHUB_OUTPUT"
  fi

  # Output to environment
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "REGISTRY_PREFIX=${registry_prefix}" >> "$GITHUB_ENV"
    echo "IMAGE_TAG=${image_tag}" >> "$GITHUB_ENV"
  fi

  # Log results
  echo "Package name: ${package_name}"
  echo "Team: ${team_name}"
  echo "Application: ${application_name}"
  echo "Git repo: ${git_repo}"
  echo "Timestamp: ${timestamp}"
  echo "Short SHA: ${short_sha}"
  echo "Registry prefix: ${registry_prefix}"
  echo "Image tag: ${image_tag}"
}

main "$@"
