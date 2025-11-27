import { McpServer } from '@tscodex/mcp-sdk';
import { Type, type Static } from '@sinclair/typebox';
import { Config } from '../config.js';
import { ProviderManager } from '../providers/manager.js';
import { processAndSaveImage, imageToBase64 } from '../image-processor.js';
import { findProjectRoot } from '../image-processor.js';

/**
 * Register AI generation tools
 */
export function registerAIGenerationTools(
  server: McpServer<Config>,
  getProviderManager: () => ProviderManager
) {
  // ai_generate_image
  const GenerateImageSchema = Type.Object({
    prompt: Type.String({ description: 'Image generation prompt (e.g., "a cozy coffee shop interior with warm lighting, modern design")' }),
    size: Type.Optional(Type.Union([
      Type.Literal('small'),
      Type.Literal('medium'),
      Type.Literal('large')
    ], { default: 'large', description: 'Generation size: small=256x256px, medium=512x512px, large=1024x1024px. Image will be generated at this exact size.' })),
    targetPath: Type.Optional(Type.String({ description: 'Optional: Target path relative to project root to save the generated image (e.g., "public/images/generated.webp"). If provided, the image will be automatically downloaded and saved. If not provided, only the image URL will be returned.' })),
    format: Type.Optional(Type.Union([
      Type.Literal('webp'),
      Type.Literal('jpeg'),
      Type.Literal('jpg'),
      Type.Literal('png'),
      Type.Literal('avif')
    ], { description: 'Output format when targetPath is provided. If not specified, determined from targetPath extension or defaults to webp' })),
    quality: Type.Optional(Type.Number({ minimum: 1, maximum: 100, description: 'Image quality (1-100) when targetPath is provided. Default: 80' }))
  });

  server.addTool({
    name: 'ai_generate_image',
    description: 'Generate image using OpenAI DALL-E AI. IMPORTANT: This is a PAID service - each generation costs money. Image is generated at exact requested size (no resizing needed). Requires OpenAI API key to be configured. If targetPath is provided, the image will be automatically downloaded and saved to the project. IMPORTANT: Before using this tool, verify the current project root is correct (check config://current resource or get_config prompt). All paths are resolved relative to the project root.',
    schema: GenerateImageSchema,
    handler: async (params: Static<typeof GenerateImageSchema>, context) => {
      const config = context.config;
      const projectRoot = context.projectRoot || (await findProjectRoot(config.root || '.')).root;
      const providerManager = getProviderManager();

      // Check OpenAI availability
      const status = providerManager.getProviderStatus();
      if (!status.openai.hasApiKey) {
        throw new Error(
          'OpenAI API key is not configured. AI image generation requires OpenAI API key.\n\n' +
          'Use `images_provider_status` tool to check provider status.\n\n' +
          'To configure:\n' +
          '1. Get API key from https://platform.openai.com/api-keys\n' +
          '2. Run: npx @tscodex/mcp-images --openai-api-key YOUR_KEY [--openai-org-id ORG_ID]\n' +
          '   Or set: export OPENAI_API_KEY=YOUR_KEY\n' +
          '   Optional: export OPENAI_ORGANIZATION_ID=ORG_ID\n\n' +
          '⚠️ IMPORTANT: This is a PAID service - each generation costs money!'
        );
      }

      // Get OpenAI provider
      const openaiProvider = providerManager.getOpenAIProvider();
      if (!openaiProvider || !openaiProvider.isAvailable()) {
        throw new Error('OpenAI provider is not available. Please check your API key configuration.');
      }

      // Map size to SearchOptions format
      const sizeMap: Record<'small' | 'medium' | 'large', 'small' | 'medium' | 'large'> = {
        small: 'small',
        medium: 'medium',
        large: 'large',
      };

      // Generate image
      const searchResult = await openaiProvider.search(params.prompt, {
        size: sizeMap[params.size || 'large'],
      });

      if (searchResult.photos.length === 0) {
        throw new Error('Failed to generate image');
      }

      const photo = searchResult.photos[0];

      // Build response
      const content: Array<{ type: 'text' | 'image'; text?: string; mimeType?: string; data?: string }> = [];

      // If targetPath is provided, download and save the image
      if (params.targetPath) {
        try {
          // Download image
          const imageBuffer = await providerManager.downloadImage(photo, 'original');

          // Process and save
          const result = await processAndSaveImage(imageBuffer, params.targetPath, config, photo, {
            format: params.format === 'jpg' ? 'jpeg' : params.format,
            quality: params.quality,
          });

          content.push({
            type: 'text',
            text: `✅ Generated and saved image via OpenAI DALL-E\n\n` +
                  `📁 Saved to: ${params.targetPath}\n` +
                  `📐 Size: ${result.width}x${result.height}px\n` +
                  `🎨 Format: ${result.format.toUpperCase()}\n` +
                  `\n⚠️ Note: This generation was charged to your OpenAI account.`,
          });

          // Download preview for display
          try {
            const previewBuffer = await providerManager.downloadPreview(photo.src.original);
            const imageBase64 = await imageToBase64(previewBuffer, 'image/jpeg');

            const metadataText = [
              `**ID:** ${photo.id}`,
              `**Provider:** OpenAI DALL-E`,
              `**Size:** ${result.width}x${result.height}px`,
              `**Format:** ${result.format.toUpperCase()}`,
              `**Prompt:** ${params.prompt}`,
              `**Saved:** ${params.targetPath}`
            ].join(' | ');

            content.push({
              type: 'image',
              mimeType: 'image/jpeg',
              data: imageBase64,
            });

            content.push({
              type: 'text',
              text: metadataText,
            });
          } catch (previewError) {
            // Preview download failed, but image was saved, so just show text
          }
        } catch (saveError) {
          // If save failed, still show the generated image URL
          content.push({
            type: 'text',
            text: `🎨 Generated image via OpenAI DALL-E\nSize: ${photo.width}x${photo.height}px\n\n` +
                  `⚠️ Failed to save image: ${saveError instanceof Error ? saveError.message : String(saveError)}\n` +
                  `⚠️ Note: This generation was charged to your OpenAI account.\n` +
                  `\nImage URL: ${photo.url}`,
          });
        }
      } else {
        // No targetPath - just show the generated image
        content.push({
          type: 'text',
          text: `🎨 Generated image via OpenAI DALL-E\nSize: ${photo.width}x${photo.height}px\n\n⚠️ Note: This generation was charged to your OpenAI account.\n\n💡 Tip: To save the image to your project, use the \`targetPath\` parameter or call \`stock_images_download_to_project\` with the photo ID.`,
        });

        // Download and display generated image
        try {
          const imageBuffer = await providerManager.downloadPreview(photo.src.original);
          const imageBase64 = await imageToBase64(imageBuffer, 'image/jpeg');

          const metadataText = [
            `**ID:** ${photo.id}`,
            `**Provider:** OpenAI DALL-E`,
            `**Size:** ${photo.width}x${photo.height}px`,
            `**Prompt:** ${params.prompt}`,
            `**Source:** ${photo.url}`
          ].join(' | ');

          content.push({
            type: 'image',
            mimeType: 'image/jpeg',
            data: imageBase64,
          });

          content.push({
            type: 'text',
            text: metadataText,
          });
        } catch (error) {
          // If download failed, just show metadata
          const metadataText = [
            `**ID:** ${photo.id}`,
            `**Provider:** OpenAI DALL-E`,
            `**Size:** ${photo.width}x${photo.height}px`,
            `**Prompt:** ${params.prompt}`,
            `**Source:** ${photo.url}`
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
}

