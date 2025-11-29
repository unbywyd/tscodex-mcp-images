import { McpServer } from '@tscodex/mcp-sdk';
import { Type, type Static } from '@sinclair/typebox';
import { Config } from '../config.js';
import { ProviderManager } from '../providers/manager.js';
import { EImageProvider } from '../types.js';
import { processAndSaveImage, imageToBase64 } from '../image-processor.js';
import { findProjectRoot } from '../image-processor.js';
import { resolve } from 'path';

/**
 * Register stock image tools
 */
export function registerStockImageTools(
  server: McpServer<Config>,
  getProviderManager: () => ProviderManager
) {
  // images_provider_status
  server.addTool({
    name: 'images_provider_status',
    description: 'Check status of image providers (Pexels, Pixabay for search, OpenAI for AI generation) - shows which providers are available and configured',
    schema: Type.Object({}),
    handler: async (params, context) => {
      const providerManager = getProviderManager();
      const status = providerManager.getProviderStatus();
      
      let responseText = `📊 **Provider Status**\n\n`;
      
      // Pexels status
      responseText += `**Pexels:**\n`;
      if (status.pexels.hasApiKey) {
        responseText += `   • API Key: ✅ Configured\n`;
        responseText += `   • Status: ${status.pexels.available ? '✅ Available' : '❌ Not available'}\n`;
      } else {
        responseText += `   • API Key: ❌ Not configured\n`;
        responseText += `   • Status: ⚠️ Not available (API key required)\n`;
      }
      responseText += `\n`;
      
      // Pixabay status
      responseText += `**Pixabay:**\n`;
      if (status.pixabay.hasApiKey) {
        responseText += `   • API Key: ✅ Configured\n`;
        responseText += `   • Status: ${status.pixabay.available ? '✅ Available' : '❌ Not available'}\n`;
      } else {
        responseText += `   • API Key: ❌ Not configured\n`;
        responseText += `   • Status: ⚠️ Not available (API key required)\n`;
      }
      responseText += `\n`;
      
      // OpenAI status
      responseText += `**OpenAI (DALL-E):**\n`;
      if (status.openai.hasApiKey) {
        responseText += `   • API Key: ✅ Configured\n`;
        responseText += `   • Status: ${status.openai.available ? '✅ Available' : '❌ Not available'}\n`;
        responseText += `   • Type: Image Generation (DALL-E)\n`;
      } else {
        responseText += `   • API Key: ❌ Not configured\n`;
        responseText += `   • Status: ⚠️ Not available (API key required)\n`;
      }
      responseText += `\n`;
      
      // Overall status
      if (status.anyAvailable) {
        responseText += `✅ **At least one provider is available**\n`;
        responseText += `💡 You can use \`stock_images_search\` and \`stock_images_download_to_project\` tools.\n`;
      } else {
        responseText += `⚠️ **No providers are available**\n\n`;
        responseText += `**To enable providers:**\n\n`;
        responseText += `1. **Get API keys:**\n`;
        responseText += `   • Pexels: https://www.pexels.com/api/\n`;
        responseText += `   • Pixabay: https://pixabay.com/api/docs/\n`;
        responseText += `   • OpenAI: https://platform.openai.com/api-keys\n\n`;
        responseText += `2. **Configure API keys:**\n`;
        responseText += `   \`\`\`bash\n`;
        responseText += `   # Via CLI arguments\n`;
        responseText += `   npx @tscodex/mcp-images --pexels-api-key YOUR_KEY\n`;
        responseText += `   npx @tscodex/mcp-images --openai-api-key YOUR_KEY [--openai-org-id ORG_ID]\n`;
        responseText += `   \n`;
        responseText += `   # Via environment variables\n`;
        responseText += `   export PEXELS_API_KEY=YOUR_KEY\n`;
        responseText += `   export PIXABAY_API_KEY=YOUR_KEY\n`;
        responseText += `   export OPENAI_API_KEY=YOUR_KEY\n`;
        responseText += `   export OPENAI_ORGANIZATION_ID=ORG_ID  # Optional\n`;
        responseText += `   \`\`\`\n\n`;
        responseText += `**Note:** Image processing tools (\`image_process_local\`, \`image_extract_colors_local\`, etc.) work without providers.\n`;
      }
      
      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // stock_images_search
  const SearchImagesSchema = Type.Object({
    query: Type.String({ description: 'Search query (e.g., "cozy coffee shop interior")' }),
    provider: Type.Optional(Type.Union([
      Type.Literal('pexels'),
      Type.Literal('pixabay'),
      Type.Literal('auto')
    ], { default: 'auto', description: 'Provider to use. "auto" uses configured default provider with automatic fallback to alternative provider if primary fails. Explicit provider selection ("pexels" or "pixabay") will use that provider only. Default: "auto"' })),
    orientation: Type.Optional(Type.Union([
      Type.Literal('landscape'),
      Type.Literal('portrait'),
      Type.Literal('square')
    ], { description: 'Image orientation' })),
    size: Type.Optional(Type.Union([
      Type.Literal('large'),
      Type.Literal('medium'),
      Type.Literal('small')
    ], { description: 'Image size of search results' }))
  });

  server.addTool({
    name: 'stock_images_search',
    description: 'Search for existing images from Pexels or Pixabay. When provider is "auto" (default), uses configured default provider and automatically switches to alternative provider if primary fails. Requires at least one API key (Pexels or Pixabay) to be configured.',
    schema: SearchImagesSchema,
    handler: async (params: Static<typeof SearchImagesSchema>, context) => {
      const providerManager = getProviderManager();
      
      // Check provider availability
      const status = providerManager.getProviderStatus();
      if (!status.anyAvailable) {
        throw new Error(
          'No image providers are available. Please configure at least one API key.\n\n' +
          'Use `images_provider_status` tool to check provider status.\n\n' +
          'To configure:\n' +
          '1. Get API keys from https://www.pexels.com/api/, https://pixabay.com/api/docs/, or https://platform.openai.com/api-keys\n' +
          '2. Run: npx @tscodex/mcp-images --pexels-api-key YOUR_KEY\n' +
          '   Or set: export PEXELS_API_KEY=YOUR_KEY\n' +
          '   Or: export OPENAI_API_KEY=YOUR_KEY [OPENAI_ORGANIZATION_ID=ORG_ID]'
        );
      }

      // Determine provider
      const requestedProvider = (params.provider === 'auto' ? EImageProvider.AUTO : params.provider) as EImageProvider;

      // Fixed perPage = 1 (1 image per request)
      const perPageForRequest = 1;

      // Search with fallback
      const searchResult = await providerManager.searchWithFallback(
        params.query,
        {
          perPage: perPageForRequest,
          orientation: params.orientation,
          size: params.size,
        },
        requestedProvider
      );

      // Return only first image (1 image per request)
      const photosToReturn = searchResult.photos.slice(0, 1);

      // Build response with image previews
      const content: Array<{ type: 'text' | 'image'; text?: string; mimeType?: string; data?: string }> = [];

      // Provider information (only Pexels/Pixabay)
      const providerName = searchResult.provider === EImageProvider.PEXELS ? 'Pexels' : 'Pixabay';
      const fallbackInfo = searchResult.fallbackUsed ? ` (fallback from ${requestedProvider === EImageProvider.PEXELS ? 'Pexels' : 'Pixabay'})` : '';
      
      content.push({
        type: 'text',
        text: `🔍 Searching via ${providerName}${fallbackInfo}...\nFound 1 result`,
      });

      // Only first photo: preview + metadata
      for (const photo of photosToReturn) {
        // Build metadata in advance to use everywhere
        const photographerInfo = photo.photographerUrl
          ? `[${photo.photographer}](${photo.photographerUrl})`
          : photo.photographer;
        
        const metadataText = [
          `**ID:** ${photo.id}`,
          `**Provider:** ${providerName}`,
          `**Photographer:** ${photographerInfo}`,
          `**Source:** [View on ${providerName}](${photo.url})`
        ].join(' | ');
        
        try {
          // Use preview (small) for faster display
          const imageUrl = photo.src.small || photo.src.tiny;
          const imageBuffer = await providerManager.downloadPreview(imageUrl);
          const imageBase64 = await imageToBase64(imageBuffer, 'image/jpeg');

          // Add image with metadata
          content.push({
            type: 'image',
            mimeType: 'image/jpeg',
            data: imageBase64,
          });

          // Add metadata right after image (duplicate for visibility)
          content.push({
            type: 'text',
            text: metadataText,
          });
        } catch (error) {
          // If preview download failed, just show metadata
          const metadataText = [
            `**ID:** ${photo.id}`,
            `**Provider:** ${providerName}`,
            `**Photographer:** ${photographerInfo}`,
            `**Source:** [View on ${providerName}](${photo.url})`
          ].join(' | ');
          
          content.push({
            type: 'text',
            text: metadataText,
          });
        }
      }

      return { content };
    }
  });

  // stock_images_download_to_project
  const DownloadImageSchema = Type.Object({
    photoId: Type.Number({ description: 'Photo ID from provider' }),
    provider: Type.Optional(Type.Union([
      Type.Literal('pexels'),
      Type.Literal('pixabay'),
      Type.Literal('auto')
    ], { default: 'auto', description: 'Provider source. "auto" (default) uses configured default provider. Explicit provider selection uses that provider only.' })),
    targetPath: Type.String({ description: 'Target path relative to project root (e.g., "public/images/hero.webp")' }),
    format: Type.Optional(Type.Union([
      Type.Literal('webp'),
      Type.Literal('jpeg'),
      Type.Literal('jpg'),
      Type.Literal('png'),
      Type.Literal('avif')
    ], { description: 'Output format. If not specified, determined from targetPath extension' })),
    maxWidth: Type.Optional(Type.Number({ minimum: 100, maximum: 4000, default: 1920, description: 'Maximum width in pixels (maintains aspect ratio). RECOMMENDED: Use this with aspectRatio to resize and crop proportionally without distortion.' })),
    quality: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 80, description: 'Image quality (1-100)' })),
    aspectRatio: Type.Optional(Type.String({ pattern: '^\\d+:\\d+$', description: 'Aspect ratio in format "width:height" (e.g., "16:9", "1:1"). RECOMMENDED for cropping: Use this parameter to crop image to specific aspect ratio while maintaining proportions. Works with maxWidth to resize and crop proportionally.' })),
    width: Type.Optional(Type.Number({ minimum: 100, maximum: 4000, description: 'Exact width in pixels. IMPORTANT: Use ONLY width OR height (not both) to maintain aspect ratio. If both width and height are specified, image will be STRETCHED/SQUASHED to exact dimensions, distorting proportions. For cropping to specific aspect ratio, use aspectRatio parameter instead.' })),
    height: Type.Optional(Type.Number({ minimum: 100, maximum: 4000, description: 'Exact height in pixels. IMPORTANT: Use ONLY width OR height (not both) to maintain aspect ratio. If both width and height are specified, image will be STRETCHED/SQUASHED to exact dimensions, distorting proportions. For cropping to specific aspect ratio, use aspectRatio parameter instead.' }))
  });

  server.addTool({
    name: 'stock_images_download_to_project',
    description: 'Download and save image from provider to project with optimization. Requires at least one API key to be configured. IMPORTANT: Before using this tool, verify the current project root is correct (check config://current resource or get_config prompt). All paths are resolved relative to the project root.',
    schema: DownloadImageSchema,
    handler: async (params: Static<typeof DownloadImageSchema>, context) => {
      const config = context.config;
      const projectRoot = context.projectRoot || (await findProjectRoot(config.root || '.')).root;
      const providerManager = getProviderManager();

      // Ensure OpenAI is not used for download (only for generation)
      // Note: OpenAI is not in the provider union for download, so this check is redundant but kept for clarity

      // Check provider availability (only Pexels/Pixabay for download)
      const status = providerManager.getProviderStatus();
      if (!status.pexels.hasApiKey && !status.pixabay.hasApiKey) {
        throw new Error(
          'No image providers are available for download. Please configure at least one API key (Pexels or Pixabay).\n\n' +
          'Use `images_provider_status` tool to check provider status.\n\n' +
          'To configure:\n' +
          '1. Get API keys from https://www.pexels.com/api/ or https://pixabay.com/api/docs/\n' +
          '2. Run: npx @tscodex/mcp-images --pexels-api-key YOUR_KEY\n' +
          '   Or set: export PEXELS_API_KEY=YOUR_KEY\n' +
          '\nNote: For AI-generated images, use `ai_generate_image` tool first, then download the generated image.'
        );
      }

      // Determine provider (only Pexels/Pixabay)
      const requestedProvider = (params.provider === 'auto' ? EImageProvider.AUTO : params.provider) as EImageProvider;

      // Get photo with fallback
      const { photo, provider: usedProvider, fallbackUsed } = await providerManager.getPhotoWithFallback(
        params.photoId,
        requestedProvider
      );

      // Download original image
      const imageBuffer = await providerManager.downloadImage(photo, 'original');

      // Process and save
      const result = await processAndSaveImage(imageBuffer, params.targetPath, config, photo, {
        format: params.format,
        maxWidth: params.maxWidth,
        quality: params.quality,
        aspectRatio: params.aspectRatio,
        width: params.width,
        height: params.height,
      });
      
      // Build response (only Pexels/Pixabay)
      const providerName = usedProvider === EImageProvider.PEXELS ? 'Pexels' : 'Pixabay';
      const fallbackInfo = fallbackUsed ? ` (fallback from ${requestedProvider === EImageProvider.PEXELS ? 'Pexels' : 'Pixabay'})` : '';
      const photographerInfo = photo.photographerUrl
        ? `[${photo.photographer}](${photo.photographerUrl})`
        : photo.photographer;

      let responseText = `✅ Saved ${result.format.toUpperCase()} to ${params.targetPath}\n\n`;
      responseText += `📸 Photo info:\n`;
      responseText += `   • ID: ${photo.id}\n`;
      responseText += `   • Provider: ${providerName}${fallbackInfo}\n`;
      responseText += `   • Photographer: ${photographerInfo}\n`;
      responseText += `   • Source: ${photo.url}\n`;
      responseText += `   • Format: ${result.format.toUpperCase()}\n`;
      responseText += `   • Quality: ${params.quality || config.defaultQuality}%\n`;
      if (params.width && params.height) {
        responseText += `   • Dimensions: ${params.width}x${params.height}px (exact)\n`;
      } else if (params.width) {
        responseText += `   • Width: ${params.width}px\n`;
      } else if (params.height) {
        responseText += `   • Height: ${params.height}px\n`;
      } else if (params.aspectRatio) {
        responseText += `   • Aspect Ratio: ${params.aspectRatio}\n`;
      }
      if (params.maxWidth && !params.width) {
        responseText += `   • Max Width: ${params.maxWidth}px\n`;
      }
      responseText += `   • Dimensions: ${result.width}x${result.height}px\n\n`;
      responseText += `📄 Files created:\n`;
      responseText += `   • ${params.targetPath}\n`;
      if (config.saveMetadata) {
        responseText += `   • ${params.targetPath}.json (metadata)\n`;
      }
      if (config.embedExif) {
        responseText += `   • EXIF metadata embedded in image\n`;
      }
      responseText += `\n💡 Photo by ${photo.photographer} on ${providerName}\n`;
      responseText += `   Attribution is optional but appreciated`;

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });
}

