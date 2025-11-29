import { EImageProvider, UniversalPhoto, UniversalSearchResponse, SearchOptions } from '../types.js';

/**
 * Base interface for image providers
 */
export interface ImageProviderInterface {
  name: EImageProvider;
  
  /**
   * Search for images
   */
  search(query: string, options: SearchOptions): Promise<UniversalSearchResponse>;
  
  /**
   * Get photo details by ID
   */
  getPhoto(photoId: number): Promise<UniversalPhoto>;
  
  /**
   * Download image
   */
  downloadImage(photo: UniversalPhoto, size: 'original' | 'large'): Promise<Buffer>;
  
  /**
   * Check availability (API key presence)
   */
  isAvailable(): boolean;
}

