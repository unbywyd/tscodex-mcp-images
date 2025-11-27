import { Server as HttpServer, IncomingMessage, ServerResponse } from 'http';

/**
 * Creates a simple HTTP transport for MCP Server (like old version)
 * This implements JSON-RPC 2.0 over HTTP POST
 */
export function createHttpTransport(path: string, server: HttpServer) {
  // Store the current response object for sending replies
  let currentResponse: ServerResponse | null = null;
  let responseTimeout: NodeJS.Timeout | null = null;
  
  // Helper function to parse JSON body
  async function parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const maxSize = 50 * 1024 * 1024; // 50MB limit
      let totalSize = 0;
      
      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          reject(new Error('Request body too large'));
          return;
        }
        chunks.push(chunk);
      });
      
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });
      
      req.on('error', reject);
    });
  }
  
  // Helper function to send JSON response
  function sendJson(res: ServerResponse, statusCode: number, data: any) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }
  
  // Create the transport object that MCP Server expects
  const transport = {
    // Callback functions
    onmessage: undefined as ((message: any) => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    
    // Start the transport and setup HTTP endpoint
    async start() {
      server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
        // Only handle POST requests to the specified path
        if (req.method !== 'POST' || req.url !== path) {
          res.statusCode = 404;
          res.end();
          return;
        }
        
        try {
          // Parse request body
          const body = await parseBody(req);
          
          // Log incoming request for debugging
          const method = body.method || 'unknown';
          console.log(`[DEBUG] HTTP Transport: received ${method}`);
          
          // Check if this is a notification
          const hasId = body.hasOwnProperty('id') && body.id !== null && body.id !== undefined;
          const isNotification = !hasId || (typeof method === 'string' && method.startsWith('notifications/'));
          
          // For notifications, send immediate empty response
          if (isNotification) {
            // Process the notification asynchronously
            if (this.onmessage) {
              this.onmessage(body);
            }
            
            // Send immediate empty response for notifications
            res.statusCode = 204;
            res.end();
            return;
          }
          
          // For regular requests, store the response object
          currentResponse = res;
          
          // Set a timeout to prevent hanging connections
          const timeoutMs = 60000; // 60 seconds
          
          responseTimeout = setTimeout(() => {
            console.log(`[WARN] HTTP Transport: timeout for ${method}`);
            if (currentResponse) {
              sendJson(currentResponse, 500, {
                jsonrpc: '2.0',
                error: {
                  code: -32603,
                  message: 'Request timeout',
                  data: `Method ${method} did not respond within 60 seconds`
                },
                id: body.id || null
              });
              currentResponse = null;
            }
          }, timeoutMs);
          
          // Pass the message to the MCP server
          if (this.onmessage) {
            this.onmessage(body);
          }
        } catch (error) {
          console.error('[ERROR] HTTP Transport: Error handling request', error);
          sendJson(res, 500, {
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : String(error)
            },
            id: null
          });
        }
      });
    },
    
    // Send a message (used to send responses)
    async send(message: any): Promise<void> {
      console.log(`[DEBUG] HTTP Transport: sending response`);
      
      // Clear timeout if set
      if (responseTimeout) {
        clearTimeout(responseTimeout);
        responseTimeout = null;
      }
      
      // Send the response if we have a response object
      if (currentResponse) {
        sendJson(currentResponse, 200, message);
        currentResponse = null;
      }
      
      return Promise.resolve();
    },
    
    // Close the transport
    async close(): Promise<void> {
      console.log('[DEBUG] HTTP Transport: closing');
      
      // Clear any pending timeout
      if (responseTimeout) {
        clearTimeout(responseTimeout);
        responseTimeout = null;
      }
      
      // Clear response object
      currentResponse = null;
      
      if (this.onclose) {
        this.onclose();
      }
      return Promise.resolve();
    }
  };
  
  return transport;
}
