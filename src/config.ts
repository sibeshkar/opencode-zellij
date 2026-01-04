import { z } from "zod";

/**
 * Configuration schema for opencode-zellij plugin
 */
export const OpenCodeZellijConfigSchema = z.object({
  $schema: z.string().optional(),

  /** Whether to automatically rename tabs with todo progress (default: true) */
  auto_rename_tabs: z.boolean().default(true),

  /** Custom path to the WASM plugin (default: bundled, not typically needed) */
  plugin_path: z.string().nullable().default(null),
});

export type OpenCodeZellijConfig = z.infer<typeof OpenCodeZellijConfigSchema>;

/**
 * Default configuration values
 */
export const defaultConfig: OpenCodeZellijConfig = {
  auto_rename_tabs: true,
  plugin_path: null,
};

/**
 * Get config value with environment variable override
 */
export function getConfigWithEnvOverrides(
  config: OpenCodeZellijConfig
): OpenCodeZellijConfig {
  return {
    ...config,
    auto_rename_tabs:
      process.env.OPENCODE_ZELLIJ_NO_TAB_RENAME === "1"
        ? false
        : config.auto_rename_tabs,
    plugin_path:
      process.env.OPENCODE_ZELLIJ_PLUGIN_PATH || config.plugin_path,
  };
}
