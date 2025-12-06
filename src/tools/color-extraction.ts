import { McpServer } from '@tscodex/mcp-sdk';
import { Type, type Static } from '@sinclair/typebox';
import { Config } from '../config.js';
import { extractColors, generateColorPaletteImage } from '../color-extractor.js';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Get project root from context
 * Priority:
 * 1. context.projectRoot (from SDK, set via X-MCP-Project-Root header)
 * 2. config.root (fallback from configuration file)
 * 3. Error if neither is available
 */
function getProjectRoot(context: { projectRoot?: string; config: Config }): string {
  const projectRoot = context.projectRoot || context.config.root;
  if (!projectRoot) {
    throw new Error(
      'Project root is not set. Either:\n' +
      '1. The MCP client should provide project root via X-MCP-Project-Root header, or\n' +
      '2. Set "root" in .mcp-images.json configuration file.\n' +
      'If using Cursor, make sure the workspace is properly configured.'
    );
  }
  return projectRoot;
}

/**
 * Register color extraction tools
 */
export function registerColorExtractionTools(server: McpServer<Config>) {
  // image_extract_colors_local
  const ExtractColorsSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to local image file (relative to project root, e.g., "public/images/hero.jpg")' })
  });

  server.addTool({
    name: 'image_extract_colors_local',
    description: 'Extract dominant colors and color palette from a local image file. For images from providers (Pexels/Pixabay), first download them using stock_images_download_to_project, then use this tool. All paths are relative to the project root.',
    schema: ExtractColorsSchema,
    handler: async (params: Static<typeof ExtractColorsSchema>, context) => {
      const projectRoot = getProjectRoot(context);

      const fullPath = resolve(projectRoot, params.imagePath);

      // Check file existence
      const fs = await import('fs/promises');
      try {
        await fs.access(fullPath);
      } catch {
        throw new Error(`Image file not found: ${params.imagePath} (resolved to: ${fullPath})`);
      }

      // Read file
      const imageBuffer = await readFile(fullPath);

      // Extract colors
      const colors = await extractColors(imageBuffer);

      // Build response
      let responseText = `🎨 Color Extraction Results\n\n`;
      responseText += `**File:** ${params.imagePath}\n\n`;
      
      responseText += `**Dominant Color:**\n`;
      responseText += `   • HEX: ${colors.dominant.hex}\n`;
      responseText += `   • RGB: ${colors.dominant.rgb}\n\n`;

      responseText += `**Color Palette:**\n`;
      if (colors.palette.vibrant) {
        responseText += `   • Vibrant: ${colors.palette.vibrant.hex} (${colors.palette.vibrant.rgb})\n`;
      }
      if (colors.palette.muted) {
        responseText += `   • Muted: ${colors.palette.muted.hex} (${colors.palette.muted.rgb})\n`;
      }
      if (colors.palette.darkVibrant) {
        responseText += `   • Dark Vibrant: ${colors.palette.darkVibrant.hex} (${colors.palette.darkVibrant.rgb})\n`;
      }
      if (colors.palette.lightVibrant) {
        responseText += `   • Light Vibrant: ${colors.palette.lightVibrant.hex} (${colors.palette.lightVibrant.rgb})\n`;
      }
      if (colors.palette.darkMuted) {
        responseText += `   • Dark Muted: ${colors.palette.darkMuted.hex} (${colors.palette.darkMuted.rgb})\n`;
      }
      if (colors.palette.lightMuted) {
        responseText += `   • Light Muted: ${colors.palette.lightMuted.hex} (${colors.palette.lightMuted.rgb})\n`;
      }

      responseText += `\n💡 Use \`generate_color_palette_image\` tool to create a visual palette image\n`;

      // Generate palette image and include it in response
      try {
        const paletteImageBuffer = await generateColorPaletteImage(colors);
        const paletteBase64 = paletteImageBuffer.toString('base64');

        const content: Array<{ type: 'text' | 'image'; text?: string; mimeType?: string; data?: string }> = [
          { type: 'text', text: responseText },
          {
            type: 'image',
            mimeType: 'image/png',
            data: paletteBase64,
          }
        ];

        return { content };
      } catch (error) {
        // If palette generation failed, just return text
        return {
          content: [{ type: 'text', text: responseText }]
        };
      }
    }
  });

  // generate_color_palette_image
  const GeneratePaletteSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to local image file (relative to project root)' }),
    outputPath: Type.String({ description: 'Output path for palette image (relative to project root, e.g., "public/images/palette.png")' })
  });

  server.addTool({
    name: 'generate_color_palette_image',
    description: 'Generate visual color palette image from local image file. Creates a PNG image showing all extracted colors with HEX codes. All paths are relative to the project root.',
    schema: GeneratePaletteSchema,
    handler: async (params: Static<typeof GeneratePaletteSchema>, context) => {
      const projectRoot = getProjectRoot(context);

      const fullImagePath = resolve(projectRoot, params.imagePath);
      const fullOutputPath = resolve(projectRoot, params.outputPath);

      // Check file existence
      const fs = await import('fs/promises');
      try {
        await fs.access(fullImagePath);
      } catch {
        throw new Error(`Image file not found: ${params.imagePath} (resolved to: ${fullImagePath})`);
      }

      // Read file
      const imageBuffer = await readFile(fullImagePath);

      // Extract colors
      const colors = await extractColors(imageBuffer);

      // Generate palette image
      const paletteImageBuffer = await generateColorPaletteImage(colors);

      // Create directory if needed
      const path = await import('path');
      const fileDir = path.dirname(fullOutputPath);
      await fs.mkdir(fileDir, { recursive: true });

      // Save palette image
      await writeFile(fullOutputPath, paletteImageBuffer);

      let responseText = `✅ Color Palette Image Generated\n\n`;
      responseText += `**Source:** ${params.imagePath}\n`;
      responseText += `**Output:** ${params.outputPath}\n\n`;
      responseText += `**Extracted Colors:**\n`;
      responseText += `   • Dominant: ${colors.dominant.hex}\n`;
      for (const color of colors.allColors) {
        responseText += `   • ${color.name}: ${color.hex}\n`;
      }

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });
}

