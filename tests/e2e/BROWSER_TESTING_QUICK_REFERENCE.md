# Browser Testing Quick Reference

## ✅ Configuration Fixed

Frontend runs on **port 3000** (not 5173). All configs updated.

## ⚠️ Current Status

- **11/20 tests passing** - Basic browser compatibility verified
- **9/20 tests failing** - Waiting for conversation persistence features (Tasks 1.x-8.x)
- See [Browser Testing Status](../../docs/BROWSER_TESTING_STATUS.md) for details

## Automatic Mode (CI/CD)
```bash
pnpm exec playwright test
```

## Manual Mode (Development - Recommended)
```bash
# Terminal 1: Start dev server
pnpm --filter @repo/frontend dev

# Terminal 2: Run tests
pnpm exec playwright test --config=playwright.config.manual.ts
```

## Run on Specific Browser
```bash
# Automatic mode
pnpm exec playwright test --project=chromium

# Manual mode (recommended)
pnpm exec playwright test --config=playwright.config.manual.ts --project=chromium
pnpm exec playwright test --config=playwright.config.manual.ts --project=firefox
pnpm exec playwright test --config=playwright.config.manual.ts --project=webkit
```

## Run Browser Compatibility Tests
```bash
# Manual mode (recommended)
pnpm exec playwright test --config=playwright.config.manual.ts tests/e2e/browser-compatibility.spec.ts
```

## Generate Compatibility Report
```bash
# Manual mode (recommended)
USE_MANUAL_CONFIG=true ./scripts/test-browser-compatibility.sh
```

## Debug Mode
```bash
pnpm exec playwright test --config=playwright.config.manual.ts --headed --project=chromium
pnpm exec playwright test --config=playwright.config.manual.ts --debug --project=firefox
```

## View Test Report
```bash
pnpm exec playwright show-report
```

## Known Issues
See [Browser Compatibility Guide](../../docs/BROWSER_COMPATIBILITY.md)
