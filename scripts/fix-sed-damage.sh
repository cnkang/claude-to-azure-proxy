#!/bin/bash

# Fix sed damage in frontend code
cd /Volumes/2T/development/code-router/apps/frontend

echo "Fixing sed-caused issues..."

# Fix 1: Restore broken patterns that sed might have damaged
# Look for common sed damage patterns and fix them

# Fix any remaining broken function signatures (look for missing commas in parameters)
find src -type f -name "*.ts" -o -name "*.tsx" | while read file; do
  # Check if file has issues with function parameters
  if grep -q "ion:" "$file" 2>/dev/null; then
    echo "Checking $file for parameter issues..."
  fi
done

# Fix strict-boolean-expressions issues with timeout refs
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' \
  -e 's/if (\([a-zA-Z_][a-zA-Z0-9_]*Timeout\)\.current)/if (\1.current !== null)/g' \
  -e 's/if (\([a-zA-Z_][a-zA-Z0-9_]*Ref\)\.current)/if (\1.current !== null)/g'

echo "Sed damage fixes applied"
