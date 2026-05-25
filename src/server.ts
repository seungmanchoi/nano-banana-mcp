import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { settingsManager } from './config/index.js';
import { geminiService } from './services/gemini.js';
import {
  TOOLS,
  handleConfigureApiKey,
  handleConfigureModel,
  handleGenerateImage,
  handleEditImage,
  handleContinueEditing,
  handleGenerateVideo,
  handleListVideoHistory,
  handleGetStatus,
  handleListHistory,
} from './tools/index.js';
import { IGenerateVideoParams } from './types/index.js';

export class NanoBananaServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'nano-banana-mcp', version: '1.1.0' },
      { capabilities: { tools: {} } },
    );

    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [...TOOLS],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'configure_api_key':
            return await handleConfigureApiKey(args as { apiKey: string });

          case 'configure_model':
            return await handleConfigureModel(args as { model: string; quality?: string });

          case 'generate_image':
            return await handleGenerateImage(args as { prompt: string; model?: string; quality?: string });

          case 'edit_image':
            return await handleEditImage(
              args as { imagePath: string; prompt: string; referenceImages?: string[]; model?: string; quality?: string },
            );

          case 'continue_editing':
            return await handleContinueEditing(
              args as { prompt: string; referenceImages?: string[]; model?: string; quality?: string },
            );

          case 'generate_video':
            return await handleGenerateVideo(args as unknown as IGenerateVideoParams);

          case 'list_video_history':
            return await handleListVideoHistory(args as { count?: number });

          case 'get_status':
            return await handleGetStatus();

          case 'list_history':
            return await handleListHistory(args as { count?: number });

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (err) {
        if (err instanceof McpError) throw err;

        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        throw new McpError(ErrorCode.InternalError, message);
      }
    });
  }

  async start(): Promise<void> {
    await settingsManager.load();

    const config = settingsManager.getConfig();
    if (config) {
      geminiService.configure(config.geminiApiKey);
      console.error(`[nano-banana] Configured from ${settingsManager.getSource()}, model: ${settingsManager.getModel()}`);
    } else {
      console.error('[nano-banana] No API key found. Use configure_api_key tool to set one.');
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[nano-banana] MCP server running on stdio');
  }
}
