#!/bin/bash

# Git History Cleanup Script
# This script removes files that should never have been committed

set -e

echo "🔍 Checking git status..."
if [[ -n $(git status --porcelain) ]]; then
  echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

echo "📋 Creating backup branch..."
BACKUP_BRANCH="backup-before-cleanup-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"
echo "✅ Backup branch created: $BACKUP_BRANCH"

echo ""
echo "🗑️  Files to be removed from git history:"
echo "  - test-results/"
echo "  - playwright-report/"
echo ""

read -p "⚠️  This will rewrite git history. Continue? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  echo "❌ Aborted."
  exit 1
fi

echo ""
echo "🧹 Cleaning git history..."

# Remove test-results and playwright-report directories from all history
git filter-repo --path test-results --path playwright-report --invert-paths --force

echo ""
echo "✅ Git history cleaned successfully!"
echo ""
echo "📊 Summary:"
echo "  - Removed: test-results/ and playwright-report/ from all commits"
echo "  - Backup branch: $BACKUP_BRANCH"
echo ""
echo "⚠️  Next steps:"
echo "  1. Verify the changes: git log --all --oneline"
echo "  2. If everything looks good, force push: git push origin --force --all"
echo "  3. Notify team members to re-clone the repository"
echo "  4. Delete backup branch if no longer needed: git branch -D $BACKUP_BRANCH"
echo ""
echo "⚠️  WARNING: All team members will need to re-clone or reset their local repos!"
