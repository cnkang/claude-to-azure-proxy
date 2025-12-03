# Implementation Plan

- [x] 1. Install and configure Biome
  - Install @biomejs/biome as devDependency in root package.json ✅
  - Create root biome.json configuration with formatter and linter settings ✅
  - Configure formatter to match current Prettier settings (single quotes, semicolons, 2-space indent, 80 char line width) ✅
  - Configure linter with recommended rules and security rules (needs enhancement)
  - Configure JSON linting and formatting ✅
  - Set up ignore patterns for node_modules, dist, coverage, .git, .kiro, *.d.ts ✅
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.4_

- [ ] 1.1 Write property test for formatting idempotence
  - **Property 2: Formatting Determinism**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 2. Enhance root Biome configuration
  - Enable recommended linter rules (currently disabled)
  - Add security-focused rules (noGlobalEval, noDangerouslySetInnerHtml)
  - Add TypeScript strict mode rules (noExplicitAny, noDoubleEquals)
  - Add complexity rules (noExcessiveCognitiveComplexity with threshold 10)
  - Add style rules (noVar, useConst)
  - Enable organize imports (currently disabled)
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Create workspace-specific Biome configurations
  - Create apps/backend/biome.json extending root config
  - Configure backend-specific rules (security rules, console.log warnings)
  - Create apps/frontend/biome.json extending root config
  - Configure frontend-specific rules (a11y rules, console.log errors)
  - _Requirements: 1.3, 2.5_

- [x] 3.1 Write property test for configuration inheritance
  - **Property 1: Configuration Inheritance Consistency**
  - **Validates: Requirements 1.3**

- [x] 3.2 Write unit tests for workspace configuration merging
  - Test that backend config correctly extends root config
  - Test that frontend config correctly extends root config
  - Test that workspace overrides take precedence over root rules
  - _Requirements: 1.3, 2.5_

- [ ] 4. Add check scripts to root package.json
  - Add "check" script: "biome check ."
  - Add "check:fix" script: "biome check --write ."
  - Add "ci:check" script: "biome ci ."
  - _Requirements: 4.5, 4.6_

- [ ] 4.1 Write unit tests for package.json script migration
  - Test that lint scripts use biome commands
  - Test that format scripts use biome commands
  - Test that check scripts combine linting and formatting
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 4.2 Write property test for script command compatibility
  - **Property 4: Script Command Compatibility**
  - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [ ] 5. Configure IDE integration
  - Update .vscode/settings.json with Biome as default formatter
  - Enable format-on-save with Biome
  - Enable code actions on save (quickfix, organize imports)
  - Disable ESLint and Prettier extensions
  - Create .vscode/extensions.json to recommend Biome extension
  - Add unwanted recommendations for ESLint and Prettier extensions
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 5.1 Write integration test for IDE configuration
  - Test that VS Code settings.json has correct Biome configuration
  - Test that extensions.json recommends Biome
  - Test that extensions.json marks ESLint and Prettier as unwanted
  - _Requirements: 6.1, 6.2, 6.4_

- [ ] 6. Update CI/CD pipelines
  - Update .github/workflows/ci-cd.yml to use "biome ci" or "biome check" command
  - Ensure Biome checks run before tests in code-quality job
  - Configure Biome to output CI-friendly format
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 6.1 Write property test for CI/CD exit codes
  - **Property 8: CI/CD Exit Code Correctness**
  - **Validates: Requirements 7.3, 7.4**

- [ ] 7. Run Biome on entire codebase
  - Run "biome check --write ." to format and fix all files
  - Review and commit formatting changes
  - Verify no linting errors remain
  - Fix any remaining linting errors manually
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 7.1 Write property test for linting rule equivalence
  - **Property 3: Linting Rule Equivalence**
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [ ] 7.2 Write property test for ignore pattern matching
  - **Property 5: Ignore Pattern Completeness**
  - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [ ] 8. Checkpoint - Verify Biome is working correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Validate JSON files
  - Run Biome on all package.json files
  - Run Biome on all tsconfig.json files
  - Verify JSON syntax and formatting
  - Fix any JSON validation errors
  - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [ ] 9.1 Write property test for JSON validation
  - **Property 6: JSON Validation Correctness**
  - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [ ] 10. Create migration documentation
  - Create docs/BIOME_MIGRATION.md with step-by-step instructions
  - Document ESLint to Biome rule mapping
  - Document Prettier to Biome formatter mapping
  - Document troubleshooting common issues
  - Document IDE setup instructions
  - Document CI/CD integration examples
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 11. Update developer documentation
  - Create or update docs/DEVELOPMENT.md with new linting/formatting commands
  - Document Biome configuration structure
  - Document how to add workspace-specific rules
  - Document how to disable rules for specific files
  - Document performance tips
  - _Requirements: 10.3, 10.4_

- [ ] 12. Create Vite+ preparation documentation
  - Create docs/VITE_PLUS_PREPARATION.md
  - Document Vite+ overview and benefits
  - Document timeline for Vite+ availability (early 2026)
  - Document configuration compatibility notes
  - Document expected migration effort
  - Document licensing considerations
  - _Requirements: 11.3, 11.5_

- [ ] 12.1 Write property test for Vite+ migration readiness
  - **Property 9: Vite+ Migration Readiness**
  - **Validates: Requirements 11.1, 11.2, 11.3**

- [ ] 13. Update steering rules
  - Update .kiro/steering/tech.md to reference Biome instead of ESLint/Prettier
  - Update code quality guidelines to use Biome commands
  - Update testing guidelines to include Biome property tests
  - Document future Vite+ migration path
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 14. Final validation and testing
  - Run "pnpm run check" on entire monorepo (after adding check script)
  - Run all unit tests
  - Run all integration tests
  - Run all property-based tests
  - Verify CI/CD pipeline passes
  - Test format-on-save in VS Code
  - Test git hooks with sample commits
  - Verify no ESLint or Prettier references remain
  - _Requirements: All_

- [ ] 15. Checkpoint - Final verification
  - Ensure all tests pass, ask the user if questions arise.
