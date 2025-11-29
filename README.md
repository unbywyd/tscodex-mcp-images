# @tscodex/mcp-images

MCP (Model Context Protocol) server for comprehensive image processing, stock image search, and AI image generation. Built with TypeScript and Sharp for high-performance image manipulation.

**Built on [@tscodex/mcp-sdk](https://www.npmjs.com/package/@tscodex/mcp-sdk)** - This project uses the official TSCodex MCP SDK for server infrastructure, authentication, configuration management, and protocol handling.

## Features

- 🖼️ **Image Processing**: Resize, crop, optimize, convert formats, apply filters, rotate, watermark
- 🔍 **Stock Image Search**: Search and download images from Pexels and Pixabay
- 🤖 **AI Image Generation**: Generate images using OpenAI DALL-E
- 🎨 **Color Extraction**: Extract dominant colors and generate color palettes
- 📦 **Multiple Formats**: Support for WebP, JPEG, PNG, AVIF
- ⚡ **High Performance**: Powered by Sharp for fast image processing

## Installation

```bash
npm install -g @tscodex/mcp-images
```

Or use with npx:

```bash
npx @tscodex/mcp-images
```

## Quick Start

### 1. Basic Usage

```bash
# Start server with default settings
npx @tscodex/mcp-images

# Server will start on port 3848 by default (host: 0.0.0.0)
# MCP endpoint: http://localhost:3848/mcp

# Start with custom host
npx @tscodex/mcp-images --host 127.0.0.1
# or
npx @tscodex/mcp-images --host=127.0.0.1
# or short form
npx @tscodex/mcp-images -h 127.0.0.1

# Start with custom port
npx @tscodex/mcp-images --port 3000
# or
npx @tscodex/mcp-images --port=3000
# or short form
npx @tscodex/mcp-images -p 3000

# Combine host and port
npx @tscodex/mcp-images --host 127.0.0.1 --port 3000

# Get server metadata (for Extension integration)
npx @tscodex/mcp-images --meta

# Or with npm scripts (from project directory):
npm start              # Start server
npm run meta           # Get metadata (recommended)
npm start -- --meta    # Alternative: use double dash to pass arguments
npm start -- --host 127.0.0.1 --port 3000  # With custom host and port
```

### 2. Configuration

Create a configuration file `.mcp-images.json` in your project root:

```json
{
  "root": ".",
  "defaultProvider": "pexels",
  "defaultFormat": "webp",
  "defaultMaxWidth": 1920,
  "defaultQuality": 80,
  "saveMetadata": true,
  "embedExif": false
}
```

**Configuration Options:**

- `root` (string, optional): Project root directory. 
  - Use `"."` to use `MCP_PROJECT_ROOT` environment variable (requires env var to be set)
  - Use absolute path (e.g., `"D:\\MyProjects\\my-project"` on Windows or `"/Users/username/my-project"` on macOS/Linux) for standalone server
  - **Important:** When running as standalone server via CLI, specify `root` via `--root` parameter or set `MCP_PROJECT_ROOT` env var
- `defaultProvider` (`"pexels"` | `"pixabay"` | `"openai"` | `"auto"`, default: `"auto"`): Default image provider for search
- `defaultFormat` (`"webp"` | `"jpeg"` | `"png"` | `"avif"`, default: `"webp"`): Default image format for processing
- `defaultMaxWidth` (number, default: `1920`): Default maximum width for images in pixels (1-10000)
- `defaultQuality` (number, default: `80`): Default quality for image compression (1-100)
- `saveMetadata` (boolean, default: `true`): Save JSON metadata file alongside images
- `embedExif` (boolean, default: `false`): Embed metadata in EXIF data via Sharp

### 3. API Keys (Secrets)

**⚠️ Security Note:** API keys are stored as **secrets** (environment variables with `SECRET_` prefix) instead of in the configuration file. This is more secure because:

- **Secrets are not committed to version control** - Configuration files (`.mcp-images.json`) can be accidentally committed to Git, exposing your API keys
- **Environment variables are process-scoped** - They exist only in the running process and are not persisted to disk
- **Better separation of concerns** - Configuration (settings) vs Secrets (credentials) are kept separate
- **Compliance with security best practices** - Follows the principle of never storing credentials in plain text files

API keys are provided via environment variables with `SECRET_` prefix:

```bash
# Pexels API key (for stock image search)
export SECRET_PEXELS_API_KEY=your_pexels_api_key

# Pixabay API key (for stock image search)
export SECRET_PIXABAY_API_KEY=your_pixabay_api_key

# OpenAI API key (for AI image generation)
export SECRET_OPENAI_API_KEY=your_openai_api_key

# OpenAI Organization ID (optional)
export SECRET_OPENAI_ORGANIZATION_ID=your_org_id
```

**Get API Keys:**

- **Pexels**: https://www.pexels.com/api/
- **Pixabay**: https://pixabay.com/api/docs/
- **OpenAI**: https://platform.openai.com/api-keys

### 4. Running with Configuration

**Important:** When running as a standalone server via CLI, you **must** specify the project root path using `--root` parameter or `MCP_PROJECT_ROOT` environment variable. This tells the server where your project files are located.

```bash
# With config file (root can be specified in config or via --root)
npx @tscodex/mcp-images

# With custom host (via CLI argument - takes precedence over env var)
npx @tscodex/mcp-images --host 127.0.0.1

# With custom port (via CLI argument - takes precedence over env var)
npx @tscodex/mcp-images --port 3000

# With custom host and port via environment variables
MCP_HOST=127.0.0.1 MCP_PORT=3000 npx @tscodex/mcp-images

# CLI arguments take precedence over environment variables
MCP_HOST=0.0.0.0 MCP_PORT=3848 npx @tscodex/mcp-images --host 127.0.0.1 --port 3000
# Will use host=127.0.0.1, port=3000

# With project root via CLI (RECOMMENDED for standalone server)
# Windows:
npx @tscodex/mcp-images --host 127.0.0.1 --port 4040 --root D:\MyProjects\my-project
# macOS/Linux:
npx @tscodex/mcp-images --host 127.0.0.1 --port 4040 --root /Users/username/my-project

# With project root via environment variable
# Windows (PowerShell):
$env:MCP_PROJECT_ROOT="D:\MyProjects\my-project"; npx @tscodex/mcp-images --host 127.0.0.1 --port 4040
# Windows (CMD):
set MCP_PROJECT_ROOT=D:\MyProjects\my-project && npx @tscodex/mcp-images --host 127.0.0.1 --port 4040
# macOS/Linux:
MCP_PROJECT_ROOT=/Users/username/my-project npx @tscodex/mcp-images --host 127.0.0.1 --port 4040

# Using npm scripts (from project directory):
# Windows:
npm run start -- --host=127.0.0.1 --port=4040 --root=D:\MyProjects\my-project
# macOS/Linux:
npm run start -- --host=127.0.0.1 --port=4040 --root=/Users/username/my-project

# With API keys
SECRET_PEXELS_API_KEY=your_key \
SECRET_PIXABAY_API_KEY=your_key \
npx @tscodex/mcp-images

# With CLI arguments
npx @tscodex/mcp-images --default-provider pexels --default-format webp

# With custom config file
npx @tscodex/mcp-images --config /path/to/config.json
```

### 5. Environment Variables

All environment variables are optional with sensible defaults:

```bash
# Server settings
MCP_PORT=3848              # Server port (default: 3848)
MCP_HOST=0.0.0.0          # Server host (default: 0.0.0.0)
MCP_PATH=/mcp             # MCP endpoint path (default: /mcp)
MCP_PROJECT_ROOT=/path     # Project root directory

# Configuration (alternative to config file)
DEFAULT_PROVIDER=pexels
DEFAULT_FORMAT=webp
DEFAULT_MAX_WIDTH=1920
DEFAULT_QUALITY=80
SAVE_METADATA=true
EMBED_EXIF=false

# API Keys (required for stock images and AI generation)
SECRET_PEXELS_API_KEY=your_key
SECRET_PIXABAY_API_KEY=your_key
SECRET_OPENAI_API_KEY=your_key
SECRET_OPENAI_ORGANIZATION_ID=your_org_id
```

## Available Tools

### Image Processing

- `image_process_local` - Process local image: resize, crop, convert format, optimize
- `image_analyze` - Analyze local image: dimensions, format, file size, metadata
- `image_optimize` - Automatically optimize local image: compress, convert to best format
- `image_create_placeholder` - Create placeholder image with dimensions displayed
- `image_create_favicon` - Create favicon from image (multiple sizes)
- `image_add_watermark` - Add watermark to image (text or image)
- `image_apply_filters` - Apply filters: blur, sharpen, grayscale, sepia, brightness, contrast
- `image_rotate` - Rotate image by specified angle
- `image_crop_custom` - Crop image by exact coordinates

### Stock Images

- `images_provider_status` - Check status of image providers
- `stock_images_search` - Search for images from Pexels or Pixabay
- `stock_images_download_to_project` - Download and save image from provider to project

### AI Generation

- `ai_generate_image` - Generate image using OpenAI DALL-E

### Color Extraction

- `image_extract_colors_local` - Extract dominant colors and color palette from local image
- `generate_color_palette_image` - Generate visual color palette image from local image

## Example Usage

### Example 1: Search and Download Stock Image

```bash
# 1. Search for images
# Tool: stock_images_search
# Query: "cozy coffee shop interior"

# 2. Download image to project
# Tool: stock_images_download_to_project
# Photo ID: 123456
# Target Path: public/images/hero.webp
# Format: webp
# Max Width: 1920
```

### Example 2: Process Local Image

```bash
# Tool: image_process_local
# Image Path: public/images/photo.jpg
# Output Path: public/images/photo-optimized.webp
# Format: webp
# Max Width: 1920
# Quality: 85
```

### Example 3: Generate AI Image

```bash
# Tool: ai_generate_image
# Prompt: "a cozy coffee shop interior with warm lighting"
# Size: large (1024x1024px)
# Target Path: public/images/generated.webp
# Format: webp
```

### Example 4: Extract Colors

```bash
# Tool: image_extract_colors_local
# Image Path: public/images/hero.webp

# Returns:
# - Dominant color (HEX, RGB)
# - Color palette (vibrant, muted, dark/light variants)
# - Visual palette image
```

## Configuration Priority

Configuration is loaded from multiple sources with the following priority:

1. **CLI Arguments** (highest priority)
   ```bash
   npx @tscodex/mcp-images --default-provider pexels
   ```

2. **Environment Variables**
   ```bash
   DEFAULT_PROVIDER=pexels npx @tscodex/mcp-images
   ```

3. **Config File** (`.mcp-images.json`)
   ```json
   {
     "defaultProvider": "pexels"
   }
   ```

4. **Schema Defaults** (lowest priority)
   - Defined in TypeBox schema

## Development

This project is built on top of [@tscodex/mcp-sdk](https://www.npmjs.com/package/@tscodex/mcp-sdk), which provides:
- MCP server infrastructure and protocol handling
- Authentication and session management
- Configuration loading (CLI args, env vars, config files)
- Secrets management (SECRET_* environment variables)
- HTTP transport and request handling

```bash
# Clone repository
git clone https://github.com/unbywyd/tscodex-mcp-images.git
cd tscodex-mcp-images

# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Run production build
npm start
```

## Project Structure

```
cursor-stock-images-mcp-v2/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Server setup
│   ├── config.ts             # Configuration schema
│   ├── config-loader.ts      # Config loading logic
│   ├── tools/                # MCP tools
│   │   ├── image-processing.ts
│   │   ├── stock-images.ts
│   │   ├── ai-generation.ts
│   │   └── color-extraction.ts
│   ├── providers/            # Image providers
│   │   ├── pexels.ts
│   │   ├── pixabay.ts
│   │   └── openai.ts
│   ├── image-processor.ts    # Image processing logic
│   ├── color-extractor.ts    # Color extraction logic
│   └── utils.ts              # Utilities
├── dist/                     # Compiled JavaScript
├── package.json
└── README.md
```

## Requirements

- Node.js >= 18.0.0
- API keys for providers (optional, but required for stock images and AI generation)

## License

MIT

## Author

[unbywyd](https://github.com/unbywyd)

## Links

- **GitHub**: https://github.com/unbywyd/tscodex-mcp-images
- **NPM**: https://www.npmjs.com/package/@tscodex/mcp-images
- **Issues**: https://github.com/unbywyd/tscodex-mcp-images/issues
- **MCP SDK**: https://www.npmjs.com/package/@tscodex/mcp-sdk
