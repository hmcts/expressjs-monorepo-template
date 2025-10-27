#!/usr/bin/env bash
set -e

# Load nvm
export NVM_DIR="/usr/local/share/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Use project-specified Node version (or LTS)
nvm install
nvm use
corepack enable

# Optional: ensure Playwright browsers are installed globally
npx playwright install --with-deps

echo "✅ Dev container setup complete."
