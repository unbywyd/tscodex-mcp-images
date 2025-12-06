# @tscodex/mcp-images

MCP (Model Context Protocol) server for comprehensive image processing, stock image search, and AI image generation. Built with TypeScript and Sharp for high-performance image manipulation.

**Built on [@tscodex/mcp-sdk](https://www.npmjs.com/package/@tscodex/mcp-sdk)** - This project uses the official TSCodex MCP SDK for server infrastructure, authentication, configuration management, and protocol handling.

---

## 🚀 Quick Links

<div align="center">

**[📦 MCP Manager](https://github.com/unbywyd/tscodex-mcp-manager-app)** | **[🌉 MCP Bridge](https://github.com/unbywyd/tscodex-mcp-manager-bridge)**

Desktop application for managing MCP servers | VS Code/Cursor extension bridge

</div>

---

## 🎯 What is This?

This is an **MCP server** built on the **[@tscodex/mcp-sdk](https://www.npmjs.com/package/@tscodex/mcp-sdk)** that provides powerful image processing capabilities. It can work in two ways:

1. **Standalone Mode**: Run directly via `npx` or `npm`, passing environment variables and configuration
2. **Managed Mode**: Use with **[MCP Manager](https://github.com/unbywyd/tscodex-mcp-manager-app)** for workspace isolation, visual configuration, and seamless integration with Cursor

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cursor (IDE Editor)                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         MCP Manager Bridge Extension                  │  │
│  │  - Auto-registers workspace                           │  │
│  │  - Syncs with MCP Manager                             │  │
│  │  - Updates Cursor mcp.json                            │  │
│  └───────────────────────────────────────────────────────┘  │
│                         │                                    │
│              HTTP API + WebSocket                            │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│              MCP Manager (Desktop App)                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  - Process Management                                  │  │
│  │  - Workspace Isolation (Proxy)                        │  │
│  │  - Visual Configuration UI                            │  │
│  │  - Secrets Management (3-level override)              │  │
│  │  - Permissions System                                 │  │
│  │  - AI Agent Proxy                                     │  │
│  │  - MCP Tools (Dynamic Server)                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                         │                                    │
│         ┌────────────────┴────────────────┐                  │
│         │                                 │                  │
│  ┌──────▼──────┐                  ┌──────▼──────┐          │
│  │ MCP Tools   │                  │ MCP Servers │          │
│  │ (Dynamic)   │                  │ (e.g. this) │          │
│  └──────┬──────┘                  └──────┬──────┘          │
│         │                                 │                  │
└─────────┼─────────────────────────────────┼──────────────────┘
          │                                 │
          └────────────┬────────────────────┘
                       │
          ┌────────────▼────────────┐
          │  @tscodex/mcp-sdk       │
          │  (Core SDK)              │
          └─────────────────────────┘
```

### How It Works

**The Problem**: Real projects require each Cursor workspace to work with its own workspace context. For example, this image server needs the root path of the current project to create and work with images. But you can't run a separate server instance for each project.

**The Solution**: **[MCP Manager](https://github.com/unbywyd/tscodex-mcp-manager-app)** allows you to:
- Run **one server instance** (e.g., `@tscodex/mcp-images`)
- Create **multiple workspace proxies** that forward requests with workspace context
- The SDK receives headers from the current workspace and allows one server to work with different workspaces

**The Bridge**: **[MCP Manager Bridge](https://github.com/unbywyd/tscodex-mcp-manager-bridge)** automatically:
- Registers the workspace in MCP Manager by project path
- Syncs Cursor with the manager
- Registers proxy MCP servers in local `mcp.json`
- Provides perfect encapsulation and connection between workspaces

---

## 🎨 Features

- 🖼️ **Image Processing**: Resize, crop, optimize, convert formats, apply filters, rotate, watermark
- 🔍 **Stock Image Search**: Search and download images from Pexels and Pixabay
- 🤖 **AI Image Generation**: Generate images using OpenAI DALL-E
- 🎨 **Color Extraction**: Extract dominant colors and generate color palettes
- 📦 **Multiple Formats**: Support for WebP, JPEG, PNG, AVIF
- ⚡ **High Performance**: Powered by Sharp for fast image processing

---

## 📦 Installation

### Option 1: Standalone (via npx)

```bash
npx @tscodex/mcp-images@latest
```

### Option 2: Global Installation

```bash
npm install -g @tscodex/mcp-images
```

### Option 3: Managed Mode (Recommended)

Use with **[MCP Manager](https://github.com/unbywyd/tscodex-mcp-manager-app)** for the best experience:

1. **Install MCP Manager**: Download from [GitHub Releases](https://github.com/unbywyd/tscodex-mcp-manager-app/releases)
2. **Install Bridge Extension**: [MCP Manager Bridge](https://marketplace.visualstudio.com/items?itemName=unbywyd.mcp-manager-bridge) from VS Code Marketplace
3. **Add Server**: In MCP Manager, add `@tscodex/mcp-images` as a new server
4. **Configure**: Use the visual UI to configure the server (JSON Schema-based)
5. **Enable**: Enable the server for your workspace in Cursor

**Benefits of Managed Mode:**
- ✅ **Visual Configuration**: No need to edit JSON files manually
- ✅ **Workspace Isolation**: Each project gets its own workspace proxy
- ✅ **Secure Secrets**: 3-level secret override (Global → Workspace → Server)
- ✅ **Permissions Control**: Granular control over what each server can access
- ✅ **AI Agent Integration**: Use AI agents without exposing API keys to servers
- ✅ **Token Statistics**: Track AI usage transparently
- ✅ **Auto-sync**: Bridge automatically syncs with Cursor

---

## 🚀 Quick Start

### Standalone Mode

```bash
# Start server with default settings
npx @tscodex/mcp-images@latest

# Server will start on port 3848 by default (host: 0.0.0.0)
# MCP endpoint: http://localhost:3848/mcp

# With custom host and port
npx @tscodex/mcp-images@latest --host 127.0.0.1 --port 3000

# With project root (REQUIRED for standalone mode)
npx @tscodex/mcp-images@latest --host 127.0.0.1 --port 4040 --root /path/to/project

# Get server metadata (for MCP Manager integration)
npx @tscodex/mcp-images@latest --meta
```

### Managed Mode

1. **Start MCP Manager** desktop application
2. **Open Cursor** with your project
3. **Bridge Extension** automatically:
   - Registers your workspace
   - Connects to MCP Manager
   - Syncs enabled servers to Cursor's `mcp.json`
4. **Enable Server**: Click the play icon on `@tscodex/mcp-images` in the Bridge panel
5. **Configure**: Use MCP Manager UI to configure the server (if needed)

---

## ⚙️ Configuration

### Configuration File

Create `.mcp-images.json` in your project root:

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

- `root` (string, optional): Project root directory
  - Use `"."` to use `MCP_PROJECT_ROOT` environment variable (managed mode)
  - Use absolute path for standalone mode
- `defaultProvider` (`"pexels"` | `"pixabay"` | `"openai"` | `"auto"`, default: `"auto"`): Default image provider
- `defaultFormat` (`"webp"` | `"jpeg"` | `"png"` | `"avif"`, default: `"webp"`): Default image format
- `defaultMaxWidth` (number, default: `1920`): Default maximum width (1-10000)
- `defaultQuality` (number, default: `80`): Default quality (1-100)
- `saveMetadata` (boolean, default: `true`): Save JSON metadata alongside images
- `embedExif` (boolean, default: `false`): Embed metadata in EXIF data

### Secrets Management

**⚠️ Security Note:** API keys are stored as **secrets** (environment variables with `SECRET_` prefix) instead of in configuration files.

**In Standalone Mode:**
```bash
export SECRET_PEXELS_API_KEY=your_pexels_api_key
export SECRET_PIXABAY_API_KEY=your_pixabay_api_key
export SECRET_OPENAI_API_KEY=your_openai_api_key
```

**In Managed Mode:**
MCP Manager provides a **3-level secret override system**:
1. **Global**: Secrets available to all servers
2. **Workspace**: Secrets specific to a workspace
3. **Server**: Secrets specific to a server instance

This allows fine-grained control over what secrets each server can access.

**Get API Keys:**
- **Pexels**: https://www.pexels.com/api/
- **Pixabay**: https://pixabay.com/api/docs/
- **OpenAI**: https://platform.openai.com/api-keys

---

## 🔒 Security & Permissions

### Security Features

**MCP Manager** provides enterprise-grade security:

1. **OS Keychain Storage**: Secrets are stored in the operating system's secure keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
2. **No Key Exposure**: API keys are never passed directly to MCP servers. Servers that need AI access use the AI Agent proxy mechanism
3. **Process Isolation**: Each server runs in its own process with isolated environment
4. **Permission System**: Granular control over what each server can access

### Permissions System

MCP Manager's permission system allows you to configure:

- **Environment Variables**: Which environment variables are available to the server
- **Secrets Access**: Which secrets the server can access
- **AI Agent Access**: Whether the server can use the AI Agent proxy
- **File System Access**: Workspace root access (always scoped to project)

**Example Permission Configuration:**
```json
{
  "envVars": ["NODE_ENV", "DEBUG"],
  "secrets": ["SECRET_PEXELS_API_KEY", "SECRET_PIXABAY_API_KEY"],
  "aiAgent": {
    "enabled": true,
    "allowedModels": ["gpt-4", "gpt-3.5-turbo"]
  }
}
```

---

## 🤖 AI Agent Integration

MCP Manager includes a built-in **AI Agent** that:

1. **Registers OpenAI-compatible APIs**: Configure via `baseUrl` and API key
2. **Provides Proxy**: Servers can use AI without direct API key access
3. **Token Statistics**: Track all AI usage transparently
4. **Permission-Based**: Each server must have AI Agent access enabled in permissions

**How It Works:**

1. **Register AI Provider** in MCP Manager:
   - Base URL: `https://api.openai.com/v1`
   - API Key: (stored securely in OS keychain)
   - Model: `gpt-4`, `gpt-3.5-turbo`, etc.

2. **Enable for Server**: In server permissions, enable AI Agent access

3. **Use in Server**: The SDK provides methods to access the AI Agent:
   ```typescript
   const aiResponse = await server.getAiAgent().chat({
     model: 'gpt-4',
     messages: [{ role: 'user', content: 'Generate image prompt' }]
   });
   ```

4. **Track Usage**: All token usage is tracked and displayed in MCP Manager

**Benefits:**
- ✅ No API keys exposed to servers
- ✅ Centralized AI usage tracking
- ✅ Easy to switch AI providers
- ✅ Cost monitoring

---

## 🛠️ Available Tools

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

---

## 📚 Example Usage

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

---

## 🔧 Environment Variables

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

---

## 🏗️ Built on @tscodex/mcp-sdk

This project is built on top of **[@tscodex/mcp-sdk](https://www.npmjs.com/package/@tscodex/mcp-sdk)**, which provides:

- ✅ **MCP Server Infrastructure**: HTTP transport, protocol handling, request routing
- ✅ **Authentication & Session Management**: Secure session handling
- ✅ **Configuration Loading**: CLI args, env vars, config files with priority system
- ✅ **Secrets Management**: `SECRET_*` environment variable handling
- ✅ **Workspace Context**: Automatic workspace root detection and header handling
- ✅ **AI Agent Integration**: Built-in support for AI Agent proxy
- ✅ **Type Safety**: Full TypeScript support with TypeBox schemas

**Key Features of the SDK:**
- Fast HTTP-based MCP server creation
- No database required - stateless design
- Works with or without MCP Manager
- Automatic workspace context from headers
- JSON Schema-based configuration

---

## 🧪 Development

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

# Get metadata (for MCP Manager)
npm run meta
```

---

## 📁 Project Structure

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

---

## 📋 Requirements

- Node.js >= 18.0.0
- API keys for providers (optional, but required for stock images and AI generation)

---

## 🔗 Related Projects

- **[MCP Manager](https://github.com/unbywyd/tscodex-mcp-manager-app)** - Desktop application for MCP server management
- **[MCP Manager Bridge](https://github.com/unbywyd/tscodex-mcp-manager-bridge)** - VS Code/Cursor extension bridge
- **[@tscodex/mcp-sdk](https://www.npmjs.com/package/@tscodex/mcp-sdk)** - SDK for building MCP servers
- **[MCP Images (this project)](https://github.com/unbywyd/tscodex-mcp-images)** - Image processing MCP server

---

## 📄 License

MIT

---

## 👤 Author

[unbywyd](https://github.com/unbywyd)

**Website**: [tscodex.com](https://tscodex.com)

---

## 🔗 Links

- **GitHub**: https://github.com/unbywyd/tscodex-mcp-images
- **NPM**: https://www.npmjs.com/package/@tscodex/mcp-images
- **Issues**: https://github.com/unbywyd/tscodex-mcp-images/issues
- **MCP SDK**: https://www.npmjs.com/package/@tscodex/mcp-sdk
- **MCP Manager**: https://github.com/unbywyd/tscodex-mcp-manager-app
- **MCP Bridge**: https://github.com/unbywyd/tscodex-mcp-manager-bridge
