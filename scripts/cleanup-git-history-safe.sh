#!/bin/bash

# Safe Git History Cleanup Script
# Removes test artifacts that should never have been committed

set -e

echo "🔍 Git History Cleanup Tool"
echo "=========================="
echo ""

# Check for uncommitted changes
if [[ -n $(git status --porcelain | grep -v "^??") ]]; then
  echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
  git status --short
  exit 1
fi

# Check if git-filter-repo is installed
if ! command -v git-filter-repo &> /dev/null; then
  echo "❌ Error: git-filter-repo is not installed."
  echo "Install it with: brew install git-filter-repo"
  exit 1
fi

# Create backup
BACKUP_BRANCH="backup-before-cleanup-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"
echo "✅ Backup branch created: $BACKUP_BRANCH"
echo ""

# Show what will be removed
echo "🗑️  Files to be removed from ALL git history:"
echo "  - test-results/"
echo "  - playwright-report/"
echo ""
echo "📊 Current repository size:"
git count-objects -vH | grep "size-pack"
echo ""

read -p "⚠️  This will REWRITE git history. Continue? (type 'yes' to proceed): " -r
echo ""
if [[ ! $REPLY == "yes" ]]; then
  echo "❌ Aborted. Backup branch preserved: $BACKUP_BRANCH"
  exit 1
fi

echo "🧹 Cleaning git history (this may take a moment)..."
echo ""

# Remove unwanted directories from all history
git filter-repo \
  --path test-results \
  --path playwright-report \
  --invert-paths \
  --force

echo ""
echo "✅ Git history cleaned successfully!"
echo ""
echo "📊 New repository size:"
git count-objects -vH | grep "size-pack"
echo ""
echo "📋 Next steps:"
echo "  1. Verify changes: git log --oneline | head -20"
echo "  2. Check files: git ls-files | grep -E '(test-results|playwright-report)'"
echo "  3. If satisfied, force push: git push origin --force --all"
echo "  4. Delete backup: git branch -D $BACKUP_BRANCH"
echo ""
echo "⚠️  IMPORTANT:"
echo "  - All team members must re-clone or reset their repos"
echo "  - Notify team before force pushing"
echo "  - Remote refs may need cleanup: git push origin --force --tags"
