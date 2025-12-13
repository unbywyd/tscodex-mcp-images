import { McpServer } from '@tscodex/mcp-sdk';
import { Type, type Static } from '@sinclair/typebox';
import { Config } from '../config.js';
import { ProviderManager } from '../providers/manager.js';
import {
  processLocalImage,
  analyzeImage,
  optimizeImage,
  createPlaceholderImage,
  createFavicon,
  addWatermark,
  applyFilters,
  rotateImage,
  cropImage,
  resolvePathSafe,
  normalizePath
} from '../image-processor.js';
import { readFile } from 'fs/promises';

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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
  // Normalize Unicode for Cyrillic and other non-ASCII paths
  return normalizePath(projectRoot);
}

/**
 * Register image processing tools
 */
export function registerImageProcessingTools(
  server: McpServer<Config>,
  getProviderManager: () => ProviderManager
) {
  // image_process_local
  const ProcessImageSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to local image file (relative to project root)' }),
    outputPath: Type.Optional(Type.String({ description: 'Output path (relative to project root). If not specified, overwrites original file' })),
    format: Type.Optional(Type.Union([
      Type.Literal('webp'),
      Type.Literal('jpeg'),
      Type.Literal('jpg'),
      Type.Literal('png'),
      Type.Literal('avif')
    ], { description: 'Output format. If not specified, determined from outputPath extension or keeps original format' })),
    width: Type.Optional(Type.Number({ minimum: 1, maximum: 4000, description: 'Exact width in pixels' })),
    height: Type.Optional(Type.Number({ minimum: 1, maximum: 4000, description: 'Exact height in pixels' })),
    maxWidth: Type.Optional(Type.Number({ minimum: 1, maximum: 4000, description: 'Maximum width in pixels (maintains aspect ratio)' })),
    aspectRatio: Type.Optional(Type.String({ pattern: '^\\d+:\\d+$', description: 'Aspect ratio in format "width:height" (e.g., "16:9", "1:1")' })),
    quality: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 100, description: 'Image quality (1-100). Default: 100 (no compression loss)' })),
    circle: Type.Optional(Type.Boolean({ default: false, description: 'Crop image to circle shape. Image will be cropped to square first, then masked as circle. Output format will be PNG with transparency.' }))
  });

  server.addTool({
    name: 'image_process_local',
    description: 'Process local image file: resize, crop, convert format, optimize. All paths are relative to the project root.',
    schema: ProcessImageSchema,
    handler: async (params: Static<typeof ProcessImageSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const fullInputPath = resolvePathSafe(projectRoot, params.imagePath);
      let outputFilePath = params.outputPath ? resolvePathSafe(projectRoot, params.outputPath) : fullInputPath;
      
      // If circle needed, ensure .png extension
      if (params.circle && !outputFilePath.toLowerCase().endsWith('.png')) {
        const path = await import('path');
        const pathWithoutExt = outputFilePath.replace(/\.[^/.]+$/, '');
        outputFilePath = `${pathWithoutExt}.png`;
      }

      // Check file existence
      const fs = await import('fs/promises');
      try {
        await fs.access(fullInputPath);
      } catch {
        throw new Error(`Image file not found: ${params.imagePath} (resolved to: ${fullInputPath})`);
      }

      // Read file
      const imageBuffer = await readFile(fullInputPath);

      // Process image
      const result = await processLocalImage(imageBuffer, outputFilePath, config, {
        format: params.format === 'jpg' ? 'jpeg' : params.format,
        width: params.width,
        height: params.height,
        maxWidth: params.maxWidth,
        aspectRatio: params.aspectRatio,
        quality: params.quality,
        circle: params.circle,
      });

      // Build response
      let responseText = `✅ Image Processed Successfully\n\n`;
      responseText += `**Input:** ${params.imagePath}\n`;
      responseText += `**Output:** ${params.outputPath || params.imagePath}\n\n`;
      responseText += `**Results:**\n`;
      if (params.circle) {
        responseText += `   • Shape: Circle (cropped to square, then masked)\n`;
        responseText += `   • Format: PNG (required for transparency)\n`;
      } else {
        responseText += `   • Format: ${result.format.toUpperCase()}\n`;
      }
      responseText += `   • Dimensions: ${result.width}x${result.height}px\n`;
      responseText += `   • Original Size: ${formatFileSize(result.originalSize)}\n`;
      responseText += `   • New Size: ${formatFileSize(result.newSize)}\n`;
      if (result.savedBytes > 0) {
        responseText += `   • Saved: ${formatFileSize(result.savedBytes)} (${((result.savedBytes / result.originalSize) * 100).toFixed(1)}%)\n`;
      } else if (result.savedBytes < 0) {
        responseText += `   • Increased by: ${formatFileSize(Math.abs(result.savedBytes))}\n`;
      }

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // image_analyze
  const AnalyzeImageSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to local image file (relative to project root)' })
  });

  server.addTool({
    name: 'image_analyze',
    description: 'Analyze local image: dimensions, format, file size, metadata, optimization suggestions. All paths are relative to the project root.',
    schema: AnalyzeImageSchema,
    handler: async (params: Static<typeof AnalyzeImageSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const fullPath = resolvePathSafe(projectRoot, params.imagePath);

      // Check file existence
      const fs = await import('fs/promises');
      try {
        await fs.access(fullPath);
      } catch {
        throw new Error(`Image file not found: ${params.imagePath} (resolved to: ${fullPath})`);
      }

      // Read file
      const imageBuffer = await readFile(fullPath);

      // Analyze image
      const analysis = await analyzeImage(imageBuffer, params.imagePath);

      // Build response
      let responseText = `📊 Image Analysis Results\n\n`;
      responseText += `**File:** ${analysis.path}\n\n`;
      responseText += `**Basic Information:**\n`;
      responseText += `   • Format: ${analysis.format.toUpperCase()}\n`;
      responseText += `   • Dimensions: ${analysis.width}x${analysis.height}px\n`;
      responseText += `   • Aspect Ratio: ${analysis.aspectRatio}\n`;
      responseText += `   • File Size: ${analysis.sizeFormatted}\n`;
      responseText += `   • Color Space: ${analysis.colorSpace}\n`;
      responseText += `   • Channels: ${analysis.channels}\n`;
      responseText += `   • Has Alpha: ${analysis.hasAlpha ? 'Yes' : 'No'}\n`;
      if (analysis.density) {
        responseText += `   • Density: ${analysis.density} DPI\n`;
      }
      if (analysis.orientation) {
        responseText += `   • Orientation: ${analysis.orientation}\n`;
      }
      responseText += `\n`;

      responseText += `**Optimization Status:** ${analysis.isOptimized ? '✅ Optimized' : '⚠️ Needs Optimization'}\n\n`;

      if (analysis.optimizationSuggestions.length > 0) {
        responseText += `**Optimization Suggestions:**\n`;
        for (const suggestion of analysis.optimizationSuggestions) {
          responseText += `   • ${suggestion}\n`;
        }
        responseText += `\n`;
        responseText += `💡 Use \`image_optimize\` tool to automatically optimize this image\n`;
      }

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // image_optimize
  const OptimizeImageSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to local image file (relative to project root)' }),
    outputPath: Type.Optional(Type.String({ description: 'Output path (relative to project root). If not specified, overwrites original file' })),
    maxWidth: Type.Optional(Type.Number({ minimum: 1, maximum: 4000, description: 'Maximum width in pixels (optional, for resizing large images)' })),
    quality: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 100, description: 'Target quality (1-100). Default: 100. Lower values = smaller files' }))
  });

  server.addTool({
    name: 'image_optimize',
    description: 'Automatically optimize local image: compress, convert to best format, reduce file size. All paths are relative to the project root.',
    schema: OptimizeImageSchema,
    handler: async (params: Static<typeof OptimizeImageSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const fullInputPath = resolvePathSafe(projectRoot, params.imagePath);
      const outputFilePath = params.outputPath ? resolvePathSafe(projectRoot, params.outputPath) : fullInputPath;

      // Check file existence
      const fs = await import('fs/promises');
      try {
        await fs.access(fullInputPath);
      } catch {
        throw new Error(`Image file not found: ${params.imagePath} (resolved to: ${fullInputPath})`);
      }

      // Read file
      const imageBuffer = await readFile(fullInputPath);

      // Optimize image
      const result = await optimizeImage(imageBuffer, outputFilePath, config, {
        maxWidth: params.maxWidth,
        quality: params.quality,
      });

      // Build response
      let responseText = `⚡ Image Optimized Successfully\n\n`;
      responseText += `**Input:** ${params.imagePath}\n`;
      responseText += `**Output:** ${params.outputPath || params.imagePath}\n\n`;
      responseText += `**Results:**\n`;
      responseText += `   • Format: ${result.format.toUpperCase()}\n`;
      responseText += `   • Dimensions: ${result.width}x${result.height}px\n`;
      responseText += `   • Original Size: ${formatFileSize(result.originalSize)}\n`;
      responseText += `   • Optimized Size: ${formatFileSize(result.optimizedSize)}\n`;
      responseText += `   • Saved: ${formatFileSize(result.savedBytes)} (${result.savingsPercent}%)\n`;

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // image_create_placeholder
  const CreatePlaceholderSchema = Type.Object({
    outputPath: Type.String({ description: 'Output path (relative to project root, e.g., "public/images/placeholder-1920x1080.png")' }),
    width: Type.Number({ minimum: 1, maximum: 4000, description: 'Width in pixels' }),
    height: Type.Number({ minimum: 1, maximum: 4000, description: 'Height in pixels' }),
    backgroundColor: Type.Optional(Type.String({ default: '#cccccc', description: 'Background color in HEX format (e.g., "#cccccc", "#f0f0f0"). Ignored if transparent=true' })),
    textColor: Type.Optional(Type.String({ default: '#666666', description: 'Text color in HEX format (e.g., "#666666", "#333333"). Ignored if transparent=true' })),
    format: Type.Optional(Type.Union([
      Type.Literal('webp'),
      Type.Literal('jpeg'),
      Type.Literal('jpg'),
      Type.Literal('png'),
      Type.Literal('avif')
    ], { description: 'Output format. If not specified, determined from outputPath extension. When transparent=true, PNG is forced' })),
    useImage: Type.Optional(Type.Boolean({ default: false, description: 'Use real image from Lorem Picsum instead of colored block with text' })),
    imageId: Type.Optional(Type.Number({ minimum: 0, maximum: 1084, description: 'Specific image ID from Picsum (0-1084). If not specified, random image will be used' })),
    blur: Type.Optional(Type.Number({ minimum: 1, maximum: 10, description: 'Blur level (1-10) for Picsum image' })),
    grayscale: Type.Optional(Type.Boolean({ default: false, description: 'Convert Picsum image to grayscale' })),
    transparent: Type.Optional(Type.Boolean({ default: false, description: 'Create fully transparent image (useful for spacer/tracking pixels). Output will be PNG format. Ignores backgroundColor and textColor' }))
  });

  server.addTool({
    name: 'image_create_placeholder',
    description: 'Create placeholder image with dimensions displayed in center (useful for designers). All paths are relative to the project root.',
    schema: CreatePlaceholderSchema,
    handler: async (params: Static<typeof CreatePlaceholderSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const result = await createPlaceholderImage(
        resolvePathSafe(projectRoot, params.outputPath),
        config,
        {
          width: params.width,
          height: params.height,
          backgroundColor: params.backgroundColor,
          textColor: params.textColor,
          format: params.format === 'jpg' ? 'jpeg' : params.format,
          useImage: params.useImage,
          imageId: params.imageId,
          blur: params.blur,
          grayscale: params.grayscale,
          transparent: params.transparent,
        }
      );

      let responseText = `✅ Placeholder Image Created\n\n`;
      responseText += `**Output:** ${params.outputPath}\n`;
      responseText += `**Dimensions:** ${result.width}x${result.height}px\n`;
      responseText += `**Format:** ${result.format.toUpperCase()}\n`;
      if (params.transparent) {
        responseText += `**Type:** Transparent (fully transparent PNG)\n`;
      }

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // image_create_favicon
  const CreateFaviconSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to source image file (relative to project root)' }),
    outputDir: Type.String({ description: 'Output directory for favicon files (relative to project root, e.g., "public/favicons")' }),
    sizes: Type.Optional(Type.Array(Type.Number({ minimum: 16, maximum: 512 }), { description: 'Custom sizes to generate. Default: [16, 32, 48, 180, 192, 512]' })),
    appName: Type.Optional(Type.String({ description: 'Application name for PWA manifest (site.webmanifest)' })),
    themeColor: Type.Optional(Type.String({ pattern: '^#[0-9a-fA-F]{6}$', description: 'Theme color for PWA manifest in HEX format (e.g., "#ffffff")' })),
    backgroundColor: Type.Optional(Type.String({ pattern: '^#[0-9a-fA-F]{6}$', description: 'Background color for PWA manifest in HEX format (e.g., "#ffffff")' }))
  });

  server.addTool({
    name: 'image_create_favicon',
    description: 'Create favicon from image. Generates multiple sizes (16x16, 32x32, 48x48, 180x180, 192x192, 512x512), site.webmanifest for PWA, and provides HTML code for integration. All paths are relative to the project root.',
    schema: CreateFaviconSchema,
    handler: async (params: Static<typeof CreateFaviconSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const fullImagePath = resolvePathSafe(projectRoot, params.imagePath);

      // Check file existence
      const fs = await import('fs/promises');
      try {
        await fs.access(fullImagePath);
      } catch {
        throw new Error(`Image file not found: ${params.imagePath} (resolved to: ${fullImagePath})`);
      }

      // Read file
      const imageBuffer = await readFile(fullImagePath);

      // Create favicon
      const result = await createFavicon(imageBuffer, normalizePath(params.outputDir), config, {
        sizes: params.sizes,
        projectRoot: normalizePath(projectRoot),
        appName: params.appName,
        themeColor: params.themeColor,
        backgroundColor: params.backgroundColor,
      });

      let responseText = `✅ Favicon Created Successfully\n\n`;
      responseText += `**Source:** ${params.imagePath}\n`;
      responseText += `**Output Directory:** ${params.outputDir}\n\n`;
      responseText += `**Generated Files:**\n`;
      for (const file of result.files) {
        responseText += `   • ${file.path} (${file.size})\n`;
      }
      responseText += `\n**HTML Code:**\n\`\`\`html\n${result.htmlCode}\n\`\`\`\n`;

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // image_add_watermark
  const AddWatermarkSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to source image file (relative to project root)' }),
    outputPath: Type.String({ description: 'Output path for watermarked image (relative to project root, e.g., "public/images/watermarked.jpg")' }),
    text: Type.Optional(Type.String({ description: 'Text watermark content. Either text or watermarkImagePath must be provided.' })),
    textColor: Type.Optional(Type.String({ description: 'Text color in HEX format (e.g., "#ffffff", "#000000"). Default: "#ffffff"' })),
    fontSize: Type.Optional(Type.Number({ minimum: 10, maximum: 500, description: 'Font size in pixels. Default: auto-calculated based on image size' })),
    fontFamily: Type.Optional(Type.String({ description: 'Font family for text watermark. Default: "Arial, sans-serif"' })),
    watermarkImagePath: Type.Optional(Type.String({ description: 'Path to watermark image file (relative to project root). Either text or watermarkImagePath must be provided.' })),
    position: Type.Optional(Type.Union([
      Type.Literal('center'),
      Type.Literal('top-left'),
      Type.Literal('top-right'),
      Type.Literal('bottom-left'),
      Type.Literal('bottom-right'),
      Type.Literal('custom')
    ], { default: 'center', description: 'Watermark position. Default: "center"' })),
    x: Type.Optional(Type.Number({ minimum: 0, description: 'Custom X coordinate (required when position="custom")' })),
    y: Type.Optional(Type.Number({ minimum: 0, description: 'Custom Y coordinate (required when position="custom")' })),
    size: Type.Optional(Type.Number({ minimum: 10, maximum: 4000, description: 'Watermark size in pixels (for image watermarks). If not specified, uses sizePercent or default 20%' })),
    sizePercent: Type.Optional(Type.Number({ minimum: 1, maximum: 100, description: 'Watermark size as percentage of image (0-100). Default: 20%' })),
    opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 100, default: 50, description: 'Watermark opacity (0-100, where 0 is fully transparent, 100 is fully opaque). Default: 50' })),
    format: Type.Optional(Type.Union([
      Type.Literal('webp'),
      Type.Literal('jpeg'),
      Type.Literal('jpg'),
      Type.Literal('png'),
      Type.Literal('avif')
    ], { description: 'Output format. If not specified, determined from outputPath extension' }))
  });

  server.addTool({
    name: 'image_add_watermark',
    description: 'Add watermark to image. Supports text or image watermarks with customizable positioning, size, and opacity. All paths are relative to the project root.',
    schema: AddWatermarkSchema,
    handler: async (params: Static<typeof AddWatermarkSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const result = await addWatermark(
        params.imagePath,
        params.outputPath,
        config,
        {
          text: params.text,
          textColor: params.textColor,
          fontSize: params.fontSize,
          fontFamily: params.fontFamily,
          watermarkImagePath: params.watermarkImagePath,
          position: params.position,
          x: params.x,
          y: params.y,
          size: params.size,
          sizePercent: params.sizePercent,
          opacity: params.opacity,
          format: params.format === 'jpg' ? 'jpeg' : params.format,
          projectRoot,
        }
      );

      let responseText = `✅ Watermark Added Successfully\n\n`;
      responseText += `**Source:** ${params.imagePath}\n`;
      responseText += `**Output:** ${params.outputPath}\n`;
      responseText += `**Format:** ${result.format.toUpperCase()}\n`;
      responseText += `**Dimensions:** ${result.width}x${result.height}px\n`;

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // image_apply_filters
  const ApplyFiltersSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to source image file (relative to project root)' }),
    outputPath: Type.String({ description: 'Output path for filtered image (relative to project root, e.g., "public/images/filtered.jpg")' }),
    blur: Type.Optional(Type.Number({ minimum: 0, maximum: 1000, description: 'Blur amount (0-1000, sigma value). Higher values = more blur' })),
    sharpen: Type.Optional(Type.Number({ minimum: 0, maximum: 1000, description: 'Sharpen amount (0-1000, sigma value). Higher values = more sharpening' })),
    grayscale: Type.Optional(Type.Boolean({ description: 'Convert image to grayscale' })),
    sepia: Type.Optional(Type.Boolean({ description: 'Apply sepia tone effect' })),
    brightness: Type.Optional(Type.Number({ minimum: -100, maximum: 100, description: 'Brightness adjustment (-100 to 100, where 0 = no change, positive = brighter, negative = darker)' })),
    contrast: Type.Optional(Type.Number({ minimum: -100, maximum: 100, description: 'Contrast adjustment (-100 to 100, where 0 = no change, positive = more contrast, negative = less contrast)' })),
    saturation: Type.Optional(Type.Number({ minimum: -100, maximum: 100, description: 'Saturation adjustment (-100 to 100, where 0 = no change, positive = more saturated, negative = less saturated, -100 = grayscale)' })),
    format: Type.Optional(Type.Union([
      Type.Literal('webp'),
      Type.Literal('jpeg'),
      Type.Literal('jpg'),
      Type.Literal('png'),
      Type.Literal('avif')
    ], { description: 'Output format. If not specified, determined from outputPath extension' }))
  });

  server.addTool({
    name: 'image_apply_filters',
    description: 'Apply filters and effects to image. Supports blur, sharpen, grayscale, sepia, brightness, contrast, and saturation adjustments. All paths are relative to the project root.',
    schema: ApplyFiltersSchema,
    handler: async (params: Static<typeof ApplyFiltersSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const result = await applyFilters(
        params.imagePath,
        params.outputPath,
        config,
        {
          blur: params.blur,
          sharpen: params.sharpen,
          grayscale: params.grayscale,
          sepia: params.sepia,
          brightness: params.brightness,
          contrast: params.contrast,
          saturation: params.saturation,
          format: params.format === 'jpg' ? 'jpeg' : params.format,
          projectRoot,
        }
      );

      let responseText = `✅ Filters Applied Successfully\n\n`;
      responseText += `**Source:** ${params.imagePath}\n`;
      responseText += `**Output:** ${params.outputPath}\n`;
      responseText += `**Format:** ${result.format.toUpperCase()}\n`;
      responseText += `**Dimensions:** ${result.width}x${result.height}px\n`;
      responseText += `**Applied Filters:** ${result.appliedFilters.join(', ')}\n`;

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // image_rotate
  const RotateImageSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to source image file (relative to project root)' }),
    outputPath: Type.String({ description: 'Output path for rotated image (relative to project root, e.g., "public/images/rotated.jpg")' }),
    angle: Type.Optional(Type.Number({ minimum: 0, maximum: 360, description: 'Rotation angle in degrees (0-360). If specified, other rotation options are ignored' })),
    rotate90: Type.Optional(Type.Boolean({ description: 'Rotate 90° clockwise' })),
    rotate180: Type.Optional(Type.Boolean({ description: 'Rotate 180°' })),
    rotate270: Type.Optional(Type.Boolean({ description: 'Rotate 270° clockwise (or -90°)' })),
    format: Type.Optional(Type.Union([
      Type.Literal('webp'),
      Type.Literal('jpeg'),
      Type.Literal('jpg'),
      Type.Literal('png'),
      Type.Literal('avif')
    ], { description: 'Output format. If not specified, determined from outputPath extension' }))
  });

  server.addTool({
    name: 'image_rotate',
    description: 'Rotate image by specified angle. Supports standard rotations (90°, 180°, 270°) or custom angle in degrees. All paths are relative to the project root.',
    schema: RotateImageSchema,
    handler: async (params: Static<typeof RotateImageSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const result = await rotateImage(
        params.imagePath,
        params.outputPath,
        config,
        {
          angle: params.angle,
          rotate90: params.rotate90,
          rotate180: params.rotate180,
          rotate270: params.rotate270,
          format: params.format === 'jpg' ? 'jpeg' : params.format,
          projectRoot,
        }
      );

      let responseText = `✅ Image Rotated Successfully\n\n`;
      responseText += `**Source:** ${params.imagePath}\n`;
      responseText += `**Output:** ${params.outputPath}\n`;
      responseText += `**Rotation:** ${result.angle}°\n`;
      responseText += `**Format:** ${result.format.toUpperCase()}\n`;
      responseText += `**Dimensions:** ${result.width}x${result.height}px\n`;

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });

  // image_crop_custom
  const CropImageSchema = Type.Object({
    imagePath: Type.String({ description: 'Path to source image file (relative to project root)' }),
    outputPath: Type.String({ description: 'Output path for cropped image (relative to project root, e.g., "public/images/cropped.jpg")' }),
    x: Type.Number({ minimum: 0, description: 'X coordinate of the top-left corner of the crop area' }),
    y: Type.Number({ minimum: 0, description: 'Y coordinate of the top-left corner of the crop area' }),
    width: Type.Number({ minimum: 1, description: 'Width of the crop area in pixels' }),
    height: Type.Number({ minimum: 1, description: 'Height of the crop area in pixels' }),
    format: Type.Optional(Type.Union([
      Type.Literal('webp'),
      Type.Literal('jpeg'),
      Type.Literal('jpg'),
      Type.Literal('png'),
      Type.Literal('avif')
    ], { description: 'Output format. If not specified, determined from outputPath extension' }))
  });

  server.addTool({
    name: 'image_crop_custom',
    description: 'Crop image by exact coordinates. Useful for precise cropping with specified x, y, width, and height. All paths are relative to the project root.',
    schema: CropImageSchema,
    handler: async (params: Static<typeof CropImageSchema>, context) => {
      const config = context.config;
      const projectRoot = getProjectRoot(context);

      const result = await cropImage(
        params.imagePath,
        params.outputPath,
        config,
        {
          x: params.x,
          y: params.y,
          width: params.width,
          height: params.height,
          format: params.format === 'jpg' ? 'jpeg' : params.format,
          projectRoot,
        }
      );

      let responseText = `✅ Image Cropped Successfully\n\n`;
      responseText += `**Source:** ${params.imagePath}\n`;
      responseText += `**Output:** ${params.outputPath}\n`;
      responseText += `**Crop Area:** x=${result.cropArea.x}, y=${result.cropArea.y}, width=${result.cropArea.width}, height=${result.cropArea.height}\n`;
      responseText += `**Format:** ${result.format.toUpperCase()}\n`;
      responseText += `**Dimensions:** ${result.width}x${result.height}px\n`;

      return {
        content: [{ type: 'text', text: responseText }]
      };
    }
  });
}

