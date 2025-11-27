import { Vibrant } from 'node-vibrant/node';
import sharp from 'sharp';

/**
 * Color extraction result
 */
export interface ColorExtractionResult {
  dominant: {
    rgb: string;
    hex: string;
    rgbArray: [number, number, number];
  };
  palette: {
    vibrant?: {
      rgb: string;
      hex: string;
      rgbArray: [number, number, number];
    };
    muted?: {
      rgb: string;
      hex: string;
      rgbArray: [number, number, number];
    };
    darkVibrant?: {
      rgb: string;
      hex: string;
      rgbArray: [number, number, number];
    };
    lightVibrant?: {
      rgb: string;
      hex: string;
      rgbArray: [number, number, number];
    };
    darkMuted?: {
      rgb: string;
      hex: string;
      rgbArray: [number, number, number];
    };
    lightMuted?: {
      rgb: string;
      hex: string;
      rgbArray: [number, number, number];
    };
  };
  allColors: Array<{
    name: string;
    rgb: string;
    hex: string;
    rgbArray: [number, number, number];
  }>;
}

/**
 * Normalize RGB array (rounds to integers and limits range 0-255)
 */
function normalizeRgb(rgb: [number, number, number]): [number, number, number] {
  return [
    Math.round(Math.max(0, Math.min(255, rgb[0]))),
    Math.round(Math.max(0, Math.min(255, rgb[1]))),
    Math.round(Math.max(0, Math.min(255, rgb[2])))
  ];
}

/**
 * Convert RGB array to string
 * Rounds values to integers
 */
function rgbToString(rgb: [number, number, number]): string {
  const normalized = normalizeRgb(rgb);
  return `rgb(${normalized[0]}, ${normalized[1]}, ${normalized[2]})`;
}

/**
 * Convert RGB array to HEX (uppercase for readability)
 * Rounds values to integers for correct HEX format
 */
function rgbToHex(rgb: [number, number, number]): string {
  const normalized = normalizeRgb(rgb);
  return `#${normalized[0].toString(16).padStart(2, '0')}${normalized[1].toString(16).padStart(2, '0')}${normalized[2].toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Extract colors from image
 */
export async function extractColors(imageBuffer: Buffer): Promise<ColorExtractionResult> {
  try {
    // Check image format and convert WEBP/AVIF to PNG for node-vibrant
    // node-vibrant doesn't support WEBP and AVIF directly
    let processedBuffer = imageBuffer;
    const metadata = await sharp(imageBuffer).metadata();
    const format = metadata.format?.toLowerCase();
    
    // Convert WEBP or AVIF to PNG for node-vibrant
    if (format === 'webp' || format === 'avif') {
      processedBuffer = await sharp(imageBuffer)
        .png()
        .toBuffer();
    }
    
    const vibrant = Vibrant.from(processedBuffer);
    const palette = await vibrant.getPalette();

    // Determine dominant color (Vibrant or first available)
    const dominantColor = palette.Vibrant || palette.Muted || palette.DarkVibrant || palette.LightVibrant || palette.DarkMuted || palette.LightMuted;
    
    if (!dominantColor) {
      throw new Error('Could not extract colors from image');
    }

    const dominantRgb = normalizeRgb(dominantColor.rgb as [number, number, number]);

    // Build palette
    const result: ColorExtractionResult = {
      dominant: {
        rgb: rgbToString(dominantRgb),
        hex: rgbToHex(dominantRgb),
        rgbArray: dominantRgb,
      },
      palette: {},
      allColors: [],
    };

    // Add all available colors to palette
    const colorMap: Array<{ key: string; name: string }> = [
      { key: 'Vibrant', name: 'Vibrant' },
      { key: 'Muted', name: 'Muted' },
      { key: 'DarkVibrant', name: 'Dark Vibrant' },
      { key: 'LightVibrant', name: 'Light Vibrant' },
      { key: 'DarkMuted', name: 'Dark Muted' },
      { key: 'LightMuted', name: 'Light Muted' },
    ];

    for (const { key, name } of colorMap) {
      const color = (palette as any)[key];
      if (color) {
        const rgb = normalizeRgb(color.rgb as [number, number, number]);
        const colorData = {
          rgb: rgbToString(rgb),
          hex: rgbToHex(rgb),
          rgbArray: rgb,
        };

        // Add to palette
        if (key === 'Vibrant') result.palette.vibrant = colorData;
        else if (key === 'Muted') result.palette.muted = colorData;
        else if (key === 'DarkVibrant') result.palette.darkVibrant = colorData;
        else if (key === 'LightVibrant') result.palette.lightVibrant = colorData;
        else if (key === 'DarkMuted') result.palette.darkMuted = colorData;
        else if (key === 'LightMuted') result.palette.lightMuted = colorData;

        // Add to all colors list
        result.allColors.push({
          name,
          ...colorData,
        });
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Failed to extract colors: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate visual color palette via Sharp
 */
export async function generateColorPaletteImage(colors: ColorExtractionResult): Promise<Buffer> {
  // Build color list with numbers and names
  const colorsToShow: Array<{
    hex: string;
    rgb: string;
    rgbArray: [number, number, number];
    name: string;
    number: number;
  }> = [
    { ...colors.dominant, name: 'Dominant', number: 1 },
    ...colors.allColors.map((color, index) => ({ ...color, number: index + 2 }))
  ];
  
  const colorCount = colorsToShow.length;
  
  // Palette dimensions (vertical layout - one color per row)
  // Increased sizes for better visibility
  const swatchWidth = 200;
  const swatchHeight = 80;
  const rowHeight = 100; // Height of one row (color + padding)
  const padding = 20;
  const itemSpacing = 20; // Distance between elements (number + HEX + rectangle)
  
  // Calculate width: number + HEX + rectangle + padding
  const numberWidth = 40;
  const hexWidth = 150; // Increased for large HEX codes
  const totalWidth = numberWidth + hexWidth + swatchWidth + itemSpacing * 3 + padding * 2;
  const totalHeight = rowHeight * colorCount + padding * 2 + 50; // +50 for header
  
  // Create SVG with palette
  let svg = `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Background
  svg += `<rect width="${totalWidth}" height="${totalHeight}" fill="#ffffff"/>`;
  
  // Header
  svg += `<text x="${totalWidth / 2}" y="35" font-family="Arial, sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#333">Color Palette</text>`;
  
  // Draw color swatches vertically (one color per row)
  colorsToShow.forEach((color, index) => {
    const x = padding;
    const y = 60 + index * rowHeight;
    
    // Number
    svg += `<text x="${x}" y="${y + swatchHeight / 2 + 6}" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="start" fill="#333">${color.number}</text>`;
    
    // HEX code (increased size for better visibility)
    svg += `<text x="${x + numberWidth + itemSpacing}" y="${y + swatchHeight / 2 + 6}" font-family="Arial, sans-serif" font-size="22" font-weight="bold" text-anchor="start" fill="#333">${color.hex}</text>`;
    
    // Color rectangle (increased size for better visibility)
    const swatchX = x + numberWidth + hexWidth + itemSpacing * 2;
    svg += `<rect x="${swatchX}" y="${y}" width="${swatchWidth}" height="${swatchHeight}" fill="${color.hex}" stroke="#ddd" stroke-width="2" rx="6"/>`;
  });
  
  svg += `</svg>`;
  
  // Convert SVG to PNG via Sharp with maximum quality
  const imageBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 100, compressionLevel: 0 })
    .toBuffer();
  
  return imageBuffer;
}

/**
 * Determine contrast color (white or black) for text on background
 */
function getContrastColor(rgb: [number, number, number]): string {
  // Calculate luminance using W3C formula
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

