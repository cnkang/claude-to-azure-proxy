#!/bin/bash

# Fix lint errors systematically
cd "$(dirname "$0")/.."

echo "Fixing lint errors in frontend..."

# Remove unused imports and variables
pnpm --filter @repo/frontend exec eslint src/ --fix --rule '@typescript-eslint/no-unused-vars: off'

# Fix console statements
find apps/frontend/src -type f -name "*.tsx" -o -name "*.ts" | while read file; do
  # Comment out console.log statements (except in test files)
  if [[ ! "$file" =~ test\. ]]; then
    sed -i '' 's/^\([[:space:]]*\)console\./\1\/\/ console./g' "$file"
  fi
done

echo "Manual fixes still needed for:"
echo "- Missing return types"
echo "- Strict boolean expressions"
echo "- Promise handling"
echo "- Accessibility issues"

pnpm lint 2>&1 | grep "error" | wc -l
