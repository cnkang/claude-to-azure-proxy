#!/bin/bash

# Security Audit Script for Claude-to-Azure Proxy
# Performs comprehensive security scanning and static analysis

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$PROJECT_ROOT/security-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create reports directory
mkdir -p "$REPORT_DIR"

echo -e "${BLUE}🔒 Starting Security Audit - $(date)${NC}"
echo "Project: Claude-to-Azure Proxy"
echo "Report Directory: $REPORT_DIR"
echo "----------------------------------------"

# Function to print section headers
print_section() {
    echo -e "\n${BLUE}📋 $1${NC}"
    echo "----------------------------------------"
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print error messages
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Change to project root
cd "$PROJECT_ROOT"

# 1. Dependency Vulnerability Scanning
print_section "Dependency Vulnerability Scanning"

echo "Running npm audit..."
if npm audit --audit-level=moderate --json > "$REPORT_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null; then
    print_success "npm audit completed successfully"
    
    # Parse and display summary
    VULNERABILITIES=$(jq -r '.metadata.vulnerabilities | to_entries[] | "\(.key): \(.value)"' "$REPORT_DIR/npm-audit-$TIMESTAMP.json" 2>/dev/null || echo "No vulnerabilities found")
    echo "Vulnerability Summary:"
    echo "$VULNERABILITIES"
else
    print_warning "npm audit found vulnerabilities - check report for details"
fi

# Check for outdated packages
echo -e "\nChecking for outdated packages..."
npm outdated --json > "$REPORT_DIR/outdated-packages-$TIMESTAMP.json" 2>/dev/null || true
if [ -s "$REPORT_DIR/outdated-packages-$TIMESTAMP.json" ]; then
    print_warning "Outdated packages found - check report for details"
else
    print_success "All packages are up to date"
fi

# 2. TypeScript Type Coverage Analysis
print_section "TypeScript Type Coverage Analysis"

echo "Analyzing TypeScript type coverage..."
if command -v type-coverage >/dev/null 2>&1; then
    npx type-coverage --at-least 95 --strict --detail > "$REPORT_DIR/type-coverage-$TIMESTAMP.txt" 2>&1
    TYPE_COVERAGE=$(npx type-coverage --at-least 95 --strict | grep -o '[0-9]*\.[0-9]*%' | head -1)
    
    if [ -n "$TYPE_COVERAGE" ]; then
        print_success "Type coverage: $TYPE_COVERAGE"
    else
        print_warning "Could not determine type coverage"
    fi
else
    print_warning "type-coverage not installed - skipping type coverage analysis"
fi

# 3. Code Complexity Analysis
print_section "Code Complexity Analysis"

echo "Analyzing code complexity..."
if command -v ts-complex >/dev/null 2>&1; then
    npx ts-complex --threshold 10 src/ > "$REPORT_DIR/complexity-$TIMESTAMP.txt" 2>&1 || true
    
    # Check if any files exceed complexity threshold
    if grep -q "exceeds complexity threshold" "$REPORT_DIR/complexity-$TIMESTAMP.txt" 2>/dev/null; then
        print_warning "Some files exceed complexity threshold - check report for details"
    else
        print_success "All files meet complexity requirements"
    fi
else
    print_warning "ts-complex not installed - skipping complexity analysis"
fi

# 4. ESLint Security Analysis
print_section "ESLint Security Analysis"

echo "Running ESLint security analysis..."
npx eslint --config eslint.config.ts src/ tests/ --format json > "$REPORT_DIR/eslint-$TIMESTAMP.json" 2>/dev/null || true

# Count security-related issues
SECURITY_ISSUES=$(jq '[.[] | .messages[] | select(.ruleId | test("security"))] | length' "$REPORT_DIR/eslint-$TIMESTAMP.json" 2>/dev/null || echo "0")
TOTAL_ISSUES=$(jq '[.[] | .messages[]] | length' "$REPORT_DIR/eslint-$TIMESTAMP.json" 2>/dev/null || echo "0")

echo "ESLint Results:"
echo "  Total issues: $TOTAL_ISSUES"
echo "  Security issues: $SECURITY_ISSUES"

if [ "$SECURITY_ISSUES" -eq 0 ]; then
    print_success "No security-related ESLint issues found"
else
    print_warning "$SECURITY_ISSUES security-related ESLint issues found"
fi

# 5. Dockerfile Security Scan
print_section "Dockerfile Security Scan"

if [ -f "Dockerfile" ]; then
    echo "Scanning Dockerfile with hadolint..."
    if command -v hadolint >/dev/null 2>&1; then
        hadolint Dockerfile --format json > "$REPORT_DIR/hadolint-$TIMESTAMP.json" 2>/dev/null || true
        
        DOCKERFILE_ISSUES=$(jq 'length' "$REPORT_DIR/hadolint-$TIMESTAMP.json" 2>/dev/null || echo "0")
        if [ "$DOCKERFILE_ISSUES" -eq 0 ]; then
            print_success "Dockerfile passes security checks"
        else
            print_warning "$DOCKERFILE_ISSUES Dockerfile issues found"
        fi
    else
        print_warning "hadolint not installed - skipping Dockerfile scan"
    fi
else
    print_warning "Dockerfile not found - skipping Dockerfile scan"
fi

# 6. Environment Variable Security Check
print_section "Environment Variable Security Check"

echo "Checking for exposed secrets in environment configuration..."

# Check for hardcoded secrets in code
SECRET_PATTERNS=(
    "password\s*=\s*['\"][^'\"]*['\"]"
    "api[_-]?key\s*=\s*['\"][^'\"]*['\"]"
    "secret\s*=\s*['\"][^'\"]*['\"]"
    "token\s*=\s*['\"][^'\"]*['\"]"
    "bearer\s+[a-zA-Z0-9\-._~+/]+"
)

SECRETS_FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -r -i -E "$pattern" src/ tests/ --include="*.ts" --include="*.js" >/dev/null 2>&1; then
        SECRETS_FOUND=$((SECRETS_FOUND + 1))
        echo "  Found potential secret pattern: $pattern"
    fi
done

if [ "$SECRETS_FOUND" -eq 0 ]; then
    print_success "No hardcoded secrets found in source code"
else
    print_error "$SECRETS_FOUND potential hardcoded secrets found"
fi

# Check .env.example for security
if [ -f ".env.example" ]; then
    echo "Validating .env.example..."
    if grep -q "your-" ".env.example" && ! grep -q "real-" ".env.example"; then
        print_success ".env.example uses placeholder values"
    else
        print_warning ".env.example may contain real values"
    fi
fi

# 7. Git Security Check
print_section "Git Security Check"

echo "Checking for sensitive files in git history..."

# Check if .env files are in .gitignore
if [ -f ".gitignore" ]; then
    if grep -q "\.env" ".gitignore"; then
        print_success ".env files are properly ignored"
    else
        print_warning ".env files may not be properly ignored"
    fi
fi

# Check for large files that might contain secrets
echo "Checking for large files in repository..."
LARGE_FILES=$(find . -name ".git" -prune -o -type f -size +1M -print | head -10)
if [ -n "$LARGE_FILES" ]; then
    print_warning "Large files found (may contain sensitive data):"
    echo "$LARGE_FILES"
else
    print_success "No unusually large files found"
fi

# 8. Network Security Configuration Check
print_section "Network Security Configuration Check"

echo "Analyzing network security configuration..."

# Check for HTTPS enforcement
if grep -r "https" src/ --include="*.ts" >/dev/null 2>&1; then
    print_success "HTTPS usage found in code"
else
    print_warning "No explicit HTTPS usage found"
fi

# Check for security headers
if grep -r "helmet" src/ --include="*.ts" >/dev/null 2>&1; then
    print_success "Security headers (helmet) configured"
else
    print_warning "Security headers may not be configured"
fi

# Check for CORS configuration
if grep -r "cors" src/ --include="*.ts" >/dev/null 2>&1; then
    print_success "CORS configuration found"
else
    print_warning "CORS configuration may be missing"
fi

# 9. Generate Security Report Summary
print_section "Generating Security Report Summary"

SUMMARY_FILE="$REPORT_DIR/security-summary-$TIMESTAMP.md"

cat > "$SUMMARY_FILE" << EOF
# Security Audit Summary

**Date:** $(date)
**Project:** Claude-to-Azure Proxy
**Audit ID:** $TIMESTAMP

## Summary

| Category | Status | Details |
|----------|--------|---------|
| Dependencies | $([ "$VULNERABILITIES" = "No vulnerabilities found" ] && echo "✅ PASS" || echo "⚠️ REVIEW") | npm audit results |
| Type Coverage | $([ -n "$TYPE_COVERAGE" ] && echo "✅ $TYPE_COVERAGE" || echo "⚠️ UNKNOWN") | TypeScript type coverage |
| Code Complexity | $(grep -q "exceeds" "$REPORT_DIR/complexity-$TIMESTAMP.txt" 2>/dev/null && echo "⚠️ REVIEW" || echo "✅ PASS") | Cyclomatic complexity analysis |
| ESLint Security | $([ "$SECURITY_ISSUES" -eq 0 ] && echo "✅ PASS" || echo "⚠️ $SECURITY_ISSUES issues") | Security-related linting issues |
| Dockerfile | $([ "$DOCKERFILE_ISSUES" -eq 0 ] && echo "✅ PASS" || echo "⚠️ $DOCKERFILE_ISSUES issues") | Container security scan |
| Secrets | $([ "$SECRETS_FOUND" -eq 0 ] && echo "✅ PASS" || echo "❌ $SECRETS_FOUND found") | Hardcoded secrets check |

## Detailed Reports

- **npm audit:** \`npm-audit-$TIMESTAMP.json\`
- **Type coverage:** \`type-coverage-$TIMESTAMP.txt\`
- **Code complexity:** \`complexity-$TIMESTAMP.txt\`
- **ESLint results:** \`eslint-$TIMESTAMP.json\`
- **Dockerfile scan:** \`hadolint-$TIMESTAMP.json\`

## Recommendations

### High Priority
$([ "$SECRETS_FOUND" -gt 0 ] && echo "- 🔴 Remove hardcoded secrets from source code")
$([ "$SECURITY_ISSUES" -gt 0 ] && echo "- 🔴 Fix security-related ESLint issues")

### Medium Priority
$([ "$VULNERABILITIES" != "No vulnerabilities found" ] && echo "- 🟡 Update vulnerable dependencies")
$([ "$DOCKERFILE_ISSUES" -gt 0 ] && echo "- 🟡 Fix Dockerfile security issues")

### Low Priority
$(grep -q "exceeds" "$REPORT_DIR/complexity-$TIMESTAMP.txt" 2>/dev/null && echo "- 🟢 Refactor complex functions")

## Next Steps

1. Review detailed reports in the \`security-reports/\` directory
2. Address high-priority security issues immediately
3. Plan remediation for medium and low priority items
4. Schedule regular security audits (recommended: weekly)

---
*Generated by security-audit.sh*
EOF

print_success "Security summary generated: $SUMMARY_FILE"

# 10. Final Summary
print_section "Audit Complete"

echo "Security audit completed successfully!"
echo ""
echo "📊 Results Summary:"
echo "  • Dependencies: $([ "$VULNERABILITIES" = "No vulnerabilities found" ] && echo "PASS" || echo "REVIEW NEEDED")"
echo "  • Type Coverage: $([ -n "$TYPE_COVERAGE" ] && echo "$TYPE_COVERAGE" || echo "UNKNOWN")"
echo "  • ESLint Security: $([ "$SECURITY_ISSUES" -eq 0 ] && echo "PASS" || echo "$SECURITY_ISSUES issues")"
echo "  • Hardcoded Secrets: $([ "$SECRETS_FOUND" -eq 0 ] && echo "NONE FOUND" || echo "$SECRETS_FOUND FOUND")"
echo ""
echo "📁 All reports saved to: $REPORT_DIR"
echo "📋 Summary report: $SUMMARY_FILE"
echo ""

# Exit with appropriate code
if [ "$SECRETS_FOUND" -gt 0 ] || [ "$SECURITY_ISSUES" -gt 5 ]; then
    print_error "Security audit found critical issues - review required"
    exit 1
else
    print_success "Security audit completed with no critical issues"
    exit 0
fi