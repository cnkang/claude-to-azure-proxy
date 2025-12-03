# Style & Conventions
- ESM with explicit .js extensions for internal imports.
- TypeScript strict mode; prefer unknown over any; immutability via readonly; explicit return types.
- Naming: classes/types PascalCase, functions camelCase, constants SCREAMING_SNAKE_CASE, files kebab-case.
- Error handling: reuse errors in apps/backend/src/errors/index.ts (ValidationError, AzureOpenAIError, ErrorFactory); structured logs with correlationId.
- Middleware/architecture: follow layers; use existing utils/clients/config patterns; avoid duplicate code; reuse transformers/validators.
- Security: authentication on all routes except /health; rate limiting; sanitized logs; helmet enforced; never expose secrets.
- Biome: recommended rules baseline; custom overrides for tests/frontend; prefer node: protocol; no var, use const; complexity limit 10 (warnings in overrides).
- Frontend design: follows project UI; keep accessibility in mind; avoid console.log (frontend config may warn).