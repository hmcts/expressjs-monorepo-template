#!/usr/bin/env bash
set -e

echo "🚀 Initializing HMCTS Express Monorepo Template"
echo ""
echo "This monorepo will contain all your apps, libraries, and infrastructure."
echo ""
echo "📋 Naming Guidance:"
echo "  • Team name: Your HMCTS service (e.g., CaTH, Divorce, Civil)"
echo "  • Product name: The specific product/service (e.g., Possessions, Money-Claims)"
echo "  • If the product encompasses the whole service, use 'Service'"
echo ""
echo "Examples:"
echo "  • Team: CaTH, Product: Service → cath-service"
echo "  • Team: Civil, Product: Money-Claims → civil-money-claims"
echo ""

# Prompt for team name
read -p "Enter team name (e.g., CaTH): " TEAM_NAME_INPUT
if [ -z "$TEAM_NAME_INPUT" ]; then
  echo "❌ Team name is required"
  exit 1
fi

# Validate team name (alphanumeric, spaces, and hyphens only)
if ! [[ "$TEAM_NAME_INPUT" =~ ^[a-zA-Z0-9\ -]+$ ]]; then
  echo "❌ Team name must contain only alphanumeric characters, spaces, and hyphens"
  exit 1
fi

# Prompt for product name
read -p "Enter product name (e.g., Service): " PRODUCT_NAME_INPUT
if [ -z "$PRODUCT_NAME_INPUT" ]; then
  echo "❌ Product name is required"
  exit 1
fi

# Validate product name (alphanumeric, spaces, and hyphens only)
if ! [[ "$PRODUCT_NAME_INPUT" =~ ^[a-zA-Z0-9\ -]+$ ]]; then
  echo "❌ Product name must contain only alphanumeric characters, spaces, and hyphens"
  exit 1
fi

# Convert to appropriate cases
TEAM_NAME_LOWER=$(echo "$TEAM_NAME_INPUT" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
PRODUCT_NAME_LOWER=$(echo "$PRODUCT_NAME_INPUT" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

echo ""
echo "📝 Configuration:"
echo "  Team (rpe): $TEAM_NAME_LOWER"
echo "  Team (RPE): $TEAM_NAME_INPUT"
echo "  Product (lowercase): $PRODUCT_NAME_LOWER"
echo "  Product (original): $PRODUCT_NAME_INPUT"
echo "  Full name: ${TEAM_NAME_LOWER}-${PRODUCT_NAME_LOWER}"
echo ""
read -p "Continue with these values? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "❌ Initialization cancelled"
  exit 1
fi

echo ""
echo "🔄 Replacing template values..."

# Function to replace strings in all files (excluding node_modules, .git, and dist)
replace_in_files() {
  local search="$1"
  local replace="$2"

  # Find all files excluding node_modules, .git, dist directories
  find . -type f \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/.turbo/*" \
    -not -path "*/coverage/*" \
    -exec grep -l "$search" {} \; 2>/dev/null | while read -r file; do
    echo "  - $file"
    sed -i -E "s/$search/$replace/g" "$file"
  done
}

# Replace in order to avoid partial matches
echo "Replacing expressjs-monorepo-template..."
replace_in_files "expressjs-monorepo-template" "${TEAM_NAME_LOWER}-${PRODUCT_NAME_LOWER}"

echo "Replacing ExpressJS Monorepo Template..."
replace_in_files "ExpressJS Monorepo Template" "$PRODUCT_NAME_INPUT"

echo "Replacing expressjs-monorepo..."
replace_in_files "expressjs-monorepo" "$PRODUCT_NAME_LOWER"

echo "Replacing RPE..."
replace_in_files "\\bRPE\\b" "$TEAM_NAME_INPUT"

echo "Replacing rpe..."
replace_in_files "\\brpe\\b" "$TEAM_NAME_LOWER"

echo ""
echo "📦 Rebuilding lockfile..."
yarn install

echo ""
echo "🧪 Running tests..."
yarn test

echo ""
echo "🧹 Cleaning up initialization script..."
rm -f .github/scripts/init.sh

echo ""
echo "✅ Template initialization complete!"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git diff"
echo "  2. Commit the changes: git add . && git commit -m 'Initialize from template'"
echo "  3. Push to your repository: git push"
echo ""
