#!/usr/bin/env bash

# Test Consistency Check Script
# Runs E2E tests multiple times to identify flaky tests
# Usage: ./scripts/test-consistency-check.sh [number_of_runs]

set -e

# Configuration
RUNS=${1:-3}
RESULTS_DIR="test-consistency-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_DIR="${RESULTS_DIR}/${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}E2E Test Consistency Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Number of runs: ${RUNS}"
echo -e "Results directory: ${RUN_DIR}"
echo ""

# Create results directory
mkdir -p "${RUN_DIR}"

# Initialize tracking variables
total_tests=0
consistent_passes=0
consistent_failures=0
flaky_tests=0

# Function to extract test results from JSON report
extract_results() {
  local run_number=$1
  local json_file="playwright-report/results.json"
  
  if [ ! -f "${json_file}" ]; then
    echo -e "${RED}Error: Results file not found: ${json_file}${NC}"
    return 1
  fi
  
  # Copy results to run directory
  cp "${json_file}" "${RUN_DIR}/run_${run_number}_results.json"
  cp -r "playwright-report" "${RUN_DIR}/run_${run_number}_report"
  
  # Extract test names and statuses using node
  node -e "
    const fs = require('fs');
    const results = JSON.parse(fs.readFileSync('${json_file}', 'utf8'));
    
    results.suites.forEach(suite => {
      suite.specs.forEach(spec => {
        const testName = spec.title;
        const status = spec.tests[0]?.results[0]?.status || 'unknown';
        console.log(\`\${testName}|\${status}\`);
      });
    });
  " > "${RUN_DIR}/run_${run_number}_parsed.txt"
}

# Function to run tests
run_tests() {
  local run_number=$1
  
  echo -e "${BLUE}----------------------------------------${NC}"
  echo -e "${BLUE}Run ${run_number}/${RUNS}${NC}"
  echo -e "${BLUE}----------------------------------------${NC}"
  
  # Clean previous results
  rm -rf playwright-report test-results
  
  # Run tests
  if pnpm exec playwright test --project=chromium; then
    echo -e "${GREEN}✓ Run ${run_number} completed successfully${NC}"
    extract_results "${run_number}"
    return 0
  else
    echo -e "${YELLOW}⚠ Run ${run_number} had failures${NC}"
    extract_results "${run_number}"
    return 1
  fi
}

# Run tests multiple times
echo -e "${BLUE}Starting test runs...${NC}"
echo ""

for i in $(seq 1 ${RUNS}); do
  run_tests "${i}"
  echo ""
  
  # Add delay between runs to avoid resource contention
  if [ ${i} -lt ${RUNS} ]; then
    echo "Waiting 5 seconds before next run..."
    sleep 5
  fi
done

# Analyze results
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Analyzing Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Combine all parsed results
cat "${RUN_DIR}"/run_*_parsed.txt | sort | uniq > "${RUN_DIR}/all_tests.txt"

# Analyze each test
while IFS='|' read -r test_name status; do
  if [ -z "${test_name}" ]; then
    continue
  fi
  
  # Count occurrences of this test
  pass_count=$(grep -c "^${test_name}|passed$" "${RUN_DIR}"/run_*_parsed.txt || true)
  fail_count=$(grep -c "^${test_name}|failed$" "${RUN_DIR}"/run_*_parsed.txt || true)
  skip_count=$(grep -c "^${test_name}|skipped$" "${RUN_DIR}"/run_*_parsed.txt || true)
  
  total_runs=$((pass_count + fail_count + skip_count))
  
  # Categorize test
  if [ ${pass_count} -eq ${RUNS} ]; then
    # Consistently passing
    ((consistent_passes++))
  elif [ ${fail_count} -eq ${RUNS} ]; then
    # Consistently failing
    ((consistent_failures++))
    echo -e "${RED}✗ CONSISTENT FAILURE: ${test_name}${NC}"
    echo "  Failed in all ${RUNS} runs"
    echo "${test_name}" >> "${RUN_DIR}/consistent_failures.txt"
  elif [ ${pass_count} -gt 0 ] && [ ${fail_count} -gt 0 ]; then
    # Flaky test
    ((flaky_tests++))
    echo -e "${YELLOW}⚠ FLAKY TEST: ${test_name}${NC}"
    echo "  Passed: ${pass_count}/${RUNS}, Failed: ${fail_count}/${RUNS}"
    echo "${test_name}|${pass_count}|${fail_count}" >> "${RUN_DIR}/flaky_tests.txt"
  fi
  
  ((total_tests++))
done < <(cat "${RUN_DIR}/all_tests.txt" | sort -u)

# Generate summary report
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary Report${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Total unique tests: ${total_tests}"
echo -e "${GREEN}Consistently passing: ${consistent_passes}${NC}"
echo -e "${RED}Consistently failing: ${consistent_failures}${NC}"
echo -e "${YELLOW}Flaky tests: ${flaky_tests}${NC}"
echo ""

# Calculate consistency percentage
if [ ${total_tests} -gt 0 ]; then
  consistency_pct=$(awk "BEGIN {printf \"%.2f\", (${consistent_passes} + ${consistent_failures}) * 100 / ${total_tests}}")
  echo "Test consistency: ${consistency_pct}%"
  echo ""
fi

# Save summary
cat > "${RUN_DIR}/summary.txt" << EOF
E2E Test Consistency Check Summary
Generated: $(date)
Number of runs: ${RUNS}

Results:
- Total unique tests: ${total_tests}
- Consistently passing: ${consistent_passes}
- Consistently failing: ${consistent_failures}
- Flaky tests: ${flaky_tests}
- Consistency: ${consistency_pct}%

Flaky Tests:
EOF

if [ -f "${RUN_DIR}/flaky_tests.txt" ]; then
  while IFS='|' read -r test_name pass_count fail_count; do
    echo "  - ${test_name} (Passed: ${pass_count}/${RUNS}, Failed: ${fail_count}/${RUNS})" >> "${RUN_DIR}/summary.txt"
  done < "${RUN_DIR}/flaky_tests.txt"
else
  echo "  None detected" >> "${RUN_DIR}/summary.txt"
fi

echo "" >> "${RUN_DIR}/summary.txt"
echo "Consistently Failing Tests:" >> "${RUN_DIR}/summary.txt"

if [ -f "${RUN_DIR}/consistent_failures.txt" ]; then
  while read -r test_name; do
    echo "  - ${test_name}" >> "${RUN_DIR}/summary.txt"
  done < "${RUN_DIR}/consistent_failures.txt"
else
  echo "  None detected" >> "${RUN_DIR}/summary.txt"
fi

# Display summary file
cat "${RUN_DIR}/summary.txt"

# Exit with appropriate code
if [ ${flaky_tests} -gt 0 ]; then
  echo -e "${YELLOW}⚠ Flaky tests detected. Review results in: ${RUN_DIR}${NC}"
  exit 1
elif [ ${consistent_failures} -gt 0 ]; then
  echo -e "${RED}✗ Consistent failures detected. Review results in: ${RUN_DIR}${NC}"
  exit 1
else
  echo -e "${GREEN}✓ All tests are consistent!${NC}"
  exit 0
fi
