#!/bin/bash

# Test Environment Diagnostic Script
# Checks if the environment is ready for E2E tests

echo "=========================================="
echo "E2E Test Environment Diagnostic"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if port 3000 is in use (frontend)
echo -e "${BLUE}1. Checking if frontend dev server is running (port 3000)...${NC}"
if lsof -i :3000 > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Port 3000 is in use${NC}"
  echo "Process details:"
  lsof -i :3000
else
  echo -e "${RED}✗ Port 3000 is NOT in use${NC}"
  echo -e "${YELLOW}Frontend dev server is not running!${NC}"
  echo ""
  echo "To start the frontend dev server:"
  echo "  cd apps/frontend && pnpm dev"
  echo "  OR"
  echo "  pnpm --filter @repo/frontend dev"
fi
echo ""

# Check if port 8080 is in use (backend)
echo -e "${BLUE}2. Checking if backend server is running (port 8080)...${NC}"
if lsof -i :8080 > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Port 8080 is in use${NC}"
  echo "Process details:"
  lsof -i :8080
else
  echo -e "${YELLOW}⚠ Port 8080 is NOT in use${NC}"
  echo -e "${YELLOW}Backend server is not running (may not be required for frontend tests)${NC}"
fi
echo ""

# Check if we can connect to localhost:3000
echo -e "${BLUE}3. Testing HTTP connection to http://localhost:3000...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 > /dev/null 2>&1; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
    echo -e "${GREEN}✓ Frontend is responding (HTTP $HTTP_CODE)${NC}"
  else
    echo -e "${YELLOW}⚠ Frontend responded with HTTP $HTTP_CODE${NC}"
  fi
else
  echo -e "${RED}✗ Cannot connect to http://localhost:3000${NC}"
  echo -e "${YELLOW}Make sure the frontend dev server is running${NC}"
fi
echo ""

# Check if Playwright browsers are installed
echo -e "${BLUE}3. Checking Playwright browser installations...${NC}"
if pnpm exec playwright install --dry-run > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Playwright browsers are installed${NC}"
else
  echo -e "${YELLOW}⚠ Playwright browsers may not be installed${NC}"
  echo "To install browsers:"
  echo "  pnpm exec playwright install"
fi
echo ""

# Check if test files exist
echo -e "${BLUE}4. Checking test files...${NC}"
if [ -f "tests/e2e/browser-compatibility.spec.ts" ]; then
  echo -e "${GREEN}✓ Browser compatibility test file exists${NC}"
else
  echo -e "${RED}✗ Browser compatibility test file not found${NC}"
fi
echo ""

# Check if test helpers exist
echo -e "${BLUE}5. Checking test infrastructure...${NC}"
if [ -f "tests/e2e/fixtures/base.ts" ]; then
  echo -e "${GREEN}✓ Test fixtures exist${NC}"
else
  echo -e "${RED}✗ Test fixtures not found${NC}"
fi

if [ -f "tests/e2e/utils/test-helpers.ts" ]; then
  echo -e "${GREEN}✓ Test helpers exist${NC}"
else
  echo -e "${RED}✗ Test helpers not found${NC}"
fi
echo ""

# Check Node.js version
echo -e "${BLUE}6. Checking Node.js version...${NC}"
NODE_VERSION=$(node -v)
echo "Node.js version: $NODE_VERSION"
if [[ "$NODE_VERSION" =~ ^v2[4-9]\. ]] || [[ "$NODE_VERSION" =~ ^v[3-9][0-9]\. ]]; then
  echo -e "${GREEN}✓ Node.js version is 24+${NC}"
else
  echo -e "${YELLOW}⚠ Node.js version should be 24+${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""

if lsof -i :3000 > /dev/null 2>&1 && curl -s -o /dev/null http://localhost:3000 2>&1; then
  echo -e "${GREEN}✓ Environment is ready for E2E tests${NC}"
  echo ""
  echo "You can now run tests:"
  echo "  pnpm exec playwright test --config=playwright.config.manual.ts"
else
  echo -e "${RED}✗ Environment is NOT ready for E2E tests${NC}"
  echo ""
  echo "Required actions:"
  echo "  1. Start the frontend dev server (port 3000):"
  echo "     pnpm --filter @repo/frontend dev"
  echo ""
  echo "  2. (Optional) Start the backend server (port 8080):"
  echo "     pnpm --filter @repo/backend dev"
  echo ""
  echo "  3. Wait for the server to start (usually 5-10 seconds)"
  echo ""
  echo "  4. Run this diagnostic script again to verify:"
  echo "     ./scripts/check-test-environment.sh"
  echo ""
  echo "  5. Once ready, run the tests:"
  echo "     pnpm exec playwright test --config=playwright.config.manual.ts"
fi
echo ""
