# Gemini Nano Banana MCP

An MCP (Model Context Protocol) server for AI-powered image generation, editing, and **video generation** using Google Gemini and Veo. Works with Claude Code, Cursor, and any MCP-compatible client.

## Features

- **Text-to-Image Generation** - Generate images from text prompts via Gemini AI
- **Image Editing** - Edit existing images with natural language instructions
- **Reference Images** - Use reference images for style and content guidance
- **Text-to-Video Generation** - Generate videos from text prompts using Veo (veo-3.1, veo-3, veo-2)
- **Image-to-Video** - Use an image as the first frame for video generation
- **First & Last Frame Interpolation** - Generate videos between two keyframe images
- **Session Memory** - Continue editing the last image without re-specifying the path
- **Configurable Models** - Choose any Gemini model for images, any Veo model for videos
- **Media History** - Track and browse recently generated images and videos
- **Cross-Platform** - Works on macOS, Windows, and Linux

## Quick Start

### 1. Get a Gemini API Key

Get your free API key from [Google AI Studio](https://aistudio.google.com/apikey).

### 2. Install

```bash
npm install -g @seungmanchoi/nano-banana-mcp
```

Or install from source:

```bash
git clone https://github.com/seungmanchoi/nano-banana-mcp.git
cd nano-banana-mcp
npm install
npm run build
```

### 3. Configure Your MCP Client

#### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "nano-banana": {
      "command": "npx",
      "args": ["-y", "@seungmanchoi/nano-banana-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### Cursor

Add to your MCP settings:

```json
{
  "mcpServers": {
    "nano-banana": {
      "command": "npx",
      "args": ["-y", "@seungmanchoi/nano-banana-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### From Source

If installed from source, use the absolute path:

```json
{
  "mcpServers": {
    "nano-banana": {
      "command": "node",
      "args": ["/absolute/path/to/nano-banana-mcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

> You can also skip the `env` field and configure the API key at runtime using the `configure_api_key` tool.

## Model Configuration

### Image Models

The default image model is `gemini-2.5-flash`. You can change it in several ways:

#### Option 1: Environment Variable

Set `GEMINI_MODEL` in your MCP client config:

```json
{
  "mcpServers": {
    "nano-banana": {
      "command": "npx",
      "args": ["-y", "@seungmanchoi/nano-banana-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here",
        "GEMINI_MODEL": "gemini-2.0-flash-exp"
      }
    }
  }
}
```

#### Option 2: Runtime Tool

Use the `configure_model` tool to change the default model at runtime. The setting persists across sessions in `~/.nano-banana/config.json`.

```
Set the model to gemini-2.5-pro
```

#### Option 3: Per-Request Override

Pass the `model` parameter directly to `generate_image`, `edit_image`, or `continue_editing` to override the default for a single request:

```
Generate an image of a cat using model gemini-2.0-flash-exp
```

### Model Priority

1. **Per-request `model` parameter** (highest priority)
2. **`GEMINI_MODEL` environment variable**
3. **Config file** (`~/.nano-banana/config.json`)
4. **Default**: `gemini-2.5-flash`

### Available Image Models

| Model | Description |
|-------|-------------|
| `gemini-2.5-flash` | Default. Fast, stable, and capable. |
| `gemini-2.5-flash-image` | Optimized for image generation. Fast, high-volume tasks. |
| `gemini-2.5-pro` | Higher quality, slower. |
| `gemini-3-pro-image-preview` | Best quality. Reasoning-enhanced composition, legible text rendering, up to 14 reference images. |
| `gemini-2.0-flash-exp` | Legacy model (retiring March 31, 2026). |

### Available Video Models

| Model | Description |
|-------|-------------|
| `veo-3.1-generate-preview` | Latest. Native audio, scene extension, reference images, 4K support. |
| `veo-3-generate-preview` | Previous generation with audio support. |
| `veo-2-generate-preview` | Older generation, stable. |

> For the latest list of models, see [Google AI documentation](https://ai.google.dev/gemini-api/docs/models).

## Tools

### Image Tools

| Tool | Description |
|------|-------------|
| `configure_api_key` | Set or update the Gemini API key. Persists across sessions. |
| `configure_model` | Set the default Gemini model for images. Persists across sessions. |
| `generate_image` | Generate a new image from a text description. Supports optional `model` override. |
| `edit_image` | Edit an existing image with text instructions, optional reference images, and optional `model` override. |
| `continue_editing` | Continue editing the last generated/edited image in the session. Supports optional `model` override. |
| `list_history` | List recently generated and edited images with prompts and timestamps. |

### Video Tools

| Tool | Description |
|------|-------------|
| `generate_video` | Generate a video from a text prompt. Supports text-to-video, image-to-video, and frame interpolation. |
| `list_video_history` | List recently generated videos with prompts, models, and timestamps. |

### Utility Tools

| Tool | Description |
|------|-------------|
| `get_status` | Check configuration status, active models, output directories, and last image/video info. |

## Usage Examples

### Image Generation

```
Generate an image of a sunset over mountains with a lake reflection
```

```
Edit the image at ~/nano-banana-images/gen_2025-01-01.png to add a boat on the lake
```

```
Continue editing - make the sky more vibrant with orange and pink tones
```

### Video Generation

```
Generate a video of ocean waves crashing on a rocky shore at sunset
```

```
Generate a video of a cat playing with yarn, model veo-3.1-generate-preview, resolution 1080p, duration 8 seconds
```

#### Image-to-Video (First Frame)

```
Generate a video starting from the image at ~/nano-banana-images/gen_2025-01-01.png showing the scene coming to life with wind blowing through the trees
```

#### First + Last Frame Interpolation

```
Generate a video transitioning from the image at ~/images/start.png to ~/images/end.png with a smooth camera pan
```

#### Portrait Video

```
Generate a video of a person walking through a garden, aspect ratio 9:16
```

### History & Status

```
Show me the last 5 images I generated
```

```
Show me recent video history
```

```
Check the current status
```

```
Switch to gemini-2.5-pro model for higher quality
```

## Video Generation Details

### Configuration Options

| Parameter | Options | Default | Description |
|-----------|---------|---------|-------------|
| `model` | `veo-3.1-generate-preview`, `veo-3-generate-preview`, `veo-2-generate-preview` | `veo-3.1-generate-preview` | Veo model to use |
| `aspectRatio` | `16:9`, `9:16` | `16:9` | Landscape or portrait |
| `resolution` | `720p`, `1080p`, `4k` | `720p` | Output resolution |
| `durationSeconds` | `4`, `6`, `8` (number) | Varies by model | Video length |
| `numberOfVideos` | `1`+ | `1` | Number of variants |
| `negativePrompt` | Any text | - | Elements to avoid |

### Generation Modes

1. **Text-to-Video**: Provide only a `prompt`
2. **Image-to-Video**: Provide `prompt` + `imagePath` (used as first frame)
3. **Frame Interpolation**: Provide `prompt` + `imagePath` (first frame) + `lastFramePath` (last frame)

### Important Notes

- Video generation takes **1-6 minutes** depending on load
- Generated videos are saved as `.mp4` files
- Videos are watermarked with SynthID technology
- Pricing: $0.75 per second of generated video
- Videos are retained on Google servers for 2 days after generation

## API Key Configuration

The server loads the API key in the following priority order:

1. **Environment variable** - `GEMINI_API_KEY`
2. **Config file** - `~/.nano-banana/config.json`
3. **Runtime** - via the `configure_api_key` tool

## File Storage

### Images

| Platform | Path |
|----------|------|
| macOS / Linux | `~/nano-banana-images/` |
| Windows | `Documents\nano-banana-images\` |

### Videos

| Platform | Path |
|----------|------|
| macOS / Linux | `~/nano-banana-videos/` |
| Windows | `Documents\nano-banana-videos\` |

## Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server setup and request routing
├── config/
│   └── settings.ts       # API key and model management
├── services/
│   ├── gemini.ts         # Google Gemini & Veo API client
│   └── storage.ts        # Image/video file I/O and history tracking
├── tools/
│   ├── definitions.ts    # MCP tool schemas
│   └── handlers.ts       # Tool request handlers
└── types/
    └── index.ts          # TypeScript type definitions
```

## Development

```bash
npm run dev          # Run with tsx (no build needed)
npm run build        # Compile TypeScript
npm run typecheck    # Type check without emitting
npm run lint         # Run ESLint
```

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript (strict mode, ES2022)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **AI Models**: Google Gemini (images) + Veo (videos)
- **Validation**: Zod

## License

MIT
