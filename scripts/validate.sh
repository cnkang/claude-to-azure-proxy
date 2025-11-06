#!/bin/bash
# Comprehensive validation script for CI/CD and local development

set +e
ERRORS=0
WARNINGS=0

echo "======================================"
echo "Running Validation Checks"
echo "======================================"
echo ""

# Type Check
echo "1. Type Check"
echo "--------------------------------------"
TYPE_OUTPUT=$(pnpm type-check 2>&1)
TYPE_ERRORS=$(echo "$TYPE_OUTPUT" | grep -c "error TS" || true)
if [ "$TYPE_ERRORS" -gt 0 ]; then
    echo "❌ Failed with $TYPE_ERRORS errors"
    echo "$TYPE_OUTPUT" | grep "error TS" | head -10
    ERRORS=$((ERRORS + TYPE_ERRORS))
else
    echo "✅ Passed (0 errors)"
fi
echo ""

# Lint
echo "2. Lint"
echo "--------------------------------------"
LINT_OUTPUT=$(pnpm lint 2>&1)
LINT_ERRORS=$(echo "$LINT_OUTPUT" | grep -c "✖.*error" || true)
LINT_WARNINGS=$(echo "$LINT_OUTPUT" | grep -c "⚠.*warning" || true)
if [ "$LINT_ERRORS" -gt 0 ] || [ "$LINT_WARNINGS" -gt 0 ]; then
    echo "❌ Failed with $LINT_ERRORS errors, $LINT_WARNINGS warnings"
    echo "$LINT_OUTPUT" | grep -E "(✖|⚠)" | head -10
    ERRORS=$((ERRORS + LINT_ERRORS))
    WARNINGS=$((WARNINGS + LINT_WARNINGS))
else
    echo "✅ Passed (0 errors, 0 warnings)"
fi
echo ""

# Test
echo "3. Tests"
echo "--------------------------------------"
TEST_OUTPUT=$(pnpm test 2>&1)
TEST_FAILED=$(echo "$TEST_OUTPUT" | grep -c "FAIL" || true)
if [ "$TEST_FAILED" -gt 0 ]; then
    echo "❌ Failed"
    echo "$TEST_OUTPUT" | grep "FAIL" | head -10
    ERRORS=$((ERRORS + 1))
else
    echo "✅ Passed"
fi
echo ""

# Summary
echo "======================================"
echo "Summary"
echo "======================================"
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo "✅ ALL CHECKS PASSED"
    echo "   Type Check: 0 errors"
    echo "   Lint: 0 errors, 0 warnings"
    echo "   Tests: All passing"
    exit 0
else
    echo "❌ CHECKS FAILED"
    echo "   Errors: $ERRORS"
    echo "   Warnings: $WARNINGS"
    exit 1
fi
