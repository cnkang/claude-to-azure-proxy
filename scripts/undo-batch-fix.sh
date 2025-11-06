#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "Undoing batch fix changes..."

# Undo unused variable prefixes
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/const \[_err\]/const [err]/g' \
  -e 's/_showFilters/showFilters/g' \
  -e 's/const _lastMessage =/const lastMessage =/g' \
  -e 's/const _conversations =/const conversations =/g' \
  -e 's/_errorInfo/errorInfo/g' \
  -e 's/const _storageState =/const storageState =/g' \
  -e 's/const _settingsLink =/const settingsLink =/g' \
  -e 's/const _messageInput =/const messageInput =/g' \
  -e 's/const _sendButton =/const sendButton =/g' \
  -e 's/const _closeButton =/const closeButton =/g' \
  -e 's/const __modelService =/const _modelService =/g' \
  -e 's/const _loadingMessage =/const loadingMessage =/g' \
  -e 's/const __errorMessage =/const _errorMessage =/g' \
  -e 's/const __handleToggleConversationSelection =/const _handleToggleConversationSelection =/g' \
  {} \;

# Restore removed imports (add them back)
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/import React, { useState }/import React, { useState, useEffect }/g' \
  {} \;

# Undo test file parameter prefixes
find apps/frontend/src/test -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/_element/element/g' \
  -e 's/_grammar/grammar/g' \
  -e 's/_language/language/g' \
  {} \;

# Undo parseInt radix (remove the added , 10)
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/parseInt(\([^,)]*\), 10)/parseInt(\1)/g' \
  {} \;

# Undo self-compare fix
find apps/frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e 's/\bfalse\b/undefined !== undefined/g' \
  {} \;

echo "✓ Undone batch fixes"
echo "Note: Some changes may need manual review"
