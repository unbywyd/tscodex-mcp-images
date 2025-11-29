import fetch from 'node-fetch';
import { EImageProvider, UniversalPhoto, UniversalSearchResponse, SearchOptions, PixabayPhoto, PixabaySearchResponse, ImageProviderInterface } from '../types.js';
import { sanitizeError } from '../utils.js';

/**
 * Pixabay Provider - implementation of interface for Pixabay API
 */
export class PixabayProvider implements ImageProviderInterface {
  name = EImageProvider.PIXABAY;
  private apiKey: string;
  private baseUrl = 'https://pixabay.com/api';

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
      // Make a simple test request - search for "test" with minimum required results (3)
      const params = new URLSearchParams({
        key: this.apiKey,
        q: 'test',
        per_page: '3',
        page: '1',
        image_type: 'photo',
      });

      const url = `${this.baseUrl}/?${params.toString()}`;
      const response = await fetch(url);

      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: 'Invalid API key' };
      }

      if (!response.ok) {
        const errorText = await response.text();
        const sanitizedError = sanitizeError(errorText, 100);
        return { valid: false, error: `API error (${response.status}): ${sanitizedError}` };
      }

      const data = await response.json() as PixabaySearchResponse;
      
      // Check if we got an error in the response
      if (data.totalHits === 0 && data.hits.length === 0) {
        // This might be OK - just means no results, but API key is valid
        return { valid: true };
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
   * Normalize Pixabay photo to universal format
   */
  private normalizePhoto(photo: PixabayPhoto): UniversalPhoto {
    // Build photographer profile URL
    const photographerUrl = `https://pixabay.com/users/${photo.user}-${photo.user_id}/`;
    
    // Determine image sizes
    // Pixabay uses different URLs for different sizes
    const original = photo.imageURL || photo.largeImageURL;
    const large = photo.largeImageURL || photo.fullHDURL || photo.webformatURL;
    const medium = photo.webformatURL.replace('_640', '_960') || photo.webformatURL;
    const small = photo.webformatURL;
    const tiny = photo.previewURL;

    return {
      id: photo.id,
      provider: EImageProvider.PIXABAY,
      photographer: photo.user,
      photographerUrl,
      url: photo.pageURL,
      src: {
        original: original,
        large: large,
        medium: medium,
        small: small,
        tiny: tiny,
      },
      width: photo.imageWidth,
      height: photo.imageHeight,
      alt: photo.tags,
      tags: photo.tags,
    };
  }

  /**
   * Search for images
   */
  async search(query: string, options: SearchOptions = {}): Promise<UniversalSearchResponse> {
    if (!this.isAvailable()) {
      throw new Error('Pixabay API key is not configured');
    }

    // Pixabay API requires minimum 3 for per_page (official documentation)
    // Normalize value: if less than 3, increase to 3
    const normalizedPerPage = Math.max(3, Math.min(options.perPage || 3, 200));

    const params = new URLSearchParams({
      key: this.apiKey,
      q: query,
      per_page: String(normalizedPerPage), // Pixabay: minimum 3, maximum 200
      page: '1', // Always use first page, pagination not needed for MCP tool
      image_type: 'photo', // Photos only
    });

    // Normalize orientation
    if (options.orientation) {
      if (options.orientation === 'landscape') {
        params.append('orientation', 'horizontal');
      } else if (options.orientation === 'portrait') {
        params.append('orientation', 'vertical');
      }
      // square is ignored for Pixabay
    }

    const url = `${this.baseUrl}/?${params.toString()}`;
    
    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        const sanitizedError = sanitizeError(errorText);
        throw new Error(`Pixabay API error (${response.status}): ${sanitizedError}`);
      }

      const data: PixabaySearchResponse = await response.json() as PixabaySearchResponse;

      return {
        photos: data.hits.map(photo => this.normalizePhoto(photo)),
        provider: EImageProvider.PIXABAY,
        fallbackUsed: false,
        page: 1, // Always first page
        perPage: normalizedPerPage, // Use normalized value
        totalResults: data.totalHits,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Pixabay search failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get photo details by ID
   */
  async getPhoto(photoId: number): Promise<UniversalPhoto> {
    if (!this.isAvailable()) {
      throw new Error('Pixabay API key is not configured');
    }

    // Pixabay doesn't have a direct endpoint to get photo by ID
    // Use search with ID in parameters
    const params = new URLSearchParams({
      key: this.apiKey,
      id: String(photoId),
    });

    const url = `${this.baseUrl}/?${params.toString()}`;
    
    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        const sanitizedError = sanitizeError(errorText);
        throw new Error(`Pixabay API error (${response.status}): ${sanitizedError}`);
      }

      const data: PixabaySearchResponse = await response.json() as PixabaySearchResponse;

      if (!data.hits || data.hits.length === 0) {
        throw new Error(`Photo with ID ${photoId} not found in Pixabay`);
      }

      return this.normalizePhoto(data.hits[0]);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Pixabay getPhoto failed: ${error.message}`);
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
        throw new Error(`Pixabay downloadImage failed: ${error.message}`);
      }
      throw error;
    }
  }
}

