// Provider enum
export enum EImageProvider {
  PEXELS = 'pexels',
  PIXABAY = 'pixabay',
  OPENAI = 'openai',
  AUTO = 'auto'
}
export type ImageProvider = 'pexels' | 'pixabay' | 'openai' | 'auto';

// Universal photo interface (normalized)
export interface UniversalPhoto {
  id: number;
  provider: EImageProvider;  // Source provider
  photographer: string;     // Photographer/user name
  photographerUrl?: string; // Photographer profile URL (optional for Pixabay)
  url: string;              // Photo page URL
  src: {
    original: string;       // Original image (high quality)
    large: string;          // Large size (up to 2048px)
    medium: string;         // Medium size (up to 900px)
    small: string;          // Small size (up to 350px)
    tiny: string;           // Thumbnail (up to 280px)
  };
  width: number;
  height: number;
  alt?: string;             // Alternative text
  tags?: string;            // Tags (optional)
}

// Universal search response format
export interface UniversalSearchResponse {
  photos: UniversalPhoto[];
  provider: EImageProvider;  // Used provider
  fallbackUsed: boolean;    // Whether fallback was used
  page: number;
  perPage: number;
  totalResults: number;
}

// Pexels-specific types
export interface PexelsPhoto {
  id: number;
  photographer: string;
  photographer_url: string;
  url: string;
  src: {
    original: string;
    large: string;
    medium: string;
    small: string;
    tiny: string;
  };
  width: number;
  height: number;
  alt?: string;
}

export interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  page: number;
  per_page: number;
  total_results: number;
}

// Pixabay-specific types
export interface PixabayPhoto {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  previewURL: string;
  previewWidth: number;
  previewHeight: number;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string;
  fullHDURL?: string;
  imageURL?: string;
  imageWidth: number;
  imageHeight: number;
  imageSize: number;
  views: number;
  downloads: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string;
  userImageURL: string;
}

export interface PixabaySearchResponse {
  total: number;
  totalHits: number;
  hits: PixabayPhoto[];
}

// OpenAI DALL-E-specific types
export interface OpenAIImageGenerationResponse {
  created: number;
  data: Array<{
    url: string;
    revised_prompt?: string;
  }>;
}

export type ImageFormat = 'webp' | 'jpeg' | 'png' | 'avif';

/**
 * API keys - stored separately from config, not accessible via MCP
 */
export interface ApiKeys {
  pexelsApiKey?: string;          // Pexels API key (optional, but at least one key should be present)
  pixabayApiKey?: string;          // Pixabay API key (optional, but at least one key should be present)
  openaiApiKey?: string;           // OpenAI API key (for DALL-E image generation)
  openaiOrganizationId?: string;   // OpenAI Organization ID (optional)
}

// Search options
export interface SearchOptions {
  perPage?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  size?: 'large' | 'medium' | 'small';
  // page removed - pagination is not used in MCP tool, always uses first page
}

// Provider interface
export interface ImageProviderInterface {
  name: EImageProvider;
  search(query: string, options: SearchOptions): Promise<UniversalSearchResponse>;
  getPhoto(photoId: number): Promise<UniversalPhoto>;
  downloadImage(photo: UniversalPhoto, size: 'original' | 'large'): Promise<Buffer>;
  isAvailable(): boolean;  // Check API key availability
}

