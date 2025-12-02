# Design Document

## Overview

This design document outlines the technical approach for migrating the Claude-to-Azure OpenAI Proxy monorepo from ESLint + Prettier to Biome, with architectural decisions that facilitate future Vite+ adoption. The migration will consolidate linting and formatting into a single, high-performance tool while maintaining code quality standards and improving developer experience.

The design follows a phased approach:
- **Phase 1**: Immediate migration to Biome (this design)
- **Phase 2**: Future migration to Vite+ when publicly available (2026)

## Architecture

### Current State

```
Monorepo Structure:
├── apps/
│   ├── backend/          # Node.js Express API
│   │   ├── eslint.config.ts
│   │   └── package.json (eslint, prettier deps)
│   └── frontend/         # React + Vite app
│       ├── eslint.config.ts
│       └── package.json (eslint, prettier deps)
├── packages/
│   └── shared-config/    # Shared ESLint configs
│       └── eslint/
├── eslint.config.ts      # Root ESLint config
├── .prettierrc           # Root Prettier config
└── package.json          # Root deps (eslint, prettier)

Tooling:
- ESLint 9 (flat config)
- Prettier 3
- TypeScript 5.9
- Vitest 4
- Vite 7 (frontend only)
```

### Target State (Phase 1: Biome)

```
Monorepo Structure:
├── apps/
│   ├── backend/
│   │   ├── biome.json    # Backend-specific overrides
│   │   └── package.json  # No linting deps
│   └── frontend/
│       ├── biome.json    # Frontend-specific overrides
│       └── package.json  # No linting deps
├── packages/
│   └── shared-config/    # Can be removed or repurposed
├── biome.json            # Root Biome config
└── package.json          # Only @biomejs/biome

Tooling:
- Biome 1.9+ (unified linting + formatting)
- TypeScript 5.9
- Vitest 4
- Vite 7 (frontend only)
```

### Future State (Phase 2: Vite+)

```
Monorepo Structure:
├── apps/
│   ├── backend/
│   │   └── package.json
│   └── frontend/
│       └── package.json
├── vite.config.ts        # Unified Vite+ config
└── package.json          # vite-plus package

Tooling:
- Vite+ (vite lint, vite fmt, vite test, vite run)
- Oxlint (via vite lint)
- Oxfmt (via vite fmt)
- Vitest (via vite test)
- Vite 7+ (via vite dev/build)
```

## Components and Interfaces

### 1. Biome Configuration System

#### Root Configuration (`biome.json`)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error",
        "noDoubleEquals": "error"
      },
      "security": {
        "noDangerouslySetInnerHtml": "error",
        "noGlobalEval": "error"
      },
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "error",
          "options": { "maxAllowedComplexity": 10 }
        }
      },
      "style": {
        "noVar": "error",
        "useConst": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "es5",
      "arrowParentheses": "always"
    }
  },
  "json": {
    "formatter": {
      "enabled": true,
      "indentWidth": 2
    },
    "linter": {
      "enabled": true
    }
  },
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      "build",
      "coverage",
      ".git",
      ".kiro",
      "**/*.d.ts",
      "**/*.js.map",
      "playwright-report",
      "test-results"
    ],
    "include": [
      "apps/**/*.ts",
      "apps/**/*.tsx",
      "apps/**/*.js",
      "apps/**/*.jsx",
      "apps/**/*.json",
      "packages/**/*.ts",
      "packages/**/*.tsx",
      "packages/**/*.js",
      "packages/**/*.jsx",
      "packages/**/*.json",
      "*.json",
      "*.ts",
      "*.js"
    ]
  }
}
```

#### Workspace-Specific Configurations

**Backend (`apps/backend/biome.json`)**:
```json
{
  "extends": ["../../biome.json"],
  "linter": {
    "rules": {
      "security": {
        "noGlobalEval": "error",
        "noDangerouslySetInnerHtml": "off"
      },
      "suspicious": {
        "noConsoleLog": "warn"
      }
    }
  }
}
```

**Frontend (`apps/frontend/biome.json`)**:
```json
{
  "extends": ["../../biome.json"],
  "linter": {
    "rules": {
      "a11y": {
        "useKeyWithClickEvents": "error",
        "useAltText": "error"
      },
      "suspicious": {
        "noConsoleLog": "error"
      }
    }
  }
}
```

### 2. Package.json Scripts Migration

#### Root `package.json` Scripts

```json
{
  "scripts": {
    "lint": "biome lint .",
    "lint:fix": "biome lint --write .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "ci:check": "biome ci ."
  }
}
```

#### Workspace `package.json` Scripts

**Backend**:
```json
{
  "scripts": {
    "lint": "biome lint src/ tests/",
    "lint:fix": "biome lint --write src/ tests/",
    "format": "biome format --write src/ tests/",
    "format:check": "biome format src/ tests/",
    "check": "biome check src/ tests/",
    "check:fix": "biome check --write src/ tests/"
  }
}
```

**Frontend**:
```json
{
  "scripts": {
    "lint": "biome lint src/",
    "lint:fix": "biome lint --write src/",
    "format": "biome format --write src/",
    "format:check": "biome format src/",
    "check": "biome check src/",
    "check:fix": "biome check --write src/"
  }
}
```

### 3. IDE Integration

#### VS Code Configuration (`.vscode/settings.json`)

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[jsonc]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "eslint.enable": false,
  "prettier.enable": false
}
```

#### VS Code Extensions (`.vscode/extensions.json`)

```json
{
  "recommendations": [
    "biomejs.biome"
  ],
  "unwantedRecommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode"
  ]
}
```

### 4. CI/CD Integration

#### GitHub Actions Example

```yaml
name: Code Quality

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run ci:check
```

### 5. Git Hooks Integration

#### Husky + lint-staged Configuration

**`.husky/pre-commit`**:
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm exec lint-staged
```

**`package.json` lint-staged**:
```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json}": [
      "biome check --write --no-errors-on-unmatched"
    ]
  }
}
```

## Data Models

### Configuration Schema

```typescript
interface BiomeConfig {
  $schema: string;
  extends?: string[];
  organizeImports?: {
    enabled: boolean;
  };
  linter?: {
    enabled: boolean;
    rules?: {
      recommended?: boolean;
      [category: string]: RuleConfig;
    };
  };
  formatter?: {
    enabled: boolean;
    formatWithErrors?: boolean;
    indentStyle?: 'space' | 'tab';
    indentWidth?: number;
    lineWidth?: number;
    lineEnding?: 'lf' | 'crlf' | 'cr';
  };
  javascript?: {
    formatter?: {
      quoteStyle?: 'single' | 'double';
      semicolons?: 'always' | 'asNeeded';
      trailingCommas?: 'none' | 'es5' | 'all';
      arrowParentheses?: 'always' | 'asNeeded';
    };
  };
  json?: {
    formatter?: {
      enabled: boolean;
      indentWidth?: number;
    };
    linter?: {
      enabled: boolean;
    };
  };
  files?: {
    ignore?: string[];
    include?: string[];
  };
}

type RuleConfig = 
  | boolean 
  | 'error' 
  | 'warn' 
  | 'off'
  | { level: 'error' | 'warn' | 'off'; options?: Record<string, unknown> };
```

### Migration State Tracking

```typescript
interface MigrationState {
  phase: 'planning' | 'biome-migration' | 'biome-complete' | 'vite-plus-ready';
  completedSteps: string[];
  pendingSteps: string[];
  blockers: string[];
  vitePlusAvailable: boolean;
  vitePlusVersion?: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Configuration Inheritance Consistency

*For any* workspace-specific Biome configuration, extending the root configuration should preserve all root rules unless explicitly overridden, and the merged configuration should be valid according to the Biome schema.

**Validates: Requirements 1.3**

### Property 2: Formatting Determinism

*For any* source file, running Biome format multiple times should produce identical output after the first format, ensuring formatting is idempotent.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 3: Linting Rule Equivalence

*For any* code pattern that was an error in ESLint, the equivalent Biome rule should also report it as an error, maintaining code quality standards during migration.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 4: Script Command Compatibility

*For any* package.json script that previously used ESLint or Prettier, the replacement Biome command should accept the same file paths and produce equivalent results.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 5: Ignore Pattern Completeness

*For any* file matching the ignore patterns, Biome should not process it, and the set of ignored files should match the previous ESLint/Prettier ignore patterns.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

### Property 6: JSON Validation Correctness

*For any* JSON file in the project, Biome should detect syntax errors and formatting inconsistencies, and formatting should preserve semantic equivalence.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

### Property 7: IDE Integration Consistency

*For any* supported IDE with Biome extension installed, format-on-save should produce the same output as running `biome format --write` from the command line.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 8: CI/CD Exit Code Correctness

*For any* code with linting or formatting violations, the `biome ci` command should exit with a non-zero status code, ensuring CI/CD pipelines fail appropriately.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 9: Vite+ Migration Readiness

*For any* Biome configuration or script, the structure should be compatible with future Vite+ commands, requiring minimal changes when migrating to `vite lint` and `vite fmt`.

**Validates: Requirements 11.1, 11.2, 11.3**

## Error Handling

### Configuration Errors

```typescript
class BiomeConfigError extends Error {
  constructor(
    message: string,
    public readonly configPath: string,
    public readonly validationErrors: string[]
  ) {
    super(message);
    this.name = 'BiomeConfigError';
  }
}

// Usage
try {
  validateBiomeConfig(configPath);
} catch (error) {
  if (error instanceof BiomeConfigError) {
    console.error(`Invalid Biome configuration at ${error.configPath}`);
    error.validationErrors.forEach(err => console.error(`  - ${err}`));
  }
}
```

### Migration Errors

```typescript
class MigrationError extends Error {
  constructor(
    message: string,
    public readonly step: string,
    public readonly recoveryAction: string
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

// Usage
try {
  removeESLintDependencies();
} catch (error) {
  throw new MigrationError(
    'Failed to remove ESLint dependencies',
    'dependency-removal',
    'Run: pnpm install to restore package-lock.json'
  );
}
```

### Linting Errors

```typescript
interface LintResult {
  filePath: string;
  errors: LintError[];
  warnings: LintWarning[];
  fixable: boolean;
}

interface LintError {
  rule: string;
  message: string;
  line: number;
  column: number;
  severity: 'error';
}

interface LintWarning {
  rule: string;
  message: string;
  line: number;
  column: number;
  severity: 'warn';
}
```

## Testing Strategy

### Unit Testing

**Configuration Validation Tests**:
```typescript
describe('Biome Configuration', () => {
  it('should validate root biome.json schema', () => {
    const config = loadBiomeConfig('biome.json');
    expect(config).toMatchSchema(BiomeConfigSchema);
  });

  it('should merge workspace configs correctly', () => {
    const rootConfig = loadBiomeConfig('biome.json');
    const backendConfig = loadBiomeConfig('apps/backend/biome.json');
    const merged = mergeConfigs(rootConfig, backendConfig);
    
    expect(merged.linter.rules.security.noGlobalEval).toBe('error');
  });

  it('should preserve formatting settings from Prettier', () => {
    const config = loadBiomeConfig('biome.json');
    
    expect(config.javascript.formatter.quoteStyle).toBe('single');
    expect(config.javascript.formatter.semicolons).toBe('always');
    expect(config.formatter.indentWidth).toBe(2);
    expect(config.formatter.lineWidth).toBe(80);
  });
});
```

**Script Migration Tests**:
```typescript
describe('Package.json Scripts', () => {
  it('should replace lint scripts with biome commands', () => {
    const pkg = loadPackageJson('package.json');
    
    expect(pkg.scripts.lint).toBe('biome lint .');
    expect(pkg.scripts['lint:fix']).toBe('biome lint --write .');
  });

  it('should replace format scripts with biome commands', () => {
    const pkg = loadPackageJson('package.json');
    
    expect(pkg.scripts.format).toBe('biome format --write .');
    expect(pkg.scripts['format:check']).toBe('biome format .');
  });

  it('should add check scripts for combined linting and formatting', () => {
    const pkg = loadPackageJson('package.json');
    
    expect(pkg.scripts.check).toBe('biome check .');
    expect(pkg.scripts['check:fix']).toBe('biome check --write .');
  });
});
```

### Property-Based Testing

**Property Test 1: Formatting Idempotence**:
```typescript
import fc from 'fast-check';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

describe('Property: Formatting Idempotence', () => {
  it('should produce identical output when formatting twice', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 1000 }),
        (code) => {
          // Write code to temp file
          const tempFile = '/tmp/test-format.ts';
          writeFileSync(tempFile, code);

          // Format once
          execSync(`biome format --write ${tempFile}`);
          const firstFormat = readFileSync(tempFile, 'utf-8');

          // Format again
          execSync(`biome format --write ${tempFile}`);
          const secondFormat = readFileSync(tempFile, 'utf-8');

          // Should be identical
          return firstFormat === secondFormat;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property Test 2: Configuration Inheritance**:
```typescript
describe('Property: Configuration Inheritance', () => {
  it('should preserve root rules in workspace configs', () => {
    fc.assert(
      fc.property(
        fc.record({
          rootRule: fc.constantFrom('error', 'warn', 'off'),
          workspaceOverride: fc.option(fc.constantFrom('error', 'warn', 'off'), { nil: undefined })
        }),
        ({ rootRule, workspaceOverride }) => {
          const rootConfig = { linter: { rules: { test: { rule1: rootRule } } } };
          const workspaceConfig = workspaceOverride 
            ? { extends: ['../../biome.json'], linter: { rules: { test: { rule1: workspaceOverride } } } }
            : { extends: ['../../biome.json'] };

          const merged = mergeConfigs(rootConfig, workspaceConfig);

          // If workspace overrides, use that; otherwise use root
          const expected = workspaceOverride ?? rootRule;
          return merged.linter.rules.test.rule1 === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property Test 3: Ignore Pattern Matching**:
```typescript
describe('Property: Ignore Pattern Completeness', () => {
  it('should ignore all files matching ignore patterns', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'node_modules/package/index.js',
          'dist/bundle.js',
          'coverage/lcov-report/index.html',
          '.git/config',
          'types.d.ts'
        ),
        (filePath) => {
          const config = loadBiomeConfig('biome.json');
          const shouldIgnore = matchesIgnorePattern(filePath, config.files.ignore);

          // All these paths should be ignored
          return shouldIgnore === true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
```

### Integration Testing

**End-to-End Migration Test**:
```typescript
describe('Migration Integration', () => {
  it('should successfully migrate from ESLint to Biome', async () => {
    // 1. Install Biome
    execSync('pnpm add -D @biomejs/biome');

    // 2. Create Biome config
    const config = generateBiomeConfig();
    writeFileSync('biome.json', JSON.stringify(config, null, 2));

    // 3. Update scripts
    updatePackageJsonScripts();

    // 4. Run Biome check
    const result = execSync('pnpm run check', { encoding: 'utf-8' });

    // 5. Verify no errors
    expect(result).not.toContain('error');

    // 6. Remove ESLint/Prettier
    removeOldDependencies();

    // 7. Verify removal
    const pkg = loadPackageJson('package.json');
    expect(pkg.devDependencies).not.toHaveProperty('eslint');
    expect(pkg.devDependencies).not.toHaveProperty('prettier');
  });
});
```

### Manual Testing Checklist

- [ ] Run `biome check .` on entire monorepo
- [ ] Verify all TypeScript files format correctly
- [ ] Verify all JSON files format correctly
- [ ] Test format-on-save in VS Code
- [ ] Test lint-on-save in VS Code
- [ ] Run CI/CD pipeline with Biome
- [ ] Verify git hooks work with Biome
- [ ] Test workspace-specific configurations
- [ ] Verify ignore patterns work correctly
- [ ] Compare Biome output with previous ESLint/Prettier output

## Future Vite+ Migration Path

### Preparation Steps (During Biome Migration)

1. **Use Compatible Script Names**:
   - `lint` → will become `vite lint`
   - `format` → will become `vite fmt`
   - `test` → already using `vite test` (Vitest)

2. **Maintain Vitest Integration**:
   - Keep Vitest configuration compatible with Vite+
   - Use `vite test` naming convention in scripts

3. **Document Configuration Patterns**:
   - Document how Biome rules map to Oxlint rules
   - Document how Biome formatter settings map to Oxfmt settings

### Migration Steps (When Vite+ Available)

1. **Install Vite+**:
   ```bash
   pnpm add -D vite-plus
   ```

2. **Create Vite+ Configuration**:
   ```typescript
   // vite.config.ts
   export default {
     lint: {
       // Oxlint configuration (similar to Biome)
     },
     fmt: {
       // Oxfmt configuration (99%+ Prettier compatible)
     },
     test: {
       // Vitest configuration (already in use)
     }
   };
   ```

3. **Update Scripts**:
   ```json
   {
     "scripts": {
       "lint": "vite lint",
       "format": "vite fmt",
       "test": "vite test",
       "check": "vite lint && vite fmt --check"
     }
   }
   ```

4. **Remove Biome**:
   ```bash
   pnpm remove @biomejs/biome
   ```

### Expected Benefits of Vite+ Migration

- **100x faster linting** with Oxlint vs ESLint
- **99%+ Prettier compatibility** with Oxfmt
- **Unified toolchain** with `vite new`, `vite run`, `vite ui`
- **Intelligent caching** with built-in task runner
- **Seamless integration** with existing Vite and Vitest setup

## Implementation Notes

### Dependency Management

**Remove**:
- `eslint`
- `@eslint/js`
- `@typescript-eslint/eslint-plugin`
- `@typescript-eslint/parser`
- `typescript-eslint`
- `eslint-plugin-security`
- `prettier`

**Add**:
- `@biomejs/biome` (latest version)

### File Cleanup

**Delete**:
- `eslint.config.ts` (root)
- `apps/backend/eslint.config.ts`
- `apps/frontend/eslint.config.ts`
- `.prettierrc`
- `.prettierignore`
- `packages/shared-config/eslint/` (optional, can repurpose)

**Create**:
- `biome.json` (root)
- `apps/backend/biome.json`
- `apps/frontend/biome.json`

### Performance Considerations

- Biome is significantly faster than ESLint + Prettier (10-100x)
- Biome uses Rust for performance-critical operations
- Biome has built-in caching for incremental checks
- Biome can process multiple files in parallel

### Security Considerations

- Maintain all security rules from ESLint security plugin
- Ensure Biome security rules are enabled
- Validate that no security checks are lost during migration
- Document any security rule differences

## Documentation Requirements

### Migration Guide

Create `docs/BIOME_MIGRATION.md` with:
- Step-by-step migration instructions
- ESLint to Biome rule mapping
- Prettier to Biome formatter mapping
- Troubleshooting common issues
- IDE setup instructions
- CI/CD integration examples

### Developer Guide

Update `docs/DEVELOPMENT.md` with:
- New linting and formatting commands
- Biome configuration structure
- How to add workspace-specific rules
- How to disable rules for specific files
- Performance tips

### Vite+ Preparation Guide

Create `docs/VITE_PLUS_PREPARATION.md` with:
- Overview of Vite+ and its benefits
- Timeline for Vite+ availability (early 2026)
- Configuration compatibility notes
- Expected migration effort
- Licensing considerations (free for individuals/small businesses)

## Success Criteria

### Phase 1: Biome Migration Complete

- [ ] Biome installed and configured
- [ ] All ESLint and Prettier dependencies removed
- [ ] All package.json scripts updated
- [ ] All configuration files migrated
- [ ] IDE integration working
- [ ] CI/CD pipelines updated
- [ ] Git hooks updated
- [ ] Documentation complete
- [ ] All tests passing
- [ ] No linting or formatting errors

### Phase 2: Vite+ Ready

- [ ] Configuration patterns compatible with Vite+
- [ ] Script naming conventions aligned with Vite+
- [ ] Vitest integration maintained
- [ ] Documentation for future migration complete
- [ ] Team trained on Vite+ concepts
- [ ] Monitoring Vite+ release schedule

## Conclusion

This design provides a comprehensive approach to migrating from ESLint + Prettier to Biome, with careful consideration for future Vite+ adoption. The migration will improve developer experience through faster linting and formatting, while maintaining code quality standards and positioning the codebase for seamless integration with Vite+ when it becomes available in 2026.
