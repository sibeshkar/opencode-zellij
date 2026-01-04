import * as fs from "fs";
import * as path from "path";
import {
  OpenCodeZellijConfigSchema,
  type OpenCodeZellijConfig,
  defaultConfig,
  getConfigWithEnvOverrides,
} from "./config";

/**
 * Get the user config directory (cross-platform)
 */
function getUserConfigDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(process.env.HOME || "", ".config");
  }
  return path.join(process.env.HOME || "", ".config");
}

/**
 * Parse JSON with comments (JSONC)
 */
function parseJsonc<T>(content: string): T {
  // Remove single-line comments
  let cleaned = content.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove trailing commas
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(cleaned) as T;
}

/**
 * Load config from a specific path
 */
function loadConfigFromPath(configPath: string): OpenCodeZellijConfig | null {
  try {
    // Check for .jsonc first, then .json
    const jsonc = configPath + "c";
    const actualPath = fs.existsSync(jsonc)
      ? jsonc
      : fs.existsSync(configPath)
        ? configPath
        : null;

    if (!actualPath) return null;

    const content = fs.readFileSync(actualPath, "utf-8");
    const rawConfig = parseJsonc<Record<string, unknown>>(content);
    const result = OpenCodeZellijConfigSchema.safeParse(rawConfig);

    if (!result.success) {
      console.error(
        `[opencode-zellij] Config validation error in ${actualPath}:`,
        result.error.issues
      );
      return null;
    }

    return result.data;
  } catch (err) {
    console.error(`[opencode-zellij] Error loading config from ${configPath}:`, err);
    return null;
  }
}

/**
 * Merge two configs (override takes precedence)
 */
function mergeConfigs(
  base: OpenCodeZellijConfig,
  override: OpenCodeZellijConfig
): OpenCodeZellijConfig {
  return { ...base, ...override };
}

/**
 * Load plugin configuration from user and project locations
 */
export function loadPluginConfig(directory: string): OpenCodeZellijConfig {
  // User-level config path
  const userConfigPath = path.join(
    getUserConfigDir(),
    "opencode",
    "opencode-zellij.json"
  );

  // Project-level config path
  const projectConfigPath = path.join(
    directory,
    ".opencode",
    "opencode-zellij.json"
  );

  // Start with defaults
  let config: OpenCodeZellijConfig = { ...defaultConfig };

  // Override with user config
  const userConfig = loadConfigFromPath(userConfigPath);
  if (userConfig) {
    config = mergeConfigs(config, userConfig);
  }

  // Override with project config
  const projectConfig = loadConfigFromPath(projectConfigPath);
  if (projectConfig) {
    config = mergeConfigs(config, projectConfig);
  }

  // Apply environment variable overrides
  config = getConfigWithEnvOverrides(config);

  return config;
}
