import { McpServer } from '@tscodex/mcp-sdk';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ConfigSchema, type Config } from './config.js';
import { loadConfigForSDK, loadApiKeysFromSecrets } from './config-loader.js';
import { ApiKeys } from './types.js';
import { ProviderManager } from './providers/manager.js';
import { registerImageProcessingTools } from './tools/image-processing.js';
import { registerStockImageTools } from './tools/stock-images.js';
import { registerAIGenerationTools } from './tools/ai-generation.js';
import { registerColorExtractionTools } from './tools/color-extraction.js';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Session schema - only email (required) and fullName (optional)
 * Other fields from token are ignored
 */
const SessionSchema = Type.Object({
  email: Type.String({ description: 'User email address' }),
  fullName: Type.Optional(Type.String({ description: 'User full name' }))
});

type Session = Static<typeof SessionSchema>;
type Roles = 'User';
/**
 * Create and configure MCP server
 * SDK handles --meta flag internally (disables logger, outputs JSON, exits)
 */
export async function createServer() {
  const server = new McpServer<Config, Roles, Session>({
    name: '@tscodex/mcp-images',
    version: '0.2.0',
    description: 'MCP server for image processing and stock images',
    configSchema: ConfigSchema,
    configFile: '.cursor-stock-images.json', // Default config file path
    loadConfig: loadConfigForSDK,
    
    // Authentication configuration
    auth: {
      sessionSchema: SessionSchema,
      requireSession: false, // Session is optional - tools can work without auth
      
      // Load session from token - extract only email and fullName, ignore other fields
      loadSession: async (token: string, context) => {
        try {
          // Try to parse token as JSON
          const tokenData = JSON.parse(token);
          
          // Extract only email and fullName, ignore other fields
          const session: Session = {
            email: tokenData.email
          };
          
          // Add fullName only if it exists
          if (tokenData.fullName && typeof tokenData.fullName === 'string') {
            session.fullName = tokenData.fullName;
          }
          
          // Validate that email exists
          if (!session.email || typeof session.email !== 'string') {
            throw new Error('Email is required in session token');
          }
          
          return session;
        } catch (error) {
          // If token is not JSON or parsing failed, throw error
          throw new Error(`Invalid session token: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      
      // Single role: User
      roles: {
        User: async (session, context) => {
          // User role is granted if session has email
          return !!session.email;
        }
      }
    },
    
    // SDK will disable logger automatically if --meta flag is present
    logger: {
      info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${msg}`, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
      debug: (msg: string, ...args: unknown[]) => isDev ? console.debug(`[DEBUG] ${msg}`, ...args) : undefined
    },
  });

  // Initialize provider manager lazily
  // Note: config and secrets will be available after server.initialize()
  // We'll create provider manager lazily when tools are registered
  let providerManager: ProviderManager | null = null;

  // Function to get or create provider manager
  // Gets API keys from SDK secrets storage (SECRET_* variables)
  const getProviderManager = (): ProviderManager => {
    if (!providerManager) {
      const config = server.getConfig();
      // Get secrets from SDK (extracted from SECRET_* ENV variables)
      const secrets = server.getSecrets();
      const apiKeys = loadApiKeysFromSecrets(secrets);
      providerManager = new ProviderManager(config, apiKeys);
    }
    return providerManager;
  };

  // Register tools (they will be registered before server starts)
  // Tools can access config and projectRoot via context
  registerImageProcessingTools(server, getProviderManager);
  registerStockImageTools(server, getProviderManager);
  registerAIGenerationTools(server, getProviderManager);
  registerColorExtractionTools(server);

  return { server, getProviderManager };
}

