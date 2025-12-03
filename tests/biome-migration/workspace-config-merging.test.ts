/**
 * Unit Tests for Workspace Configuration Merging
 * Validates: Requirements 1.3, 2.5
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  javascript?: {
    formatter?: {
      quoteStyle?: string;
      semicolons?: string;
      trailingCommas?: string;
    };
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
 * Loads and parses a Biome configuration file
 */
function loadBiomeConfig(configPath: string): BiomeConfig {
  const fullPath = join(process.cwd(), configPath);
  const content = readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as BiomeConfig;
}

/**
 * Simulates Biome's config merging behavior
 */
function mergeConfigs(
  rootConfig: BiomeConfig,
  workspaceConfig: BiomeConfig
): BiomeConfig {
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

  if (workspaceConfig.linter?.enabled !== undefined) {
    merged.linter = merged.linter || {};
    merged.linter.enabled = workspaceConfig.linter.enabled;
  }

  if (workspaceConfig.formatter) {
    merged.formatter = {
      ...merged.formatter,
      ...workspaceConfig.formatter,
    };
  }

  if (workspaceConfig.organizeImports) {
    merged.organizeImports = {
      ...merged.organizeImports,
      ...workspaceConfig.organizeImports,
    };
  }

  if (workspaceConfig.files) {
    merged.files = {
      ...merged.files,
      ...workspaceConfig.files,
    };
  }

  return merged;
}

describe('Workspace Configuration Merging', () => {
  describe('Backend Configuration', () => {
    it('should correctly extend root config', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');

      // Verify backend config has extends field
      expect(backendConfig.extends).toEqual(['../../biome.json']);

      // Verify backend config has workspace-specific rules
      expect(backendConfig.linter?.rules).toBeDefined();
    });

    it('should merge backend config with root config correctly', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const merged = mergeConfigs(rootConfig, backendConfig);

      // Verify root rules are preserved
      const mergedRules = merged.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      expect(mergedRules?.security?.noGlobalEval).toBe('error');
      expect(mergedRules?.suspicious?.noExplicitAny).toBe('error');
      expect(mergedRules?.suspicious?.noDoubleEquals).toBe('error');

      // Verify workspace overrides are applied
      expect(mergedRules?.security?.noDangerouslySetInnerHtml).toBe('off');
      expect(mergedRules?.suspicious?.noConsoleLog).toBe('warn');

      // Verify formatter settings are inherited
      expect(merged.formatter?.indentWidth).toBe(2);
      expect(merged.formatter?.lineWidth).toBe(80);
    });

    it('should have backend-specific security rules', () => {
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const backendRules = backendConfig.linter?.rules as Record<
        string,
        Record<string, string>
      >;

      // Backend should disable noDangerouslySetInnerHtml (not relevant for backend)
      expect(backendRules?.security?.noDangerouslySetInnerHtml).toBe('off');

      // Backend should keep noGlobalEval as error
      expect(backendRules?.security?.noGlobalEval).toBe('error');

      // Backend should have console.log as warn (not error)
      expect(backendRules?.suspicious?.noConsoleLog).toBe('warn');
    });
  });

  describe('Frontend Configuration', () => {
    it('should correctly extend root config', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

      // Verify frontend config has extends field
      expect(frontendConfig.extends).toEqual(['../../biome.json']);

      // Verify frontend config has workspace-specific rules
      expect(frontendConfig.linter?.rules).toBeDefined();
    });

    it('should merge frontend config with root config correctly', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');
      const merged = mergeConfigs(rootConfig, frontendConfig);

      // Verify root rules are preserved
      const mergedRules = merged.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      expect(mergedRules?.security?.noGlobalEval).toBe('error');
      expect(mergedRules?.security?.noDangerouslySetInnerHtml).toBe('error');
      expect(mergedRules?.suspicious?.noExplicitAny).toBe('error');
      expect(mergedRules?.suspicious?.noDoubleEquals).toBe('error');

      // Verify workspace-specific rules are added
      expect(mergedRules?.suspicious?.noConsoleLog).toBe('error');
      expect(mergedRules?.a11y).toBeDefined();

      // Verify formatter settings are inherited
      expect(merged.formatter?.indentWidth).toBe(2);
      expect(merged.formatter?.lineWidth).toBe(80);
    });

    it('should have frontend-specific accessibility rules', () => {
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');
      const frontendRules = frontendConfig.linter?.rules as Record<
        string,
        Record<string, string>
      >;

      // Frontend should have a11y rules
      expect(frontendRules?.a11y).toBeDefined();
      expect(frontendRules?.a11y?.useKeyWithClickEvents).toBe('error');
      expect(frontendRules?.a11y?.useAltText).toBe('error');

      // Frontend should have console.log as error (stricter than backend)
      expect(frontendRules?.suspicious?.noConsoleLog).toBe('error');
    });
  });

  describe('Workspace Overrides', () => {
    it('should allow workspace overrides to take precedence over root rules', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

      const mergedBackend = mergeConfigs(rootConfig, backendConfig);
      const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

      // Root has noDangerouslySetInnerHtml as error
      const rootRules = rootConfig.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      expect(rootRules?.security?.noDangerouslySetInnerHtml).toBe('error');

      // Backend overrides it to off
      const backendRules = mergedBackend.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      expect(backendRules?.security?.noDangerouslySetInnerHtml).toBe('off');

      // Frontend keeps it as error (inherited from root)
      const frontendRules = mergedFrontend.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      expect(frontendRules?.security?.noDangerouslySetInnerHtml).toBe('error');
    });

    it('should preserve root rules when workspace does not override them', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

      const mergedBackend = mergeConfigs(rootConfig, backendConfig);
      const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

      // Both should preserve noGlobalEval from root
      const backendRules = mergedBackend.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      const frontendRules = mergedFrontend.linter?.rules as Record<
        string,
        Record<string, string>
      >;

      expect(backendRules?.security?.noGlobalEval).toBe('error');
      expect(frontendRules?.security?.noGlobalEval).toBe('error');

      // Both should preserve noExplicitAny from root
      expect(backendRules?.suspicious?.noExplicitAny).toBe('error');
      expect(frontendRules?.suspicious?.noExplicitAny).toBe('error');

      // Both should preserve noDoubleEquals from root
      expect(backendRules?.suspicious?.noDoubleEquals).toBe('error');
      expect(frontendRules?.suspicious?.noDoubleEquals).toBe('error');
    });

    it('should allow workspace to add new rules not in root', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

      const mergedBackend = mergeConfigs(rootConfig, backendConfig);
      const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

      // Root doesn't have noConsoleLog
      const rootRules = rootConfig.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      expect(rootRules?.suspicious?.noConsoleLog).toBeUndefined();

      // Backend adds it as warn
      const backendRules = mergedBackend.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      expect(backendRules?.suspicious?.noConsoleLog).toBe('warn');

      // Frontend adds it as error
      const frontendRules = mergedFrontend.linter?.rules as Record<
        string,
        Record<string, string>
      >;
      expect(frontendRules?.suspicious?.noConsoleLog).toBe('error');

      // Root doesn't have a11y rules
      expect(rootRules?.a11y).toBeUndefined();

      // Frontend adds a11y rules
      expect(frontendRules?.a11y).toBeDefined();
      expect(frontendRules?.a11y?.useKeyWithClickEvents).toBe('error');
      expect(frontendRules?.a11y?.useAltText).toBe('error');
    });
  });

  describe('Configuration Inheritance', () => {
    it('should inherit formatter settings from root', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

      const mergedBackend = mergeConfigs(rootConfig, backendConfig);
      const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

      // Both should inherit formatter settings from root
      expect(mergedBackend.formatter?.indentStyle).toBe('space');
      expect(mergedBackend.formatter?.indentWidth).toBe(2);
      expect(mergedBackend.formatter?.lineWidth).toBe(80);

      expect(mergedFrontend.formatter?.indentStyle).toBe('space');
      expect(mergedFrontend.formatter?.indentWidth).toBe(2);
      expect(mergedFrontend.formatter?.lineWidth).toBe(80);
    });

    it('should inherit organizeImports setting from root', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

      const mergedBackend = mergeConfigs(rootConfig, backendConfig);
      const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

      // Both should inherit organizeImports from root
      expect(mergedBackend.organizeImports?.enabled).toBe(true);
      expect(mergedFrontend.organizeImports?.enabled).toBe(true);
    });

    it('should inherit linter enabled setting from root', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

      const mergedBackend = mergeConfigs(rootConfig, backendConfig);
      const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

      // Both should inherit linter enabled from root
      expect(mergedBackend.linter?.enabled).toBe(true);
      expect(mergedFrontend.linter?.enabled).toBe(true);
    });

    it('should inherit javascript formatter settings from root', () => {
      const rootConfig = loadBiomeConfig('biome.json');
      const backendConfig = loadBiomeConfig('apps/backend/biome.json');
      const frontendConfig = loadBiomeConfig('apps/frontend/biome.json');

      const mergedBackend = mergeConfigs(rootConfig, backendConfig);
      const mergedFrontend = mergeConfigs(rootConfig, frontendConfig);

      // Both should inherit javascript formatter settings from root
      expect(mergedBackend.javascript?.formatter?.quoteStyle).toBe('single');
      expect(mergedBackend.javascript?.formatter?.semicolons).toBe('always');
      expect(mergedBackend.javascript?.formatter?.trailingCommas).toBe('es5');

      expect(mergedFrontend.javascript?.formatter?.quoteStyle).toBe('single');
      expect(mergedFrontend.javascript?.formatter?.semicolons).toBe('always');
      expect(mergedFrontend.javascript?.formatter?.trailingCommas).toBe('es5');
    });
  });
});
