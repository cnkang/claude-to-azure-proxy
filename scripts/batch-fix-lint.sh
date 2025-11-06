#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "Batch fixing lint errors..."

# Fix unused imports and variables
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/import.*Conversation.*from.*types.*index/\/\/ &/g' \
  -e 's/const \[err\]/const [_err]/g' \
  -e 's/showFilters/_showFilters/g' \
  -e 's/const lastMessage =/const _lastMessage =/g' \
  -e 's/const conversations =/const _conversations =/g' \
  -e 's/errorInfo/_errorInfo/g' \
  -e 's/const storageState =/const _storageState =/g' \
  -e 's/(\([^)]*\)modelId\([^)]*\))/(\1_modelId\2)/g' \
  -e 's/const settingsLink =/const _settingsLink =/g' \
  -e 's/const messageInput =/const _messageInput =/g' \
  -e 's/const sendButton =/const _sendButton =/g' \
  -e 's/const closeButton =/const _closeButton =/g' \
  -e 's/const __conversationData =/const _conversationData =/g' \
  -e 's/const _modelService =/const __modelService =/g' \
  -e 's/const loadingMessage =/const _loadingMessage =/g' \
  -e 's/const _errorMessage =/const __errorMessage =/g' \
  -e 's/const _handleToggleConversationSelection =/const __handleToggleConversationSelection =/g' \
  {} \;

# Remove unused imports
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/, useEffect//g' \
  -e 's/, fireEvent//g' \
  -e 's/, waitFor//g' \
  -e 's/, hasTextContent//g' \
  -e 's/, act//g' \
  -e 's/, KeyboardNavigation//g' \
  -e 's/, useRovingTabindex//g' \
  {} \;

# Fix test files - prefix unused params with _
find apps/frontend/src/test -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/(\([^)]*\)element\([^)]*\))/(\1_element\2)/g' \
  -e 's/(\([^)]*\)grammar\([^)]*\))/(\1_grammar\2)/g' \
  -e 's/(\([^)]*\)language\([^)]*\))/(\1_language\2)/g' \
  {} \;

echo "✓ Fixed unused variables and imports"

# Fix require imports to use import statements
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e "s/const.*= require('/import & from '/g" \
  {} \;

echo "✓ Fixed require imports"

# Add radix parameter to parseInt
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/parseInt(\([^,)]*\))/parseInt(\1, 10)/g' \
  {} \;

echo "✓ Fixed parseInt radix"

# Fix no-self-compare
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/undefined !== undefined/false/g' \
  {} \;

echo "✓ Fixed self-compare"

# Remove redundant role="list" from ul elements
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/<ul role="list"/<ul/g' \
  {} \;

echo "✓ Fixed redundant roles"

echo "Done! Run 'pnpm lint' to check remaining errors."
