import fetch from 'node-fetch';
import { ImageProvider, UniversalPhoto, UniversalSearchResponse, SearchOptions, PexelsPhoto, PexelsSearchResponse, ImageProviderInterface } from '../types.js';
import { sanitizeError } from '../utils.js';

/**
 * Pexels Provider - implementation of interface for Pexels API
 */
export class PexelsProvider implements ImageProviderInterface {
  name = ImageProvider.PEXELS;
  private apiKey: string;
  private baseUrl = 'https://api.pexels.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { valid: false, error: 'API key not configured' };
    }

    try {
      // Make a simple test request - search for "test" with 1 result
      const url = `${this.baseUrl}/search?query=test&per_page=1&page=1`;
      const response = await fetch(url, {
        headers: {
          'Authorization': this.apiKey,
        },
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
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }

  /**
   * Normalize Pexels photo to universal format
   */
  private normalizePhoto(photo: PexelsPhoto): UniversalPhoto {
    return {
      id: photo.id,
      provider: ImageProvider.PEXELS,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      url: photo.url,
      src: {
        original: photo.src.original,
        large: photo.src.large,
        medium: photo.src.medium,
        small: photo.src.small,
        tiny: photo.src.tiny,
      },
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
    };
  }

  /**
   * Search for images
   */
  async search(query: string, options: SearchOptions = {}): Promise<UniversalSearchResponse> {
    if (!this.isAvailable()) {
      throw new Error('Pexels API key is not configured');
    }

    const params = new URLSearchParams({
      query,
      per_page: String(options.perPage || 3),
      page: '1', // Always use first page, pagination not needed for MCP tool
    });

    if (options.orientation) {
      params.append('orientation', options.orientation);
    }
    if (options.size) {
      params.append('size', options.size);
    }

    const url = `${this.baseUrl}/search?${params.toString()}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const sanitizedError = sanitizeError(errorText);
        throw new Error(`Pexels API error (${response.status}): ${sanitizedError}`);
      }

      const data: PexelsSearchResponse = await response.json() as PexelsSearchResponse;

      return {
        photos: data.photos.map(photo => this.normalizePhoto(photo)),
        provider: ImageProvider.PEXELS,
        fallbackUsed: false,
        page: 1, // Always first page
        perPage: data.per_page,
        totalResults: data.total_results,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Pexels search failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get photo details by ID
   */
  async getPhoto(photoId: number): Promise<UniversalPhoto> {
    if (!this.isAvailable()) {
      throw new Error('Pexels API key is not configured');
    }

    const url = `${this.baseUrl}/photos/${photoId}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': this.apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Photo with ID ${photoId} not found in Pexels`);
        }
        const errorText = await response.text();
        throw new Error(`Pexels API error (${response.status}): ${errorText}`);
      }

      const photo: PexelsPhoto = await response.json() as PexelsPhoto;
      return this.normalizePhoto(photo);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Pexels getPhoto failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Download image
   */
  async downloadImage(photo: UniversalPhoto, size: 'original' | 'large' = 'large'): Promise<Buffer> {
    const imageUrl = size === 'original' ? photo.src.original : photo.src.large;
    
    try {
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Pexels downloadImage failed: ${error.message}`);
      }
      throw error;
    }
  }
}

