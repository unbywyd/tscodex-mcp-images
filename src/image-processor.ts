import sharp from 'sharp';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { UniversalPhoto, ImageFormat, EImageProvider } from './types.js';
import { Config } from './config.js';

/**
 * Determine image format from path or parameter
 */
export function determineFormat(
  targetPath: string,
  formatParam?: string,
  defaultFormat: ImageFormat = 'webp'
): ImageFormat {
  if (formatParam) {
    return formatParam === 'jpg' ? 'jpeg' : formatParam as ImageFormat;
  }

  const ext = targetPath.split('.').pop()?.toLowerCase();
  const formatMap: Record<string, ImageFormat> = {
    'webp': 'webp',
    'jpg': 'jpeg',
    'jpeg': 'jpeg',
    'png': 'png',
    'avif': 'avif',
  };

  return formatMap[ext || ''] || defaultFormat;
}

/**
 * Parse aspect ratio from string format "width:height"
 */
export function parseAspectRatio(aspectRatio?: string): { width: number; height: number } | null {
  if (!aspectRatio) return null;

  const [width, height] = aspectRatio.split(':').map(Number);
  if (!width || !height || isNaN(width) || isNaN(height)) {
    throw new Error(`Invalid aspect ratio format: ${aspectRatio}. Expected format: "width:height"`);
  }

  return { width, height };
}

/**
 * Result of project root detection
 */
export interface ProjectRootResult {
  root: string;
  found: boolean;
  method: 'env' | 'config-file' | 'package-json' | 'fallback';
}

/**
 * Determine project root
 * Rules:
 * - If startPath === ".", REQUIRES MCP_PROJECT_ROOT or CURSOR_WORKSPACE environment variable
 * - If startPath is a path (not "."), use it directly (absolute or relative to process.cwd())
 */
export async function findProjectRoot(startPath: string = process.cwd()): Promise<ProjectRootResult> {
  const path = await import('path');
  const fs = await import('fs/promises');

  // If startPath is ".", require environment variable
  if (startPath === '.' || startPath === './' || startPath === '.\\') {
    // Check environment variables (MCP_PROJECT_ROOT or CURSOR_WORKSPACE)
    const envRoot = process.env.MCP_PROJECT_ROOT || process.env.CURSOR_WORKSPACE || process.env.WORKSPACE_ROOT;
    if (envRoot) {
      try {
        const resolved = resolve(envRoot);
        const stats = await fs.stat(resolved).catch(() => null);
        if (stats && stats.isDirectory()) {
          return { root: resolved, found: true, method: 'env' };
        }
      } catch {
        // Directory doesn't exist or is invalid
        return { root: resolve(process.cwd()), found: false, method: 'env' };
      }
    }
    // No environment variable set - not found
    return { root: resolve(process.cwd()), found: false, method: 'fallback' };
  }

  // startPath is an explicit path - use it directly
  const resolvedPath = resolve(startPath);

  // Verify the path exists and is a directory
  try {
    const stats = await fs.stat(resolvedPath).catch(() => null);
    if (stats && stats.isDirectory()) {
      return { root: resolvedPath, found: true, method: 'package-json' };
    }
  } catch {
    // Path doesn't exist
    return { root: resolvedPath, found: false, method: 'fallback' };
  }

  return { root: resolvedPath, found: false, method: 'fallback' };
}

/**
 * Create .mcp-images.json config file in specified directory
 */
export async function createConfigFile(directory: string): Promise<void> {
  const path = await import('path');
  const fs = await import('fs/promises');

  const configPath = path.join(directory, '.mcp-images.json');
  const defaultConfig = {
    root: '.',
    defaultFormat: 'webp',
    defaultMaxWidth: 1920,
    defaultQuality: 80,
    saveMetadata: true,
    embedExif: false,
  };

  await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
}

/**
 * Process and save image
 */
export async function processAndSaveImage(
  buffer: Buffer,
  targetPath: string,
  config: Config,
  photo: UniversalPhoto,
  options: {
    format?: string;
    maxWidth?: number;
    quality?: number;
    aspectRatio?: string;
    width?: number;
    height?: number;
  } = {}
): Promise<{
  filePath: string;
  format: ImageFormat;
  width: number;
  height: number;
}> {
  // Determine format
  const format = determineFormat(targetPath, options.format, config.defaultFormat as ImageFormat);

  // Parse aspect ratio
  const targetAspectRatio = parseAspectRatio(options.aspectRatio);

  // Processing parameters
  const maxWidth = options.maxWidth || config.defaultMaxWidth;
  const quality = options.quality || config.defaultQuality;
  const exactWidth = options.width;
  const exactHeight = options.height;

  // Determine project root
  const projectRootResult = await findProjectRoot(config.root);
  const projectRoot = projectRootResult.root;
  const fullPath = resolve(projectRoot, targetPath);

  // Get original image dimensions
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width!;
  const originalHeight = metadata.height!;
  const originalAspectRatio = originalWidth / originalHeight;

  // Basic processing
  let sharpInstance = sharp(buffer);

  // Priority: exact dimensions > aspect ratio > maxWidth
  if (exactWidth && exactHeight) {
    // Exact dimensions: crop/resize to specified dimensions
    sharpInstance = sharpInstance.resize(exactWidth, exactHeight, {
      fit: 'fill', // exact match to dimensions (may crop or stretch)
      withoutEnlargement: false, // allow enlargement if needed
    });
  } else if (exactWidth) {
    // Width only: height calculated automatically maintaining proportions
    sharpInstance = sharpInstance.resize(exactWidth, undefined, {
      fit: 'inside',
      withoutEnlargement: false,
    });
  } else if (exactHeight) {
    // Height only: width calculated automatically maintaining proportions
    sharpInstance = sharpInstance.resize(undefined, exactHeight, {
      fit: 'inside',
      withoutEnlargement: false,
    });
  } else if (targetAspectRatio) {
    // Calculate target aspect ratio
    const targetRatio = targetAspectRatio.width / targetAspectRatio.height;

    // Determine crop dimensions
    let cropWidth = originalWidth;
    let cropHeight = originalHeight;

    if (originalAspectRatio > targetRatio) {
      // Original is wider than target → crop width (crop sides)
      cropWidth = Math.round(originalHeight * targetRatio);
    } else if (originalAspectRatio < targetRatio) {
      // Original is taller than target → crop height (crop top/bottom)
      cropHeight = Math.round(originalWidth / targetRatio);
    }
    // If ratios match, no cropping needed

    // Crop from center to target aspect ratio
    const left = Math.floor((originalWidth - cropWidth) / 2);
    const top = Math.floor((originalHeight - cropHeight) / 2);

    sharpInstance = sharpInstance.extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    });

    // After cropping calculate final dimensions considering maxWidth
    const finalHeight = Math.round(maxWidth / targetRatio);
    sharpInstance = sharpInstance.resize(maxWidth, finalHeight, {
      fit: 'fill', // exact match to dimensions
      withoutEnlargement: true,
    });
  } else {
    // Without aspect ratio - just resize to maxWidth
    sharpInstance = sharpInstance.resize({
      width: maxWidth,
      withoutEnlargement: true,
      fit: 'inside', // preserve original aspect ratio
    });
  }

  // If embedExif option is enabled
  if (config.embedExif) {
    const providerName = photo.provider === EImageProvider.PEXELS ? 'Pexels' : 'Pixabay';
    const attributionText = `Photo by ${photo.photographer} on ${providerName} - ${photo.url}`;

    sharpInstance = sharpInstance.withMetadata({
      exif: {
        IFD0: {
          Copyright: attributionText,
          Artist: photo.photographer,
          ImageDescription: `${providerName} Photo ID: ${photo.id}`,
        },
      },
    });
  }

  // Convert to selected format
  let processedBuffer: Buffer;
  let finalWidth: number;
  let finalHeight: number;

  switch (format) {
    case 'webp':
      processedBuffer = await sharpInstance
        .webp({
          quality: quality,
          effort: 4, // balance speed/quality
        })
        .toBuffer();
      break;

    case 'jpeg':
      processedBuffer = await sharpInstance
        .jpeg({
          quality: quality,
          mozjpeg: true, // best optimization
        })
        .toBuffer();
      break;

    case 'png':
      processedBuffer = await sharpInstance
        .png({
          compressionLevel: 9, // maximum compression
          // quality not used for PNG (lossless)
        })
        .toBuffer();
      break;

    case 'avif':
      processedBuffer = await sharpInstance
        .avif({
          quality: quality,
          effort: 4, // balance speed/quality
        })
        .toBuffer();
      break;

    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  // Get final dimensions
  const finalMetadata = await sharp(processedBuffer).metadata();
  finalWidth = finalMetadata.width!;
  finalHeight = finalMetadata.height!;

  // Create directory if needed
  const fileDir = dirname(fullPath);
  await mkdir(fileDir, { recursive: true });

  // Save image
  await writeFile(fullPath, processedBuffer);

  // Save metadata if needed
  if (config.saveMetadata) {
    await saveMetadataFile(photo, fullPath, format, finalWidth, finalHeight, quality);
  }

  return {
    filePath: fullPath,
    format,
    width: finalWidth,
    height: finalHeight,
  };
}

/**
 * Save JSON metadata
 */
async function saveMetadataFile(
  photo: UniversalPhoto,
  targetPath: string,
  format: ImageFormat,
  width: number,
  height: number,
  quality: number
): Promise<void> {
  const metadataPath = `${targetPath}.json`;
  const metadataDir = dirname(metadataPath);

  await mkdir(metadataDir, { recursive: true });

  const providerName = photo.provider === EImageProvider.PEXELS ? 'Pexels' : 'Pixabay';

  const metadata = {
    source: photo.provider,
    provider: photo.provider,
    photoId: photo.id,
    photographer: photo.photographer,
    photographerUrl: photo.photographerUrl,
    photoUrl: photo.url,
    downloadedAt: new Date().toISOString(),
    filePath: targetPath,
    format,
    width,
    height,
    quality,
    attribution: {
      text: `Photo by ${photo.photographer} on ${providerName}`,
      html: `<a href="${photo.url}">Photo by ${photo.photographer} on ${providerName}</a>`,
      markdown: `[Photo by ${photo.photographer} on ${providerName}](${photo.url})`,
    },
  };

  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Convert image to base64 for preview
 * Returns clean Base64 without data:... prefix (MCP protocol requires clean Base64)
 * Optimizes image to reduce Base64 string size
 */
export async function imageToBase64(buffer: Buffer, mimeType: string = 'image/jpeg'): Promise<string> {
  // Optimize preview: reduce size and compress for smaller Base64
  const optimizedBuffer = await sharp(buffer)
    .resize(400, 400, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({
      quality: 75,
      mozjpeg: true
    })
    .toBuffer();

  return optimizedBuffer.toString('base64');
}

/**
 * Process local image (without UniversalPhoto binding)
 */
export async function processLocalImage(
  imageBuffer: Buffer,
  targetPath: string,
  config: Config,
  options: {
    format?: string;
    maxWidth?: number;
    quality?: number;
    aspectRatio?: string;
    width?: number;
    height?: number;
    circle?: boolean;
  } = {}
): Promise<{
  filePath: string;
  format: ImageFormat;
  width: number;
  height: number;
  originalSize: number;
  newSize: number;
  savedBytes: number;
}> {
  const originalSize = imageBuffer.length;

  // If circle needed, format must be PNG for transparency support
  const format = options.circle
    ? 'png' as ImageFormat
    : determineFormat(targetPath, options.format, config.defaultFormat as ImageFormat);

  // Parse aspect ratio
  // For circle need square (1:1)
  const targetAspectRatio = options.circle
    ? { width: 1, height: 1 }
    : parseAspectRatio(options.aspectRatio);

  // Processing parameters
  const maxWidth = options.maxWidth || config.defaultMaxWidth;
  const quality = options.quality || config.defaultQuality;
  const exactWidth = options.width;
  const exactHeight = options.height;

  // Determine project root
  const projectRootResult = await findProjectRoot(config.root);
  const projectRoot = projectRootResult.root;
  const fullPath = resolve(projectRoot, targetPath);

  // Get original image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const originalWidth = metadata.width!;
  const originalHeight = metadata.height!;
  const originalAspectRatio = originalWidth / originalHeight;

  // Basic processing
  let sharpInstance = sharp(imageBuffer);

  // Priority: exact dimensions > aspect ratio > maxWidth
  if (exactWidth && exactHeight) {
    sharpInstance = sharpInstance.resize(exactWidth, exactHeight, {
      fit: 'fill',
      withoutEnlargement: false,
    });
  } else if (exactWidth) {
    sharpInstance = sharpInstance.resize(exactWidth, undefined, {
      fit: 'inside',
      withoutEnlargement: false,
    });
  } else if (exactHeight) {
    sharpInstance = sharpInstance.resize(undefined, exactHeight, {
      fit: 'inside',
      withoutEnlargement: false,
    });
  } else if (targetAspectRatio) {
    const targetRatio = targetAspectRatio.width / targetAspectRatio.height;
    let cropWidth = originalWidth;
    let cropHeight = originalHeight;

    if (originalAspectRatio > targetRatio) {
      cropWidth = Math.round(originalHeight * targetRatio);
    } else if (originalAspectRatio < targetRatio) {
      cropHeight = Math.round(originalWidth / targetRatio);
    }

    const left = Math.floor((originalWidth - cropWidth) / 2);
    const top = Math.floor((originalHeight - cropHeight) / 2);

    sharpInstance = sharpInstance.extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    });

    const finalHeight = Math.round(maxWidth / targetRatio);
    sharpInstance = sharpInstance.resize(maxWidth, finalHeight, {
      fit: 'fill',
      withoutEnlargement: true,
    });
  } else {
    sharpInstance = sharpInstance.resize({
      width: maxWidth,
      withoutEnlargement: true,
      fit: 'inside',
    });
  }

  // If circle needed, apply circular mask
  if (options.circle) {
    // Get dimensions after processing
    const tempBuffer = await sharpInstance.toBuffer();
    const tempMetadata = await sharp(tempBuffer).metadata();

    if (!tempMetadata.width || !tempMetadata.height) {
      throw new Error('Unable to determine image dimensions');
    }

    // Determine square size (minimum side)
    const size = Math.min(tempMetadata.width, tempMetadata.height);

    // If image is not square, crop to square from center
    let squareBuffer: Buffer;
    if (tempMetadata.width !== tempMetadata.height) {
      const left = Math.max(0, Math.floor((tempMetadata.width - size) / 2));
      const top = Math.max(0, Math.floor((tempMetadata.height - size) / 2));

      squareBuffer = await sharp(tempBuffer)
        .extract({
          left,
          top,
          width: Math.min(size, tempMetadata.width - left),
          height: Math.min(size, tempMetadata.height - top)
        })
        .resize(size, size, { fit: 'fill' })
        .toBuffer();
    } else {
      // Already square, just resize to needed size
      squareBuffer = await sharp(tempBuffer)
        .resize(size, size, { fit: 'fill' })
        .toBuffer();
    }

    // Create circular mask
    const radius = size / 2;
    const maskSvg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
      </svg>
    `;

    const maskBuffer = Buffer.from(maskSvg);

    // Apply mask to create circular shape
    sharpInstance = sharp(squareBuffer)
      .composite([{
        input: maskBuffer,
        blend: 'dest-in'
      }]);
  }

  // Convert to selected format
  let processedBuffer: Buffer;
  let finalWidth: number;
  let finalHeight: number;

  switch (format) {
    case 'webp':
      processedBuffer = await sharpInstance
        .webp({ quality: quality, effort: 4 })
        .toBuffer();
      break;
    case 'jpeg':
      processedBuffer = await sharpInstance
        .jpeg({ quality: quality, mozjpeg: true })
        .toBuffer();
      break;
    case 'png':
      processedBuffer = await sharpInstance
        .png({ compressionLevel: 9 })
        .toBuffer();
      break;
    case 'avif':
      processedBuffer = await sharpInstance
        .avif({ quality: quality, effort: 4 })
        .toBuffer();
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  const finalMetadata = await sharp(processedBuffer).metadata();
  finalWidth = finalMetadata.width!;
  finalHeight = finalMetadata.height!;

  // Create directory if needed
  const fileDir = dirname(fullPath);
  await mkdir(fileDir, { recursive: true });

  // Save image
  await writeFile(fullPath, processedBuffer);

  const newSize = processedBuffer.length;
  const savedBytes = originalSize - newSize;

  return {
    filePath: fullPath,
    format,
    width: finalWidth,
    height: finalHeight,
    originalSize,
    newSize,
    savedBytes,
  };
}

/**
 * Analyze image
 */
export async function analyzeImage(
  imageBuffer: Buffer,
  imagePath: string
): Promise<{
  path: string;
  format: string;
  width: number;
  height: number;
  size: number;
  sizeFormatted: string;
  aspectRatio: string;
  hasAlpha: boolean;
  colorSpace: string;
  channels: number;
  density?: number;
  orientation?: number;
  isOptimized: boolean;
  optimizationSuggestions: string[];
}> {
  const metadata = await sharp(imageBuffer).metadata();
  const size = imageBuffer.length;
  const sizeFormatted = formatFileSize(size);
  const aspectRatio = `${metadata.width}:${metadata.height}`;

  const suggestions: string[] = [];
  let isOptimized = true;

  // Check format
  const format = metadata.format || 'unknown';
  if (format === 'jpeg' || format === 'jpg') {
    if (size > 500 * 1024) { // > 500KB
      suggestions.push('Consider converting to WebP format for better compression');
      isOptimized = false;
    }
  } else if (format === 'png') {
    if (!metadata.hasAlpha && size > 200 * 1024) { // PNG without transparency > 200KB
      suggestions.push('PNG without transparency can be converted to JPEG or WebP for smaller file size');
      isOptimized = false;
    }
  }

  // Check size
  if (metadata.width && metadata.width > 2000) {
    suggestions.push(`Image is very large (${metadata.width}px). Consider resizing to max 1920px for web use`);
    isOptimized = false;
  }

  // Check quality
  if (size > 1024 * 1024) { // > 1MB
    suggestions.push('File size is large. Consider reducing quality or converting format');
    isOptimized = false;
  }

  return {
    path: imagePath,
    format: format || 'unknown',
    width: metadata.width || 0,
    height: metadata.height || 0,
    size,
    sizeFormatted,
    aspectRatio,
    hasAlpha: metadata.hasAlpha || false,
    colorSpace: metadata.space || 'unknown',
    channels: metadata.channels || 0,
    density: metadata.density,
    orientation: metadata.orientation,
    isOptimized,
    optimizationSuggestions: suggestions,
  };
}

/**
 * Format file size
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Automatic image optimization
 */
export async function optimizeImage(
  imageBuffer: Buffer,
  targetPath: string,
  config: Config,
  options: {
    maxWidth?: number;
    quality?: number;
  } = {}
): Promise<{
  filePath: string;
  format: ImageFormat;
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
  savedBytes: number;
  savingsPercent: number;
}> {
  const originalSize = imageBuffer.length;
  const metadata = await sharp(imageBuffer).metadata();
  const originalFormat = metadata.format?.toLowerCase() || 'unknown';

  // Determine best format
  let bestFormat: ImageFormat = 'webp';
  if (metadata.hasAlpha) {
    bestFormat = 'png'; // PNG for images with transparency
  } else if (originalFormat === 'png') {
    bestFormat = 'webp'; // WebP is better for PNG without transparency
  } else if (originalFormat === 'jpeg' || originalFormat === 'jpg') {
    bestFormat = 'webp'; // WebP is better for JPEG
  }

  // Determine path with correct extension
  const pathParts = targetPath.split('.');
  const ext = pathParts[pathParts.length - 1];
  const outputPath = ext === bestFormat ? targetPath : targetPath.replace(/\.\w+$/, `.${bestFormat}`);

  // Processing
  const result = await processLocalImage(imageBuffer, outputPath, config, {
    format: bestFormat,
    maxWidth: options.maxWidth,
    quality: options.quality || 85,
  });

  const savingsPercent = ((result.savedBytes / originalSize) * 100).toFixed(1);

  return {
    filePath: result.filePath,
    format: result.format,
    width: result.width,
    height: result.height,
    originalSize,
    optimizedSize: result.newSize,
    savedBytes: result.savedBytes,
    savingsPercent: parseFloat(savingsPercent),
  };
}

/**
 * Create placeholder image with dimensions in center
 */
export async function createPlaceholderImage(
  targetPath: string,
  config: Config,
  options: {
    width: number;
    height: number;
    backgroundColor?: string;
    textColor?: string;
    format?: ImageFormat;
    useImage?: boolean;
    imageId?: number;
    blur?: number;
    grayscale?: boolean;
  }
): Promise<{
  filePath: string;
  format: ImageFormat;
  width: number;
  height: number;
}> {
  const {
    width,
    height,
    backgroundColor = '#cccccc',
    textColor = '#666666',
    format: formatParam,
    useImage = false,
    imageId,
    blur,
    grayscale,
  } = options;

  // Determine format
  const format = determineFormat(targetPath as string, formatParam as ImageFormat, config.defaultFormat as ImageFormat);

  // Determine project root
  const projectRootResult = await findProjectRoot(config.root);
  const projectRoot = projectRootResult.root;
  const fullPath = resolve(projectRoot, targetPath);

  let processedBuffer: Buffer;

  // If need to use real image from Picsum
  if (useImage) {
    const fetch = (await import('node-fetch')).default;

    // Build URL for Picsum
    let picsumUrl = 'https://picsum.photos/';

    // If specific image ID is specified
    if (imageId !== undefined) {
      picsumUrl += `id/${imageId}/`;
    }

    // Dimensions
    picsumUrl += `${width}/${height}`;

    // Parameters
    const params: string[] = [];
    if (blur !== undefined && blur > 0) {
      params.push(`blur=${Math.min(Math.max(blur, 1), 10)}`);
    }
    if (grayscale) {
      params.push('grayscale');
    }

    if (params.length > 0) {
      picsumUrl += `?${params.join('&')}`;
    }

    // Add extension for needed format
    if (format === 'webp') {
      picsumUrl += '.webp';
    } else if (format === 'jpeg') {
      picsumUrl += '.jpg';
    }

    try {
      const response = await fetch(picsumUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from Picsum: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      processedBuffer = Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`Failed to download placeholder image from Picsum: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Create SVG with dimension text
    const sizeText = `${width} × ${height}`;
    const fontSize = Math.min(width, height) / 8; // Adaptive font size
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${backgroundColor}"/>
        <text 
          x="50%" 
          y="50%" 
          font-family="Arial, sans-serif" 
          font-size="${fontSize}" 
          fill="${textColor}" 
          text-anchor="middle" 
          dominant-baseline="middle"
          font-weight="bold">
          ${sizeText}
        </text>
      </svg>
    `;

    // Convert SVG to needed format via Sharp
    switch (format) {
      case 'webp':
        processedBuffer = await sharp(Buffer.from(svg))
          .webp({ quality: 90 })
          .toBuffer();
        break;
      case 'jpeg':
        processedBuffer = await sharp(Buffer.from(svg))
          .jpeg({ quality: 90 })
          .toBuffer();
        break;
      case 'png':
        processedBuffer = await sharp(Buffer.from(svg))
          .png({ compressionLevel: 9 })
          .toBuffer();
        break;
      case 'avif':
        processedBuffer = await sharp(Buffer.from(svg))
          .avif({ quality: 90 })
          .toBuffer();
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  // Create directory if needed
  const fileDir = dirname(fullPath);
  await mkdir(fileDir, { recursive: true });

  // Save image
  await writeFile(fullPath, processedBuffer);

  return {
    filePath: fullPath,
    format,
    width,
    height,
  };
}

/**
 * Create favicon from image
 * Generates multiple sizes and HTML code for integration
 */
export async function createFavicon(
  imageBuffer: Buffer,
  outputDir: string,
  config: Config,
  options: {
    sizes?: number[]; // Sizes to generate (default standard sizes)
    generateIco?: boolean; // Whether to generate ICO file (requires additional library)
  } = {}
): Promise<{
  files: Array<{ path: string; size: string; format: string }>;
  htmlCode: string;
  faviconPath?: string;
}> {
  const projectRootResult = await findProjectRoot(config.root);
  const fullOutputDir = resolve(projectRootResult.root, outputDir);

  // Standard favicon sizes
  const defaultSizes = [16, 32, 48, 180, 192, 512];
  const sizes = options.sizes || defaultSizes;

  // Create directory if needed
  await mkdir(fullOutputDir, { recursive: true });

  const files: Array<{ path: string; size: string; format: string }> = [];
  const htmlLinks: string[] = [];

  // Get source image metadata
  const metadata = await sharp(imageBuffer).metadata();
  const originalWidth = metadata.width!;
  const originalHeight = metadata.height!;

  // Crop to square if needed
  let squareBuffer = imageBuffer;
  if (originalWidth !== originalHeight) {
    const size = Math.min(originalWidth, originalHeight);
    const left = Math.floor((originalWidth - size) / 2);
    const top = Math.floor((originalHeight - size) / 2);

    squareBuffer = await sharp(imageBuffer)
      .extract({ left, top, width: size, height: size })
      .toBuffer();
  }

  // Generate each size
  for (const size of sizes) {
    const fileName = `favicon-${size}x${size}.png`;
    const filePath = resolve(fullOutputDir, fileName);
    const relativePath = `${outputDir}/${fileName}`.replace(/\\/g, '/'); // Normalize path for HTML

    // Resize and save
    const faviconBuffer = await sharp(squareBuffer)
      .resize(size, size, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await writeFile(filePath, faviconBuffer);

    files.push({
      path: relativePath,
      size: `${size}x${size}`,
      format: 'png',
    });

    // Add corresponding HTML link
    if (size === 180) {
      htmlLinks.push(`<link rel="apple-touch-icon" sizes="${size}x${size}" href="${relativePath}">`);
    } else {
      htmlLinks.push(`<link rel="icon" type="image/png" sizes="${size}x${size}" href="${relativePath}">`);
    }
  }

  // Create main favicon.png (use 32x32 as main)
  // Sharp doesn't support true ICO format, so use PNG
  const favicon32Buffer = await sharp(squareBuffer)
    .resize(32, 32, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const faviconPath = resolve(fullOutputDir, 'favicon.png');
  await writeFile(faviconPath, favicon32Buffer);

  const relativeFaviconPath = `${outputDir}/favicon.png`.replace(/\\/g, '/'); // Normalize path for HTML
  htmlLinks.unshift(`<link rel="icon" type="image/png" href="${relativeFaviconPath}">`);

  // Add manifest for PWA (if sizes 192 and 512 are present)
  if (sizes.includes(192) && sizes.includes(512)) {
    htmlLinks.push(`<link rel="manifest" href="${outputDir}/site.webmanifest">`);
  }

  // Build HTML code
  const htmlCode = htmlLinks.join('\n');

  return {
    files,
    htmlCode,
    faviconPath: relativeFaviconPath,
  };
}

/**
 * Watermark positioning types
 */
export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'custom';

/**
 * Add watermark to image
 * Supports text and image watermarks
 */
export async function addWatermark(
  imagePath: string,
  outputPath: string,
  config: Config,
  options: {
    // Text watermark
    text?: string;
    textColor?: string;
    fontSize?: number; // Font size in pixels
    fontFamily?: string;

    // Image watermark
    watermarkImagePath?: string;

    // Positioning
    position?: WatermarkPosition;
    x?: number; // Custom X coordinate (for position='custom')
    y?: number; // Custom Y coordinate (for position='custom')

    // Size (for image watermark)
    size?: number; // Size in pixels
    sizePercent?: number; // Size as percentage of source image (0-100)

    // Opacity
    opacity?: number; // 0-100 (0 = fully transparent, 100 = fully opaque)

    // Output file format
    format?: ImageFormat;
  }
): Promise<{
  filePath: string;
  format: ImageFormat;
  width: number;
  height: number;
}> {
  const projectRootResult = await findProjectRoot(config.root);
  const fullImagePath = resolve(projectRootResult.root, imagePath);
  const fullOutputPath = resolve(projectRootResult.root, outputPath);

  // Check if source image exists
  const fs = await import('fs/promises');
  try {
    await fs.access(fullImagePath);
  } catch {
    throw new Error(`Source image not found: ${imagePath} (resolved to: ${fullImagePath})`);
  }

  // Determine output file format
  const format = determineFormat(outputPath as string, options.format as ImageFormat, config.defaultFormat as ImageFormat);

  // Read source image
  const imageBuffer = await readFile(fullImagePath);
  const image = sharp(imageBuffer);
  const imageMetadata = await image.metadata();
  const imageWidth = imageMetadata.width!;
  const imageHeight = imageMetadata.height!;

  // Default parameters
  const opacity = Math.max(0, Math.min(100, options.opacity ?? 50)) / 100; // 0-1
  const position = options.position || 'center';

  let watermarkBuffer: Buffer;
  let watermarkWidth: number;
  let watermarkHeight: number;

  // Create watermark (text or image)
  if (options.text) {
    // Text watermark
    const text = options.text;
    const textColor = options.textColor || '#ffffff';
    const fontSize = options.fontSize || Math.min(imageWidth, imageHeight) / 20;
    const fontFamily = options.fontFamily || 'Arial, sans-serif';

    // Calculate text size (approximately)
    // Use SVG to create text watermark
    const padding = fontSize * 0.5;
    const estimatedTextWidth = text.length * fontSize * 0.6; // Approximate text width
    const estimatedTextHeight = fontSize * 1.2;

    watermarkWidth = Math.ceil(estimatedTextWidth + padding * 2);
    watermarkHeight = Math.ceil(estimatedTextHeight + padding * 2);

    // Create SVG with text
    const svg = `
      <svg width="${watermarkWidth}" height="${watermarkHeight}" xmlns="http://www.w3.org/2000/svg">
        <text 
          x="50%" 
          y="50%" 
          font-family="${fontFamily}" 
          font-size="${fontSize}" 
          fill="${textColor}" 
          text-anchor="middle" 
          dominant-baseline="middle"
          font-weight="bold"
          opacity="${opacity}">
          ${text}
        </text>
      </svg>
    `;

    watermarkBuffer = Buffer.from(svg);
  } else if (options.watermarkImagePath) {
    // Image watermark
    const fullWatermarkPath = resolve(projectRootResult.root, options.watermarkImagePath);

    try {
      await fs.access(fullWatermarkPath);
    } catch {
      throw new Error(`Watermark image not found: ${options.watermarkImagePath} (resolved to: ${fullWatermarkPath})`);
    }

    const watermarkImageBuffer = await readFile(fullWatermarkPath);
    const watermarkImage = sharp(watermarkImageBuffer);
    const watermarkMetadata = await watermarkImage.metadata();
    const originalWatermarkWidth = watermarkMetadata.width!;
    const originalWatermarkHeight = watermarkMetadata.height!;

    // Determine watermark size
    if (options.size) {
      // Absolute size
      const aspectRatio = originalWatermarkWidth / originalWatermarkHeight;
      if (aspectRatio >= 1) {
        watermarkWidth = options.size;
        watermarkHeight = Math.round(options.size / aspectRatio);
      } else {
        watermarkHeight = options.size;
        watermarkWidth = Math.round(options.size * aspectRatio);
      }
    } else if (options.sizePercent) {
      // Size in percentage
      const percent = Math.max(1, Math.min(100, options.sizePercent)) / 100;
      const baseSize = Math.min(imageWidth, imageHeight);
      const targetSize = baseSize * percent;
      const aspectRatio = originalWatermarkWidth / originalWatermarkHeight;
      if (aspectRatio >= 1) {
        watermarkWidth = Math.round(targetSize);
        watermarkHeight = Math.round(targetSize / aspectRatio);
      } else {
        watermarkHeight = Math.round(targetSize);
        watermarkWidth = Math.round(targetSize * aspectRatio);
      }
    } else {
      // Default - 20% of smaller side
      const defaultSize = Math.min(imageWidth, imageHeight) * 0.2;
      const aspectRatio = originalWatermarkWidth / originalWatermarkHeight;
      if (aspectRatio >= 1) {
        watermarkWidth = Math.round(defaultSize);
        watermarkHeight = Math.round(defaultSize / aspectRatio);
      } else {
        watermarkHeight = Math.round(defaultSize);
        watermarkWidth = Math.round(defaultSize * aspectRatio);
      }
    }

    // Resize watermark
    const resizedWatermarkBuffer = await watermarkImage
      .resize(watermarkWidth, watermarkHeight, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .png()
      .toBuffer();

    // Get actual dimensions after resize (may differ due to fit: 'inside')
    const resizedMetadata = await sharp(resizedWatermarkBuffer).metadata();
    const actualWidth = resizedMetadata.width!;
    const actualHeight = resizedMetadata.height!;

    // Update dimensions for further use
    watermarkWidth = actualWidth;
    watermarkHeight = actualHeight;

    // Apply opacity if needed
    if (opacity < 1) {
      // Use more efficient method via composite with SVG transparency mask
      // Use actual dimensions after resize
      const alphaSvg = `
        <svg width="${actualWidth}" height="${actualHeight}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="white" opacity="${opacity}"/>
        </svg>
      `;

      watermarkBuffer = await sharp(resizedWatermarkBuffer)
        .composite([{
          input: Buffer.from(alphaSvg),
          blend: 'dest-in'
        }])
        .png()
        .toBuffer();
    } else {
      // If opacity = 1, just use image without changes
      watermarkBuffer = resizedWatermarkBuffer;
    }
  } else {
    throw new Error('Either text or watermarkImagePath must be provided');
  }

  // Calculate watermark position
  let left: number;
  let top: number;

  switch (position) {
    case 'center':
      left = Math.floor((imageWidth - watermarkWidth) / 2);
      top = Math.floor((imageHeight - watermarkHeight) / 2);
      break;
    case 'top-left':
      left = Math.floor(imageWidth * 0.05); // 5% margin
      top = Math.floor(imageHeight * 0.05);
      break;
    case 'top-right':
      left = Math.floor(imageWidth - watermarkWidth - imageWidth * 0.05);
      top = Math.floor(imageHeight * 0.05);
      break;
    case 'bottom-left':
      left = Math.floor(imageWidth * 0.05);
      top = Math.floor(imageHeight - watermarkHeight - imageHeight * 0.05);
      break;
    case 'bottom-right':
      left = Math.floor(imageWidth - watermarkWidth - imageWidth * 0.05);
      top = Math.floor(imageHeight - watermarkHeight - imageHeight * 0.05);
      break;
    case 'custom':
      left = options.x ?? 0;
      top = options.y ?? 0;
      break;
    default:
      left = Math.floor((imageWidth - watermarkWidth) / 2);
      top = Math.floor((imageHeight - watermarkHeight) / 2);
  }

  // Ensure position doesn't go out of bounds
  left = Math.max(0, Math.min(left, imageWidth - watermarkWidth));
  top = Math.max(0, Math.min(top, imageHeight - watermarkHeight));

  // Apply watermark
  let processedBuffer: Buffer;

  if (options.text) {
    // For text watermark use composite
    processedBuffer = await image
      .composite([{
        input: watermarkBuffer,
        left,
        top,
        blend: 'over'
      }])
      .toFormat(format)
      .toBuffer();
  } else {
    // For image watermark also use composite
    processedBuffer = await image
      .composite([{
        input: watermarkBuffer,
        left,
        top,
        blend: 'over'
      }])
      .toFormat(format)
      .toBuffer();
  }

  // Create directory if needed
  const fileDir = dirname(fullOutputPath);
  await mkdir(fileDir, { recursive: true });

  // Save image
  await writeFile(fullOutputPath, processedBuffer);

  // Get final dimensions
  const finalMetadata = await sharp(processedBuffer).metadata();

  return {
    filePath: fullOutputPath,
    format,
    width: finalMetadata.width!,
    height: finalMetadata.height!,
  };
}

/**
 * Apply filters and effects to image
 */
export async function applyFilters(
  imagePath: string,
  outputPath: string,
  config: Config,
  options: {
    // Blur and sharpen
    blur?: number;        // 0-1000, blur (sigma)
    sharpen?: number;     // 0-1000, sharpen (sigma)

    // Color effects
    grayscale?: boolean;  // Grayscale
    sepia?: boolean;      // Sepia effect

    // Color correction
    brightness?: number;  // -100 to 100 (0 = no change, 100 = maximum brightness)
    contrast?: number;    // -100 to 100 (0 = no change, 100 = maximum contrast)
    saturation?: number;  // -100 to 100 (0 = no change, 100 = maximum saturation)

    // Output file format
    format?: ImageFormat;
  }
): Promise<{
  filePath: string;
  format: ImageFormat;
  width: number;
  height: number;
  appliedFilters: string[];
}> {
  const projectRootResult = await findProjectRoot(config.root);
  const fullImagePath = resolve(projectRootResult.root, imagePath);
  const fullOutputPath = resolve(projectRootResult.root, outputPath);

  // Check if source image exists
  const fs = await import('fs/promises');
  try {
    await fs.access(fullImagePath);
  } catch {
    throw new Error(`Source image not found: ${imagePath} (resolved to: ${fullImagePath})`);
  }

  // Determine output file format
  const format = determineFormat(outputPath as string, options.format as ImageFormat, config.defaultFormat as ImageFormat);

  // Read source image
  const imageBuffer = await readFile(fullImagePath);
  let image = sharp(imageBuffer);

  const appliedFilters: string[] = [];

  // Get metadata once for all operations
  const metadata = await image.metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  // Apply blur
  if (options.blur !== undefined && options.blur > 0) {
    const blurValue = Math.max(0.3, Math.min(1000, options.blur));
    image = image.blur(blurValue);
    appliedFilters.push(`blur(${blurValue.toFixed(1)})`);
  }

  // Apply sharpen
  if (options.sharpen !== undefined && options.sharpen > 0) {
    const sharpenValue = Math.max(0.3, Math.min(1000, options.sharpen));
    image = image.sharpen(sharpenValue);
    appliedFilters.push(`sharpen(${sharpenValue.toFixed(1)})`);
  }

  // Apply grayscale
  if (options.grayscale) {
    image = image.greyscale();
    appliedFilters.push('grayscale');
  }

  // Apply sepia
  if (options.sepia) {
    // Sepia effect via composite with semi-transparent brown layer
    // Use already obtained metadata
    const sepiaSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#704214" opacity="0.4"/>
      </svg>
    `;

    // First apply grayscale, then add brown tint
    image = image
      .greyscale()
      .composite([{
        input: Buffer.from(sepiaSvg),
        blend: 'over'
      }]);
    appliedFilters.push('sepia');
  }

  // Apply color correction (brightness, contrast, saturation)
  const brightness = options.brightness !== undefined ? options.brightness : 0;
  const contrast = options.contrast !== undefined ? options.contrast : 0;
  const saturation = options.saturation !== undefined ? options.saturation : 0;

  if (brightness !== 0 || contrast !== 0 || saturation !== 0) {
    // Sharp uses modulate for brightness and saturation
    // brightness: 1.0 = no change, 2.0 = 2 times brighter, 0.5 = 2 times darker
    // saturation: 1.0 = no change, 2.0 = 2 times more saturated, 0.0 = grayscale
    // For contrast use linear

    const brightnessMultiplier = 1 + (brightness / 100); // -100 -> 0, 0 -> 1, 100 -> 2
    const saturationMultiplier = 1 + (saturation / 100); // -100 -> 0, 0 -> 1, 100 -> 2

    // Apply brightness and saturation via modulate
    if (brightness !== 0 || saturation !== 0) {
      image = image.modulate({
        brightness: brightnessMultiplier,
        saturation: saturationMultiplier,
      });

      if (brightness !== 0) {
        appliedFilters.push(`brightness(${brightness > 0 ? '+' : ''}${brightness})`);
      }
      if (saturation !== 0) {
        appliedFilters.push(`saturation(${saturation > 0 ? '+' : ''}${saturation})`);
      }
    }

    // Apply contrast via linear
    if (contrast !== 0) {
      // contrast: -100 -> very low contrast, 0 -> no change, 100 -> very high contrast
      // linear takes array [a, b] where output = a * input + b
      // For contrast: when contrast = 100: a = 2, b = -0.5 (contrast enhancement)
      //                when contrast = -100: a = 0.5, b = 0.25 (contrast reduction)
      const contrastFactor = 1 + (contrast / 100); // -100 -> 0, 0 -> 1, 100 -> 2
      const intercept = contrast < 0 ? 0.25 * (1 - contrastFactor) : -0.5 * (contrastFactor - 1);

      image = image.linear(contrastFactor, intercept);
      appliedFilters.push(`contrast(${contrast > 0 ? '+' : ''}${contrast})`);
    }
  }

  // Apply format and get buffer
  const processedBuffer = await image
    .toFormat(format)
    .toBuffer();

  // Create directory if needed
  const fileDir = dirname(fullOutputPath);
  await mkdir(fileDir, { recursive: true });

  // Save image
  await writeFile(fullOutputPath, processedBuffer);

  // Get final dimensions
  const finalMetadata = await sharp(processedBuffer).metadata();

  return {
    filePath: fullOutputPath,
    format,
    width: finalMetadata.width!,
    height: finalMetadata.height!,
    appliedFilters,
  };
}

/**
 * Rotate image
 */
export async function rotateImage(
  imagePath: string,
  outputPath: string,
  config: Config,
  options: {
    // Rotation angle
    angle?: number;  // Arbitrary angle in degrees (0-360)
    // Or standard angles
    rotate90?: boolean;   // Rotate 90° clockwise
    rotate180?: boolean;  // Rotate 180°
    rotate270?: boolean;   // Rotate 270° (or -90°)

    // Output file format
    format?: ImageFormat;
  }
): Promise<{
  filePath: string;
  format: ImageFormat;
  width: number;
  height: number;
  angle: number;
}> {
  const projectRootResult = await findProjectRoot(config.root);
  const fullImagePath = resolve(projectRootResult.root, imagePath);
  const fullOutputPath = resolve(projectRootResult.root, outputPath);

  // Check if source image exists
  const fs = await import('fs/promises');
  try {
    await fs.access(fullImagePath);
  } catch {
    throw new Error(`Source image not found: ${imagePath} (resolved to: ${fullImagePath})`);
  }

  // Determine output file format
  const format = determineFormat(outputPath as string, options.format as ImageFormat, config.defaultFormat as ImageFormat);

  // Read source image
  const imageBuffer = await readFile(fullImagePath);
  let image = sharp(imageBuffer);

  // Determine rotation angle
  let angle: number = 0;

  if (options.angle !== undefined) {
    // Arbitrary angle
    angle = options.angle % 360;
    if (angle < 0) {
      angle += 360;
    }
  } else if (options.rotate270) {
    angle = 270;
  } else if (options.rotate180) {
    angle = 180;
  } else if (options.rotate90) {
    angle = 90;
  } else {
    // Default - no rotation
    angle = 0;
  }

  // Apply rotation
  if (angle !== 0) {
    image = image.rotate(angle);
  }

  // Apply format and get buffer
  const processedBuffer = await image
    .toFormat(format)
    .toBuffer();

  // Create directory if needed
  const fileDir = dirname(fullOutputPath);
  await mkdir(fileDir, { recursive: true });

  // Save image
  await writeFile(fullOutputPath, processedBuffer);

  // Get final dimensions
  const finalMetadata = await sharp(processedBuffer).metadata();

  return {
    filePath: fullOutputPath,
    format,
    width: finalMetadata.width!,
    height: finalMetadata.height!,
    angle,
  };
}

/**
 * Crop image by coordinates
 */
export async function cropImage(
  imagePath: string,
  outputPath: string,
  config: Config,
  options: {
    // Crop coordinates and sizes
    x: number;      // X coordinate of top-left corner
    y: number;      // Y coordinate of top-left corner
    width: number;  // Crop width
    height: number; // Crop height

    // Output file format
    format?: ImageFormat;
  }
): Promise<{
  filePath: string;
  format: ImageFormat;
  width: number;
  height: number;
  cropArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}> {
  const projectRootResult = await findProjectRoot(config.root);
  const fullImagePath = resolve(projectRootResult.root, imagePath);
  const fullOutputPath = resolve(projectRootResult.root, outputPath);

  // Check if source image exists
  const fs = await import('fs/promises');
  try {
    await fs.access(fullImagePath);
  } catch {
    throw new Error(`Source image not found: ${imagePath} (resolved to: ${fullImagePath})`);
  }

  // Determine output file format
  const format = determineFormat(outputPath as string, options.format as ImageFormat, config.defaultFormat as ImageFormat);

  // Read source image
  const imageBuffer = await readFile(fullImagePath);
  const image = sharp(imageBuffer);

  // Get source image dimensions
  const metadata = await image.metadata();
  const imageWidth = metadata.width!;
  const imageHeight = metadata.height!;

  // Validate coordinates and sizes
  const x = Math.max(0, Math.floor(options.x));
  const y = Math.max(0, Math.floor(options.y));
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));

  // Check if crop area does not exceed image boundaries
  if (x + width > imageWidth) {
    throw new Error(`Crop area exceeds image width: x(${x}) + width(${width}) > imageWidth(${imageWidth})`);
  }
  if (y + height > imageHeight) {
    throw new Error(`Crop area exceeds image height: y(${y}) + height(${height}) > imageHeight(${imageHeight})`);
  }

  // Apply crop
  const processedBuffer = await image
    .extract({
      left: x,
      top: y,
      width: width,
      height: height,
    })
    .toFormat(format)
    .toBuffer();

  // Create directory if needed
  const fileDir = dirname(fullOutputPath);
  await mkdir(fileDir, { recursive: true });

  // Save image
  await writeFile(fullOutputPath, processedBuffer);

  // Get final dimensions
  const finalMetadata = await sharp(processedBuffer).metadata();

  return {
    filePath: fullOutputPath,
    format,
    width: finalMetadata.width!,
    height: finalMetadata.height!,
    cropArea: {
      x,
      y,
      width,
      height,
    },
  };
}

