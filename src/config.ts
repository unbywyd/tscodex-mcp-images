import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { EImageProvider, ImageFormat } from './types.js';

/**
 * TypeBox schema for server configuration.
 * API keys are NOT included here (security - they are loaded separately).
 * 
 * We keep the full schema type internal (`RawConfigSchema`) so that
 * generated .d.ts files don't depend on TypeBox internals from the SDK.
 */
const RawConfigSchema = Type.Object({
  root: Type.Optional(Type.String({
    description: 'Project root directory (use "." to use MCP_PROJECT_ROOT env var)'
  })),
  defaultProvider: Type.String({
    enum: ['pexels', 'pixabay', 'openai', 'auto'],
    default: 'auto',
    description: 'Default image provider for search (auto will use available provider)'
  }),
  defaultMaxWidth: Type.Number({
    default: 1920,
    minimum: 1,
    maximum: 10000,
    description: 'Default maximum width for images in pixels'
  }),
  defaultQuality: Type.Number({
    default: 100,
    minimum: 1,
    maximum: 100,
    description: 'Default quality for image compression (1-100)'
  }),
  defaultFormat: Type.String({
    enum: ['webp', 'jpeg', 'png', 'avif'],
    default: 'webp',
    description: 'Default image format for processing'
  }),
  saveMetadata: Type.Boolean({
    default: true,
    description: 'Save JSON metadata file alongside images'
  }),
  embedExif: Type.Boolean({
    default: false,
    description: 'Embed metadata in EXIF data via Sharp'
  })
});

export type Config = Static<typeof RawConfigSchema>;

// Public schema type for SDK – expose only generic `TSchema`
export const ConfigSchema: TSchema = RawConfigSchema;

