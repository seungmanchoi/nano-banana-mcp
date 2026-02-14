# Gemini Nano Banana MCP

An MCP (Model Context Protocol) server for AI-powered image generation and editing using Google Gemini. Works with Claude Code, Cursor, and any MCP-compatible client.

## Features

- **Text-to-Image Generation** - Generate images from text prompts via Gemini AI
- **Image Editing** - Edit existing images with natural language instructions
- **Reference Images** - Use reference images for style and content guidance
- **Session Memory** - Continue editing the last image without re-specifying the path
- **Configurable Model** - Choose any Gemini model (default: `gemini-2.5-flash`)
- **Image History** - Track and browse recently generated/edited images
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

The default model is `gemini-2.5-flash`. You can change it in several ways:

### Option 1: Environment Variable

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

### Option 2: Runtime Tool

Use the `configure_model` tool to change the default model at runtime. The setting persists across sessions in `~/.nano-banana/config.json`.

```
Set the model to gemini-2.5-pro
```

### Option 3: Per-Request Override

Pass the `model` parameter directly to `generate_image`, `edit_image`, or `continue_editing` to override the default for a single request:

```
Generate an image of a cat using model gemini-2.0-flash-exp
```

### Model Priority

1. **Per-request `model` parameter** (highest priority)
2. **`GEMINI_MODEL` environment variable**
3. **Config file** (`~/.nano-banana/config.json`)
4. **Default**: `gemini-2.5-flash`

### Available Models

| Model | Description |
|-------|-------------|
| `gemini-2.5-flash` | Default. Fast, stable, and capable. |
| `gemini-2.5-pro` | Higher quality, slower. |
| `gemini-2.0-flash-exp` | Legacy model (retiring March 2026). |

> For the latest list of models that support image generation, see [Google AI documentation](https://ai.google.dev/gemini-api/docs/models).

## Tools

| Tool | Description |
|------|-------------|
| `configure_api_key` | Set or update the Gemini API key. Persists across sessions. |
| `configure_model` | Set the default Gemini model. Persists across sessions. |
| `generate_image` | Generate a new image from a text description. Supports optional `model` override. |
| `edit_image` | Edit an existing image with text instructions, optional reference images, and optional `model` override. |
| `continue_editing` | Continue editing the last generated/edited image in the session. Supports optional `model` override. |
| `get_status` | Check configuration status, active model, output directory, and last image info. |
| `list_history` | List recently generated and edited images with prompts and timestamps. |

## Usage Examples

Once the MCP server is connected, you can use natural language in your MCP client:

```
Generate an image of a sunset over mountains with a lake reflection
```

```
Edit the image at ~/nano-banana-images/gen_2025-01-01.png to add a boat on the lake
```

```
Continue editing - make the sky more vibrant with orange and pink tones
```

```
Show me the last 5 images I generated
```

```
Switch to gemini-2.5-pro model for higher quality
```

## API Key Configuration

The server loads the API key in the following priority order:

1. **Environment variable** - `GEMINI_API_KEY`
2. **Config file** - `~/.nano-banana/config.json`
3. **Runtime** - via the `configure_api_key` tool

## Image Storage

Generated and edited images are automatically saved to:

| Platform | Path |
|----------|------|
| macOS / Linux | `~/nano-banana-images/` |
| Windows | `Documents\nano-banana-images\` |

## Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server setup and request routing
├── config/
│   └── settings.ts       # API key and model management
├── services/
│   ├── gemini.ts         # Google Gemini API client
│   └── storage.ts        # Image file I/O and history tracking
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
- **AI Model**: Google Gemini (configurable, default: `gemini-2.5-flash`)
- **Validation**: Zod

## License

MIT
