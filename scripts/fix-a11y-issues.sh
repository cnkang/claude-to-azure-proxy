#!/bin/bash

# Fix accessibility issues in frontend code
cd /Volumes/2T/development/code-router/apps/frontend/src

echo "Fixing accessibility issues..."

# Fix 1: Add onFocus/onBlur for onMouseOver/onMouseOut
find . -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' \
  -e 's/onMouseOver={/onMouseOver={ onFocus={/g' \
  -e 's/onMouseOut={/onMouseOut={ onBlur={/g' \
  {} \;

# Fix 2: Add role and tabIndex for click handlers on divs
find . -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' \
  -e 's/<div onClick=/<div role="button" tabIndex={0} onClick=/g' \
  -e 's/<div className="\([^"]*\)" onClick=/<div className="\1" role="button" tabIndex={0} onClick=/g' \
  {} \;

# Fix 3: Remove redundant role="list" from ul elements
find . -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' \
  -e 's/<ul role="list"/<ul/g' \
  {} \;

echo "Accessibility fixes applied"
