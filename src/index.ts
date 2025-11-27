#!/usr/bin/env node
import { createServer } from './server.js';
import { sanitizeErrorForResponse } from './utils.js';

/**
 * Main entry point
 * SDK automatically reads MCP_HOST and MCP_PORT from process.env
 */
async function main() {
  try {
    const { server } = await createServer();
    
    // Initialize server (loads config, sets up handlers)
    await server.initialize();
    
    // Start server (handles --meta flag internally)
    await server.start();
    
    // Log server info
    const config = server.getConfig();
    const projectRoot = server.getProjectRoot();
    
    console.log(`✅ MCP Images Server started`);
    console.log(`   Host: ${server.serverHost}`);
    console.log(`   Port: ${server.serverPort}`);
    console.log(`   Project Root: ${projectRoot || 'not set'}`);
    console.log(`   Default Provider: ${config.defaultProvider}`);
    console.log(`   Default Format: ${config.defaultFormat}`);
    
    // Graceful shutdown is handled automatically by SDK
  } catch (error) {
    // Sanitize error to prevent secrets leakage
    const sanitizedError = sanitizeErrorForResponse(error);
    console.error('Failed to start server:', sanitizedError);
    process.exit(1);
  }
}

main();

