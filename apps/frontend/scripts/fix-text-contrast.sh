#!/bin/bash

# Script to fix text color contrast issues for WCAG AAA compliance
# This script updates Tailwind text color classes to use WCAG AAA compliant values

echo "Fixing text color contrast issues for WCAG AAA compliance..."

# Find all TSX files
FILES=$(find apps/frontend/src -name "*.tsx" -type f)

for file in $FILES; do
  # Light mode text colors - make darker for better contrast on light backgrounds
  # text-gray-500 → text-gray-700 (secondary text)
  sed -i '' 's/text-gray-500\([^0-9]\)/text-gray-700\1/g' "$file" 2>/dev/null || sed -i 's/text-gray-500\([^0-9]\)/text-gray-700\1/g' "$file"
  
  # text-gray-400 → text-gray-600 (tertiary text, but still needs good contrast)
  sed -i '' 's/text-gray-400\([^0-9]\)/text-gray-600\1/g' "$file" 2>/dev/null || sed -i 's/text-gray-400\([^0-9]\)/text-gray-600\1/g' "$file"
  
  # text-gray-600 → text-gray-700 (ensure consistency)
  sed -i '' 's/text-gray-600\([^0-9]\)/text-gray-700\1/g' "$file" 2>/dev/null || sed -i 's/text-gray-600\([^0-9]\)/text-gray-700\1/g' "$file"
  
  # text-blue-500 → text-blue-700 (links and interactive elements)
  sed -i '' 's/text-blue-500\([^0-9]\)/text-blue-700\1/g' "$file" 2>/dev/null || sed -i 's/text-blue-500\([^0-9]\)/text-blue-700\1/g' "$file"
  
  # text-blue-600 → text-blue-700 (ensure consistency)
  sed -i '' 's/text-blue-600\([^0-9]\)/text-blue-700\1/g' "$file" 2>/dev/null || sed -i 's/text-blue-600\([^0-9]\)/text-blue-700\1/g' "$file"
  
  # text-red-500 → text-red-700 (errors)
  sed -i '' 's/text-red-500\([^0-9]\)/text-red-700\1/g' "$file" 2>/dev/null || sed -i 's/text-red-500\([^0-9]\)/text-red-700\1/g' "$file"
  
  # text-red-600 → text-red-700 (ensure consistency)
  sed -i '' 's/text-red-600\([^0-9]\)/text-red-700\1/g' "$file" 2>/dev/null || sed -i 's/text-red-600\([^0-9]\)/text-red-700\1/g' "$file"
  
  # text-green-500 → text-green-700 (success states)
  sed -i '' 's/text-green-500\([^0-9]\)/text-green-700\1/g' "$file" 2>/dev/null || sed -i 's/text-green-500\([^0-9]\)/text-green-700\1/g' "$file"
  
  # text-green-600 → text-green-700 (ensure consistency)
  sed -i '' 's/text-green-600\([^0-9]\)/text-green-700\1/g' "$file" 2>/dev/null || sed -i 's/text-green-600\([^0-9]\)/text-green-700\1/g' "$file"
  
  # text-yellow-500 → text-yellow-700 (warnings)
  sed -i '' 's/text-yellow-500\([^0-9]\)/text-yellow-700\1/g' "$file" 2>/dev/null || sed -i 's/text-yellow-500\([^0-9]\)/text-yellow-700\1/g' "$file"
  
  # Dark mode text colors - make lighter for better contrast on dark backgrounds
  # dark:text-gray-400 → dark:text-gray-300 (secondary text in dark mode)
  sed -i '' 's/dark:text-gray-400\([^0-9]\)/dark:text-gray-300\1/g' "$file" 2>/dev/null || sed -i 's/dark:text-gray-400\([^0-9]\)/dark:text-gray-300\1/g' "$file"
  
  # dark:text-gray-500 → dark:text-gray-300 (tertiary text in dark mode)
  sed -i '' 's/dark:text-gray-500\([^0-9]\)/dark:text-gray-300\1/g' "$file" 2>/dev/null || sed -i 's/dark:text-gray-500\([^0-9]\)/dark:text-gray-300\1/g' "$file"
  
  # dark:text-blue-400 → dark:text-blue-200 (links in dark mode)
  sed -i '' 's/dark:text-blue-400\([^0-9]\)/dark:text-blue-200\1/g' "$file" 2>/dev/null || sed -i 's/dark:text-blue-400\([^0-9]\)/dark:text-blue-200\1/g' "$file"
  
  # dark:text-red-400 → dark:text-red-200 (errors in dark mode)
  sed -i '' 's/dark:text-red-400\([^0-9]\)/dark:text-red-200\1/g' "$file" 2>/dev/null || sed -i 's/dark:text-red-400\([^0-9]\)/dark:text-red-200\1/g' "$file"
  
  # dark:text-green-400 → dark:text-green-200 (success in dark mode)
  sed -i '' 's/dark:text-green-400\([^0-9]\)/dark:text-green-200\1/g' "$file" 2>/dev/null || sed -i 's/dark:text-green-400\([^0-9]\)/dark:text-green-200\1/g' "$file"
  
  # dark:text-yellow-400 → dark:text-yellow-200 (warnings in dark mode)
  sed -i '' 's/dark:text-yellow-400\([^0-9]\)/dark:text-yellow-200\1/g' "$file" 2>/dev/null || sed -i 's/dark:text-yellow-400\([^0-9]\)/dark:text-yellow-200\1/g' "$file"
done

echo "Text color contrast fixes applied!"
echo "Please rebuild the application to see the changes."
