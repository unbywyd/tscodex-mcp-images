import { ImageProvider, ApiKeys, UniversalPhoto, UniversalSearchResponse, SearchOptions, ImageProviderInterface } from '../types.js';
import { Config } from '../config.js';
import { PexelsProvider } from './pexels.js';
import { PixabayProvider } from './pixabay.js';
import { OpenAIProvider } from './openai.js';
import { sanitizeErrorForResponse } from '../utils.js';
import { logger } from '../logger.js';

/**
 * Provider manager with automatic fallback
 */
export class ProviderManager {
  private providers: Map<ImageProvider, ImageProviderInterface>;
  private defaultProvider: ImageProvider;
  private apiKeys: ApiKeys; // API keys stored separately and not updated

  constructor(config: Config, apiKeys: ApiKeys) {
    this.providers = new Map();
    this.defaultProvider = config.defaultProvider as ImageProvider;
    this.apiKeys = apiKeys; // Store keys separately

    // Initialize available providers
    if (apiKeys.pexelsApiKey) {
      this.providers.set(ImageProvider.PEXELS, new PexelsProvider(apiKeys.pexelsApiKey));
    }
    if (apiKeys.pixabayApiKey) {
      this.providers.set(ImageProvider.PIXABAY, new PixabayProvider(apiKeys.pixabayApiKey));
    }
    if (apiKeys.openaiApiKey) {
      this.providers.set(ImageProvider.OPENAI, new OpenAIProvider(apiKeys.openaiApiKey, apiKeys.openaiOrganizationId));
    }
  }

  /**
   * Validate all provider API keys and return status
   */
  async validateProviders(): Promise<{
    pexels: { configured: boolean; valid: boolean; error?: string };
    pixabay: { configured: boolean; valid: boolean; error?: string };
    openai: { configured: boolean; valid: boolean; error?: string };
  }> {
    const pexelsProvider = this.providers.get(ImageProvider.PEXELS);
    const pixabayProvider = this.providers.get(ImageProvider.PIXABAY);
    const openaiProvider = this.providers.get(ImageProvider.OPENAI);

    const pexelsStatus = pexelsProvider 
      ? await (pexelsProvider as any).validateApiKey()
      : { valid: false, error: 'Not configured' };

    const pixabayStatus = pixabayProvider
      ? await (pixabayProvider as any).validateApiKey()
      : { valid: false, error: 'Not configured' };

    const openaiStatus = openaiProvider
      ? await (openaiProvider as any).validateApiKey()
      : { valid: false, error: 'Not configured' };

    return {
      pexels: {
        configured: !!pexelsProvider,
        valid: pexelsStatus.valid,
        error: pexelsStatus.error,
      },
      pixabay: {
        configured: !!pixabayProvider,
        valid: pixabayStatus.valid,
        error: pixabayStatus.error,
      },
      openai: {
        configured: !!openaiProvider,
        valid: openaiStatus.valid,
        error: openaiStatus.error,
      },
    };
  }

  /**
   * Update configuration (for dynamic settings changes)
   * API keys are not updated - they remain unchanged after initialization
   */
  updateConfig(newConfig: Config): void {
    this.defaultProvider = newConfig.defaultProvider as ImageProvider;
    // API keys are not updated - they are stored separately and not accessible via MCP
  }

  /**
   * Get provider by request (for search - excludes OpenAI)
   */
  private getProviderInstance(requestedProvider: ImageProvider): ImageProviderInterface | null {
    let provider: ImageProvider = requestedProvider;

    // Determine provider
    if (provider === ImageProvider.AUTO) {
      provider = this.defaultProvider === ImageProvider.AUTO
        ? ImageProvider.PEXELS  // Default start with Pexels
        : this.defaultProvider;
    }

    // OpenAI is not used for search - only for generation
    // If OpenAI is requested for search, this is an error
    if (provider === ImageProvider.OPENAI) {
      return null; // OpenAI is not available for search
    }

    const providerInstance = this.providers.get(provider);
    if (!providerInstance || !providerInstance.isAvailable()) {
      return null;
    }

    return providerInstance;
  }

  /**
   * Get OpenAI provider (for generation only)
   */
  getOpenAIProvider(): ImageProviderInterface | null {
    return this.providers.get(ImageProvider.OPENAI) || null;
  }

  /**
   * Get fallback provider
   */
  private getFallbackProvider(currentProvider: ImageProvider): ImageProviderInterface | null {
    // OpenAI doesn't support fallback, as it's generation, not search
    if (currentProvider === ImageProvider.OPENAI) {
      return null;
    }

    const fallbackProvider = currentProvider === ImageProvider.PEXELS
      ? ImageProvider.PIXABAY
      : ImageProvider.PEXELS;

    const fallbackInstance = this.providers.get(fallbackProvider);
    if (fallbackInstance && fallbackInstance.isAvailable()) {
      return fallbackInstance;
    }

    return null;
  }

  /**
   * Search with automatic fallback
   */
  async searchWithFallback(
    query: string,
    options: SearchOptions = {},
    requestedProvider: ImageProvider = ImageProvider.AUTO
  ): Promise<UniversalSearchResponse> {
    let provider = requestedProvider === ImageProvider.AUTO
      ? this.defaultProvider === ImageProvider.AUTO
        ? ImageProvider.PEXELS
        : this.defaultProvider
      : requestedProvider;

    let fallbackUsed = false;
    let lastError: Error | null = null;

    // Try search through primary provider
    const primaryInstance = this.getProviderInstance(provider);
    if (!primaryInstance) {
      // If primary provider is unavailable, try fallback
      const fallbackInstance = this.getFallbackProvider(provider);
      if (fallbackInstance) {
        provider = fallbackInstance.name as ImageProvider.PEXELS | ImageProvider.PIXABAY;
        fallbackUsed = true;
      } else {
        throw new Error(`No available providers. Requested: ${requestedProvider}`);
      }
      } else {
        try {
          logger.info(`[ProviderManager] Calling ${provider} search API`);
          const result = await primaryInstance.search(query, options);
          logger.info(`[ProviderManager] ${provider} search completed, found ${result.photos.length} photos`);
          return { ...result, fallbackUsed: false };
        } catch (error) {
          logger.debug(`[ProviderManager] ${provider} search failed`, { error: sanitizeErrorForResponse(error) });
          lastError = error as Error;
          fallbackUsed = true;

          // Fallback to another provider:
          // - Always, if "auto" was requested or defaultProvider is "auto"
          // - Also, if primary provider is unavailable (no API key or initialization error)
          // - BUT: OpenAI doesn't support fallback, as it's generation, not search
          if (provider === ImageProvider.OPENAI) {
            // For OpenAI don't do fallback, just throw error
            throw lastError;
          }
          
          const fallbackInstance = this.getFallbackProvider(provider);
          if (fallbackInstance && (requestedProvider === ImageProvider.AUTO || this.defaultProvider === ImageProvider.AUTO)) {
            try {
              const result = await fallbackInstance.search(query, options);
              return { ...result, provider: fallbackInstance.name, fallbackUsed: true };
            } catch (fallbackError) {
              throw new Error(
                `Both providers failed. ${provider}: ${lastError?.message}, ${fallbackInstance.name}: ${(fallbackError as Error).message}`
              );
            }
          }

          // If fallback is not available or not allowed, throw error from primary provider
          throw lastError;
        }
      }

    // If we got here, it means fallback provider is used
    const fallbackInstance = this.getFallbackProvider(provider);
    if (!fallbackInstance) {
      throw new Error(`No available providers. Requested: ${requestedProvider}`);
    }

    try {
      const result = await fallbackInstance.search(query, options);
      return { ...result, provider: fallbackInstance.name, fallbackUsed: true };
    } catch (error) {
      throw new Error(`Fallback provider failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get photo with fallback (only for "auto" mode)
   */
  async getPhotoWithFallback(
    photoId: number,
    requestedProvider: ImageProvider = ImageProvider.AUTO
  ): Promise<{ photo: UniversalPhoto; provider: ImageProvider; fallbackUsed: boolean }> {
    logger.info(`[ProviderManager] getPhotoWithFallback: photoId=${photoId}, requestedProvider=${requestedProvider}`);
    let provider = requestedProvider === ImageProvider.AUTO
      ? this.defaultProvider === ImageProvider.AUTO
        ? ImageProvider.PEXELS
        : this.defaultProvider
      : requestedProvider;

    let fallbackUsed = false;
    let lastError: Error | null = null;

    logger.info(`[ProviderManager] Using provider: ${provider}`);
    // Try loading through primary provider
    const primaryInstance = this.getProviderInstance(provider);
    if (!primaryInstance) {
      // If primary provider is unavailable, try fallback
      const fallbackInstance = this.getFallbackProvider(provider);
      if (fallbackInstance) {
        provider = fallbackInstance.name as ImageProvider.PEXELS | ImageProvider.PIXABAY;
        fallbackUsed = true;
      } else {
        throw new Error(`No available providers. Requested: ${requestedProvider}`);
      }
    } else {
      try {
        logger.info(`[ProviderManager] Calling ${provider}.getPhoto(${photoId})`);
        const photo = await primaryInstance.getPhoto(photoId);
        logger.info(`[ProviderManager] Photo received: ${photo.id}, ${photo.width}x${photo.height}`);
        return { photo, provider, fallbackUsed: false };
      } catch (error) {
        lastError = error as Error;
        fallbackUsed = true;

        // Fallback to another provider (only if "auto" was requested)
        // IMPORTANT: On fallback ID may not match, so fallback works only for "auto"
        if (requestedProvider === ImageProvider.AUTO || this.defaultProvider === ImageProvider.AUTO) {
          const fallbackInstance = this.getFallbackProvider(provider);
          if (fallbackInstance) {
            // On fallback we can't use the same photoId, as IDs are provider-specific
            // So just throw error
            throw new Error(
              `Photo ID ${photoId} not found in ${provider}. Fallback to ${fallbackInstance.name} is not possible because photo IDs are provider-specific.`
            );
          }
        }

        throw lastError;
      }
    }

    // If we got here, it means fallback provider is used
    const fallbackInstance = this.getFallbackProvider(provider);
    if (!fallbackInstance) {
      throw new Error(`No available providers. Requested: ${requestedProvider}`);
    }

    try {
      const photo = await fallbackInstance.getPhoto(photoId);
      return { photo, provider: fallbackInstance.name, fallbackUsed: true };
    } catch (error) {
      throw new Error(`Fallback provider failed: ${(error as Error).message}`);
    }
  }

  /**
   * Download image
   */
  async downloadImage(
    photo: UniversalPhoto,
    size: 'original' | 'large' = 'large'
  ): Promise<Buffer> {
    logger.info(`[ProviderManager] downloadImage: photoId=${photo.id}, provider=${photo.provider}, size=${size}`);
    const providerInstance = this.providers.get(photo.provider);
    if (!providerInstance || !providerInstance.isAvailable()) {
      throw new Error(`Provider ${photo.provider} is not available`);
    }

    logger.info(`[ProviderManager] Calling ${photo.provider}.downloadImage()`);
    const buffer = await providerInstance.downloadImage(photo, size);
    logger.info(`[ProviderManager] Image downloaded: ${buffer.length} bytes`);
    return buffer;
  }

  /**
   * Get provider status information
   */
  getProviderStatus(): {
    pexels: { available: boolean; hasApiKey: boolean };
    pixabay: { available: boolean; hasApiKey: boolean };
    openai: { available: boolean; hasApiKey: boolean };
    anyAvailable: boolean;
  } {
    const pexelsInstance = this.providers.get(ImageProvider.PEXELS);
    const pixabayInstance = this.providers.get(ImageProvider.PIXABAY);
    const openaiInstance = this.providers.get(ImageProvider.OPENAI);
    
    return {
      pexels: {
        available: pexelsInstance?.isAvailable() ?? false,
        hasApiKey: !!this.apiKeys.pexelsApiKey,
      },
      pixabay: {
        available: pixabayInstance?.isAvailable() ?? false,
        hasApiKey: !!this.apiKeys.pixabayApiKey,
      },
      openai: {
        available: openaiInstance?.isAvailable() ?? false,
        hasApiKey: !!this.apiKeys.openaiApiKey,
      },
      anyAvailable: (pexelsInstance?.isAvailable() ?? false) || (pixabayInstance?.isAvailable() ?? false) || (openaiInstance?.isAvailable() ?? false),
    };
  }

  /**
   * Download image preview by URL (for optimization)
   */
  async downloadPreview(url: string): Promise<Buffer> {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to download preview: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

