#!/bin/bash

# Analyze unwanted files in git history

echo "🔍 Analyzing git history for unwanted files..."
echo ""

echo "📁 Files currently tracked that should be ignored:"
git ls-files | grep -E "(test-results|playwright-report|node_modules|\.pnpm-store|dist/|build/|coverage/|\.env$|\.DS_Store)" | sort

echo ""
echo "📜 Historical commits containing unwanted files:"
echo ""

echo "=== test-results/ ==="
git log --all --full-history --oneline -- test-results/ | head -10

echo ""
echo "=== playwright-report/ ==="
git log --all --full-history --oneline -- playwright-report/ | head -10

echo ""
echo "📊 Repository size analysis:"
git count-objects -vH

echo ""
echo "💾 Largest files in history:"
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  sed -n 's/^blob //p' | \
  sort --numeric-sort --key=2 --reverse | \
  head -20 | \
  numfmt --field=2 --to=iec-i --suffix=B --padding=7
