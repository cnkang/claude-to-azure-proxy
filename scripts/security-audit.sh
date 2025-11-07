#!/bin/bash

# Security Audit Script for Node.js Dependencies
# Checks for known vulnerabilities including node-tar issues

set -e

echo "🔍 Starting security audit..."

# Check for pnpm audit
echo "📋 Running pnpm audit..."
pnpm audit --audit-level moderate

# Check for specific vulnerable packages
echo "🎯 Checking for specific vulnerable packages..."

# Check for node-tar (CVE-2024-28863 and others)
if pnpm list tar 2>/dev/null | grep -q "tar@"; then
    echo "⚠️  WARNING: tar package found in dependencies"
    echo "   Please ensure it's version 6.2.1+ to avoid CVE-2024-28863"
    pnpm list tar
else
    echo "✅ No tar package found in dependencies"
fi

# Check for other commonly vulnerable packages
VULNERABLE_PACKAGES=("lodash" "moment" "request" "node-sass")

for package in "${VULNERABLE_PACKAGES[@]}"; do
    if pnpm list "$package" 2>/dev/null | grep -q "$package@"; then
        echo "⚠️  Found $package - please verify it's the latest secure version"
    fi
done

# Check for outdated packages
echo "📦 Checking for outdated packages..."
pnpm outdated || true

echo "✅ Security audit completed"