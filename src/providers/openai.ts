import fetch from 'node-fetch';
import { EImageProvider, UniversalPhoto, UniversalSearchResponse, SearchOptions, OpenAIImageGenerationResponse, ImageProviderInterface } from '../types.js';
import { sanitizeError } from '../utils.js';

/**
 * OpenAI Provider - implementation of interface for OpenAI DALL-E API
 */
export class OpenAIProvider implements ImageProviderInterface {
  name = EImageProvider.OPENAI;
  private apiKey: string;
  private organizationId?: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor(apiKey: string, organizationId?: string) {
    this.apiKey = apiKey;
    this.organizationId = organizationId;
  }

  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Validate API key by making a test request to /models endpoint
   * This is FREE and doesn't generate images or cost money
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { valid: false, error: 'API key not configured' };
    }

    try {
      // Use /models endpoint - it's FREE and doesn't generate images
      // This endpoint just lists available models and validates the API key
      const url = `${this.baseUrl}/models`;
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
      };

      if (this.organizationId) {
        headers['OpenAI-Organization'] = this.organizationId;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: 'Invalid API key' };
      }

      if (!response.ok) {
        const errorText = await response.text();
        const sanitizedError = sanitizeError(errorText, 100);
        return { valid: false, error: `API error (${response.status}): ${sanitizedError}` };
      }

      // If we get here, the API key is valid
      // We don't need to parse the response, just check status code
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }

  /**
   * Convert size to DALL-E format
   */
  private getDallESize(options: SearchOptions): string {
    // DALL-E 2 supports only square sizes: 256x256, 512x512, 1024x1024
    // DALL-E 3 supports: 1024x1024, 1792x1024, 1024x1792
    // Use DALL-E 2 sizes for compatibility (always square)
    
    if (options.size === 'small') {
      return '256x256';
    } else if (options.size === 'medium') {
      return '512x512';
    } else {
      return '1024x1024'; // large or default
    }
  }

  /**
   * Normalize OpenAI response to universal format
   */
  private normalizePhoto(
    url: string,
    prompt: string,
    revisedPrompt?: string,
    width: number = 1024,
    height: number = 1024
  ): UniversalPhoto {
    // Generate unique ID based on URL (hash)
    const id = url.split('/').pop()?.split('.')[0] || Date.now();
    const numericId = typeof id === 'string' ? parseInt(id.replace(/\D/g, ''), 10) || Date.now() : id;

    return {
      id: numericId,
      provider: EImageProvider.OPENAI,
      photographer: 'OpenAI DALL-E',
      photographerUrl: 'https://openai.com/dall-e-2',
      url: url,
      src: {
        original: url,
        large: url,
        medium: url,
        small: url,
        tiny: url,
      },
      width,
      height,
      alt: revisedPrompt || prompt,
      tags: prompt,
    };
  }

  /**
   * Parse OpenAI error response
   */
  private parseErrorResponse(errorText: string): { message: string; type?: string; code?: string } {
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        return {
          message: errorJson.error.message || 'Unknown error',
          type: errorJson.error.type,
          code: errorJson.error.code,
        };
      }
    } catch {
      // Not JSON, return as-is
    }
    return { message: errorText };
  }

  /**
   * Check if error is retryable (temporary server error)
   */
  private isRetryableError(status: number): boolean {
    // Retry on temporary server errors
    return status === 500 || status === 502 || status === 503 || status === 504 || status === 429;
  }

  /**
   * Search/generate images (for OpenAI this is generation by prompt)
   * Includes retry logic for temporary server errors
   */
  async search(query: string, options: SearchOptions = {}): Promise<UniversalSearchResponse> {
    if (!this.isAvailable()) {
      throw new Error('OpenAI API key is not configured');
    }

    const url = `${this.baseUrl}/images/generations`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.organizationId) {
      headers['OpenAI-Organization'] = this.organizationId;
    }

    const size = this.getDallESize(options);
    const [width, height] = size.split('x').map(Number);

    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt: query,
            n: 1, // Generate one image at a time
            size: size,
            response_format: 'url',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorInfo = this.parseErrorResponse(errorText);
          const sanitizedError = sanitizeError(errorText);

          // Check if we should retry (before building error message)
          if (this.isRetryableError(response.status) && attempt < maxRetries - 1) {
            // Wait before retry (exponential backoff)
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            // Continue to next retry attempt
            continue;
          }

          // Build user-friendly error message (only if not retrying)
          let errorMessage = `OpenAI API error (${response.status})`;
          
          if (errorInfo.message) {
            errorMessage += `: ${errorInfo.message}`;
          } else {
            errorMessage += `: ${sanitizedError}`;
          }

          // Add helpful context for common errors
          if (response.status === 500 || response.status === 502 || response.status === 503) {
            errorMessage += '\n\nThis is a temporary server error on OpenAI\'s side. The request was automatically retried but failed. Please try again in a few moments.';
          } else if (response.status === 504) {
            errorMessage += '\n\nRequest timeout. The server took too long to respond. Please try again.';
          } else if (response.status === 429) {
            errorMessage += '\n\nRate limit exceeded. Please wait a moment before trying again.';
          } else if (response.status === 401 || response.status === 403) {
            errorMessage += '\n\nPlease check your API key and organization ID (if used).';
          }

          throw new Error(errorMessage);
        }

        const data: OpenAIImageGenerationResponse = await response.json() as OpenAIImageGenerationResponse;

        if (!data.data || data.data.length === 0) {
          throw new Error('No images generated by OpenAI');
        }

        const imageData = data.data[0];
        const photo = this.normalizePhoto(
          imageData.url,
          query,
          imageData.revised_prompt,
          width,
          height
        );

        return {
          photos: [photo],
          provider: EImageProvider.OPENAI,
          fallbackUsed: false,
          page: 1,
          perPage: 1,
          totalResults: 1,
        };
      } catch (error: unknown) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        lastError = errorObj;
        
        // If it's a retryable error and we have attempts left, continue retrying
        if (errorObj.message.includes('500') || errorObj.message.includes('502') || errorObj.message.includes('503') || errorObj.message.includes('504') || errorObj.message.includes('429')) {
          if (attempt < maxRetries - 1) {
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // If it's not retryable or we're out of retries, throw
        if (attempt === maxRetries - 1) {
          throw new Error(`OpenAI generation failed: ${errorObj.message}`);
        }
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('OpenAI generation failed after multiple retry attempts');
  }

  /**
   * Get photo details by ID
   * Not applicable for OpenAI, as images are generated, not stored
   */
  async getPhoto(photoId: number): Promise<UniversalPhoto> {
    throw new Error('OpenAI does not support getPhoto by ID. Images are generated on-demand, not stored.');
  }

  /**
   * Download image
   */
  async downloadImage(photo: UniversalPhoto, size: 'original' | 'large' = 'large'): Promise<Buffer> {
    const imageUrl = photo.src.original || photo.src.large;
    
    try {
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI downloadImage failed: ${error.message}`);
      }
      throw error;
    }
  }
}

