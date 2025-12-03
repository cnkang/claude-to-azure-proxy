/**
 * Property-Based Test for Biome Configuration Inheritance
 * Feature: vite-biome-migration, Property 1: Configuration Inheritance Consistency
 * Validates: Requirements 1.3
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

interface BiomeConfig {
  $schema?: string;
  extends?: string[];
  linter?: {
    enabled?: boolean;
    rules?: Record<string, unknown>;
  };
  formatter?: {
    enabled?: boolean;
    indentStyle?: string;
    indentWidth?: number;
    lineWidth?: number;
  };
  organizeImports?: {
    enabled?: boolean;
  };
  files?: {
    ignore?: string[];
    include?: string[];
  };
}

/**
 * Merges workspace config with root config following Biome's inheritance rules
 */
function mergeConfigs(
  rootConfig: BiomeConfig,
  workspaceConfig: BiomeConfig
): BiomeConfig {
  // Deep merge logic following Biome's behavior
  const merged: BiomeConfig = JSON.parse(JSON.stringify(rootConfig));

  // Merge linter rules
  if (workspaceConfig.linter?.rules) {
    merged.linter = merged.linter || {};
    merged.linter.rules = merged.linter.rules || {};

    for (const [category, rules] of Object.entries(
      workspaceConfig.linter.rules
    )) {
      if (
        typeof rules === 'object' &&
        rules !== null &&
        !Array.isArray(rules)
      ) {
        // Deep merge the category rules
        const existingCategoryRules = merged.linter.rules[category];
        if (
          typeof existingCategoryRules === 'object' &&
          existingCategoryRules !== null &&
          !Array.isArray(existingCategoryRules)
        ) {
          merged.linter.rules[category] = {
            ...existingCategoryRules,
            ...(rules as Record<string, unknown>),
          };
        } else {
          merged.linter.rules[category] = rules;
        }
      } else {
        merged.linter.rules[category] = rules;
      }
    }
  }

  // Merge linter enabled setting
  if (workspaceConfig.linter?.enabled !== undefined) {
    merged.linter = merged.linter || {};
    merged.linter.enabled = workspaceConfig.linter.enabled;
  }

  // Merge formatter settings
  if (workspaceConfig.formatter) {
    merged.formatter = {
      ...merged.formatter,
      ...workspaceConfig.formatter,
    };
  }

  // Merge organizeImports
  if (workspaceConfig.organizeImports) {
    merged.organizeImports = {
      ...merged.organizeImports,
      ...workspaceConfig.organizeImports,
    };
  }

  // Merge files
  if (workspaceConfig.files) {
    merged.files = {
      ...merged.files,
      ...workspaceConfig.files,
    };
  }

  return merged;
}

/**
 * Loads and parses a Biome configuration file
 */
function loadBiomeConfig(configPath: string): BiomeConfig {
  const fullPath = join(process.cwd(), configPath);
  const content = readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as BiomeConfig;
}

describe('Property: Configuration Inheritance Consistency', () => {
  it('should preserve root rules in workspace configs when not overridden', () => {
    // Load actual configs
    const rootConfig = loadBiomeConfig('biome.json');
    const backendConfig = loadBiomeConfig('apps/backend/biome.json');
    const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

    // Verify extends field is present
    expect(backendConfig.extends).toEqual(['../../biome.json']);
    expect(frontendConfig.extends).toEqual(['../../biome.json']);

    // Merge configs
    const mergedBackend = mergeConfigs(rootConfig, backendConfig);
    const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

    // Verify root rules are preserved in backend
    expect(mergedBackend.linter?.rules).toBeDefined();
    expect(mergedBackend.formatter).toBeDefined();
    expect(mergedBackend.organizeImports).toBeDefined();

    // Verify root rules are preserved in frontend
    expect(mergedFrontend.linter?.rules).toBeDefined();
    expect(mergedFrontend.formatter).toBeDefined();
    expect(mergedFrontend.organizeImports).toBeDefined();

    // Verify formatter settings are inherited
    expect(mergedBackend.formatter?.indentWidth).toBe(
      rootConfig.formatter?.indentWidth
    );
    expect(mergedFrontend.formatter?.indentWidth).toBe(
      rootConfig.formatter?.indentWidth
    );
  });

  it('should allow workspace overrides to take precedence over root rules', () => {
    const rootConfig = loadBiomeConfig('biome.json');
    const backendConfig = loadBiomeConfig('apps/backend/biome.json');
    const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

    const mergedBackend = mergeConfigs(rootConfig, backendConfig);
    const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

    // Backend workspace config adds noConsoleLog as warn
    const backendWorkspaceRules = backendConfig.linter?.rules as Record<
      string,
      Record<string, string>
    >;
    expect(backendWorkspaceRules?.suspicious?.noConsoleLog).toBe('warn');

    // After merging, backend should have console.log as warn
    const backendRules = mergedBackend.linter?.rules as Record<
      string,
      Record<string, string>
    >;
    expect(backendRules?.suspicious?.noConsoleLog).toBe('warn');

    // Frontend workspace config adds noConsoleLog as error
    const frontendWorkspaceRules = frontendConfig.linter?.rules as Record<
      string,
      Record<string, string>
    >;
    expect(frontendWorkspaceRules?.suspicious?.noConsoleLog).toBe('error');

    // After merging, frontend should have console.log as error
    const frontendRules = mergedFrontend.linter?.rules as Record<
      string,
      Record<string, string>
    >;
    expect(frontendRules?.suspicious?.noConsoleLog).toBe('error');

    // Backend should have noDangerouslySetInnerHtml as off (overridden from root's 'error')
    expect(backendRules?.security?.noDangerouslySetInnerHtml).toBe('off');

    // Root has noDangerouslySetInnerHtml as error
    const rootRules = rootConfig.linter?.rules as Record<
      string,
      Record<string, string>
    >;
    expect(rootRules?.security?.noDangerouslySetInnerHtml).toBe('error');

    // Frontend should have a11y rules (added in workspace)
    expect(frontendRules?.a11y).toBeDefined();
  });

  it('should maintain valid Biome schema after merging', () => {
    const rootConfig = loadBiomeConfig('biome.json');
    const backendConfig = loadBiomeConfig('apps/backend/biome.json');
    const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

    const mergedBackend = mergeConfigs(rootConfig, backendConfig);
    const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

    // Verify required schema properties exist
    expect(mergedBackend).toHaveProperty('linter');
    expect(mergedBackend).toHaveProperty('formatter');
    expect(mergedFrontend).toHaveProperty('linter');
    expect(mergedFrontend).toHaveProperty('formatter');

    // Verify linter is enabled (from root config)
    expect(mergedBackend.linter?.enabled).toBe(true);
    expect(mergedFrontend.linter?.enabled).toBe(true);

    // Verify formatter settings are inherited (root doesn't have enabled field explicitly)
    expect(mergedBackend.formatter?.indentWidth).toBe(2);
    expect(mergedFrontend.formatter?.indentWidth).toBe(2);
    expect(mergedBackend.formatter?.lineWidth).toBe(80);
    expect(mergedFrontend.formatter?.lineWidth).toBe(80);
  });

  it('property: for any rule configuration, workspace overrides should take precedence', () => {
    fc.assert(
      fc.property(
        fc.record({
          rootRule: fc.constantFrom('error', 'warn', 'off'),
          workspaceOverride: fc.option(
            fc.constantFrom('error', 'warn', 'off'),
            { nil: undefined }
          ),
        }),
        ({ rootRule, workspaceOverride }) => {
          // Create test configs
          const rootConfig: BiomeConfig = {
            linter: {
              rules: {
                test: {
                  rule1: rootRule,
                },
              },
            },
          };

          const workspaceConfig: BiomeConfig = {
            extends: ['../../biome.json'],
            linter: workspaceOverride
              ? {
                  rules: {
                    test: {
                      rule1: workspaceOverride,
                    },
                  },
                }
              : undefined,
          };

          const merged = mergeConfigs(rootConfig, workspaceConfig);

          // If workspace overrides, use that; otherwise use root
          const expected = workspaceOverride ?? rootRule;
          const mergedRules = merged.linter?.rules as Record<
            string,
            Record<string, string>
          >;
          return mergedRules?.test?.rule1 === expected;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: for any formatter setting, workspace overrides should take precedence', () => {
    fc.assert(
      fc.property(
        fc.record({
          rootIndentWidth: fc.integer({ min: 2, max: 8 }),
          workspaceIndentWidth: fc.option(fc.integer({ min: 2, max: 8 }), {
            nil: undefined,
          }),
        }),
        ({ rootIndentWidth, workspaceIndentWidth }) => {
          const rootConfig: BiomeConfig = {
            formatter: {
              indentWidth: rootIndentWidth,
            },
          };

          const workspaceConfig: BiomeConfig = {
            extends: ['../../biome.json'],
            formatter: workspaceIndentWidth
              ? {
                  indentWidth: workspaceIndentWidth,
                }
              : undefined,
          };

          const merged = mergeConfigs(rootConfig, workspaceConfig);

          // If workspace overrides, use that; otherwise use root
          const expected = workspaceIndentWidth ?? rootIndentWidth;
          return merged.formatter?.indentWidth === expected;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: merged config should always have required fields from root', () => {
    fc.assert(
      fc.property(
        fc.record({
          hasWorkspaceLinter: fc.boolean(),
          hasWorkspaceFormatter: fc.boolean(),
        }),
        ({ hasWorkspaceLinter, hasWorkspaceFormatter }) => {
          const rootConfig: BiomeConfig = {
            linter: {
              enabled: true,
              rules: {
                recommended: true,
              },
            },
            formatter: {
              enabled: true,
              indentWidth: 2,
            },
            organizeImports: {
              enabled: true,
            },
          };

          const workspaceConfig: BiomeConfig = {
            extends: ['../../biome.json'],
            linter: hasWorkspaceLinter
              ? {
                  rules: {
                    test: {
                      rule1: 'error',
                    },
                  },
                }
              : undefined,
            formatter: hasWorkspaceFormatter
              ? {
                  indentWidth: 4,
                }
              : undefined,
          };

          const merged = mergeConfigs(rootConfig, workspaceConfig);

          // Required fields from root should always be present
          return (
            merged.linter !== undefined &&
            merged.formatter !== undefined &&
            merged.organizeImports !== undefined &&
            merged.linter.enabled === true &&
            merged.formatter.enabled === true &&
            merged.organizeImports.enabled === true
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
