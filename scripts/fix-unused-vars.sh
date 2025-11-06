#!/bin/bash
cd "$(dirname "$0")/.."

# Fix unused variables by adding _ prefix
files=(
  "apps/frontend/src/components/conversation/ConversationDemo.tsx"
  "apps/frontend/src/components/conversation/ConversationList.tsx"
  "apps/frontend/src/components/conversation/ConversationManager.tsx"
  "apps/frontend/src/components/conversation/OptimizedConversationList.tsx"
  "apps/frontend/src/hooks/useConversations.ts"
  "apps/frontend/src/hooks/useContextManagement.ts"
  "apps/frontend/src/hooks/useErrorHandling.ts"
  "apps/frontend/src/pages/SettingsPage.tsx"
  "apps/frontend/src/services/context.ts"
  "apps/frontend/src/test/accessibility-compliance.test.tsx"
  "apps/frontend/src/test/accessibility.test.tsx"
  "apps/frontend/src/test/component-tests.test.tsx"
  "apps/frontend/src/test/error-handling.test.tsx"
  "apps/frontend/src/test/mocks/prismjs.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing $file..."
    # Add _ prefix to unused variables
    sed -i '' \
      -e 's/const \[err\]/const [_err]/g' \
      -e 's/, useEffect/ /g' \
      -e 's/showFilters/_showFilters/g' \
      -e 's/import.*Conversation.*from/\/\/ &/g' \
      -e 's/const lastMessage/const _lastMessage/g' \
      -e 's/const conversations =/const _conversations =/g' \
      -e 's/errorInfo/_errorInfo/g' \
      -e 's/const storageState/const _storageState/g' \
      -e 's/modelId/_modelId/g' \
      -e 's/, fireEvent/ /g' \
      -e 's/const settingsLink/const _settingsLink/g' \
      -e 's/const messageInput/const _messageInput/g' \
      -e 's/const sendButton/const _sendButton/g' \
      -e 's/const closeButton/const _closeButton/g' \
      -e 's/element/_element/g' \
      -e 's/, waitFor/ /g' \
      -e 's/, hasTextContent/ /g' \
      -e 's/, act/ /g' \
      -e 's/grammar/_grammar/g' \
      -e 's/language/_language/g' \
      "$file"
  fi
done

echo "Done!"
