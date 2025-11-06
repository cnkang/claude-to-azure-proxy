#!/bin/bash

# Fix all .js imports in TypeScript files
find apps/backend/src apps/frontend/src packages/*/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "s/from '\(.*\)\.js'/from '\1'/g" {} \;
find apps/backend/tests apps/frontend/src/test packages/*/tests -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "s/from '\(.*\)\.js'/from '\1'/g" {} \;

# Fix double quotes too
find apps/backend/src apps/frontend/src packages/*/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/from "\(.*\)\.js"/from "\1"/g' {} \;
find apps/backend/tests apps/frontend/src/test packages/*/tests -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/from "\(.*\)\.js"/from "\1"/g' {} \;

echo "Fixed all .js imports in TypeScript files"
