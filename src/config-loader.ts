import { EImageProvider, ImageFormat, ApiKeys } from './types.js';
import { Config, ConfigSchema } from './config.js';
import { loadConfig } from '@tscodex/mcp-sdk';

/**
 * Load API keys from SDK secrets storage
 * 
 * API keys are stored as secrets (SECRET_* ENV variables) and are automatically
 * extracted by SDK. This function loads them from SDK's secrets storage.
 * 
 * Note: Map allows getting values only by key using get(key). We iterate through
 * the map to extract only the keys we need.
 * 
 * In handlers, use context.secrets.get('SECRET_PEXELS_API_KEY') instead.
 * 
 * @param secrets - Secrets Map from SDK (from server.getSecrets() or context.secrets)
 */
export function loadApiKeysFromSecrets(secrets: ReadonlyMap<string, string>): ApiKeys {
  // Map.get() returns value or undefined, so we can safely use || undefined
  // to ensure consistent return type
  return {
    pexelsApiKey: secrets.get('SECRET_PEXELS_API_KEY'),
    pixabayApiKey: secrets.get('SECRET_PIXABAY_API_KEY'),
    openaiApiKey: secrets.get('SECRET_OPENAI_API_KEY'),
    openaiOrganizationId: secrets.get('SECRET_OPENAI_ORGANIZATION_ID'),
  };
}

/**
 * Load API keys from environment variables (fallback for cases before SDK initialization)
 * 
 * @deprecated Use loadApiKeysFromSecrets() after server initialization instead
 */
export function loadApiKeys(): ApiKeys {
  // Fallback: load from ENV directly (only works before SDK extracts secrets)
  return {
    pexelsApiKey: process.env.SECRET_PEXELS_API_KEY || undefined,
    pixabayApiKey: process.env.SECRET_PIXABAY_API_KEY || undefined,
    openaiApiKey: process.env.SECRET_OPENAI_API_KEY || undefined,
    openaiOrganizationId: process.env.SECRET_OPENAI_ORGANIZATION_ID || undefined,
  };
}

/**
 * Load configuration for SDK
 * This function is called by SDK's loadConfig option AFTER SDK has already loaded
 * config from file, CLI args, and ENV vars.
 * 
 * SDK automatically handles (before calling this function):
 * - Config file loading (from configFile option in server options)
 * - CLI arguments parsing (--key value format)
 * - Environment variables (converts ENV_VAR_NAME to camelCase)
 * - Merging with priority: Extension > CLI > ENV > File > Defaults
 * 
 * This function receives already parsed config and can transform/validate it further.
 * Extension config (MCP_CONFIG) is merged automatically by SDK with highest priority.
 */
export async function loadConfigForSDK(parsedConfig: Partial<Config>): Promise<Config> {
  // SDK already loaded config from file/CLI/ENV and passed it here
  // We just need to ensure it matches our schema and apply defaults
  // Use Value.Cast to safely transform and apply defaults
  const { Value } = await import('@sinclair/typebox/value');
  const config = Value.Cast(ConfigSchema, parsedConfig) as Config;
  
  return config;
}

