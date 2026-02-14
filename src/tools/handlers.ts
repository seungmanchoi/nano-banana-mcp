import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { settingsManager } from '../config/index.js';
import { geminiService } from '../services/gemini.js';
import { storageService } from '../services/storage.js';
import { IImageRecord } from '../types/index.js';

let lastImagePath: string | null = null;

function textResponse(text: string, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

export async function handleConfigureApiKey(args: { apiKey: string }): Promise<CallToolResult> {
  try {
    await settingsManager.setApiKey(args.apiKey);
    geminiService.configure(args.apiKey);
    return textResponse('API key configured successfully. You can now generate and edit images.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to configure API key';
    return textResponse(msg, true);
  }
}

export async function handleConfigureModel(args: { model: string }): Promise<CallToolResult> {
  try {
    await settingsManager.setModel(args.model);
    return textResponse(`Model set to: ${args.model}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to configure model';
    return textResponse(msg, true);
  }
}

export async function handleGenerateImage(args: { prompt: string; model?: string }): Promise<CallToolResult> {
  ensureReady();

  try {
    const result = await geminiService.generateImage(args.prompt, args.model);

    if (result.savedPath) {
      lastImagePath = result.savedPath;
      await storageService.appendHistory({
        filePath: result.savedPath,
        prompt: args.prompt,
        createdAt: new Date().toISOString(),
        type: 'generated',
      });
    }

    return { content: result.contents };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image generation failed';
    return textResponse(`Generation error: ${msg}`, true);
  }
}

export async function handleEditImage(args: {
  imagePath: string;
  prompt: string;
  referenceImages?: string[];
  model?: string;
}): Promise<CallToolResult> {
  ensureReady();

  try {
    const result = await geminiService.editImage(args.imagePath, args.prompt, args.referenceImages, args.model);

    if (result.savedPath) {
      lastImagePath = result.savedPath;
      await storageService.appendHistory({
        filePath: result.savedPath,
        prompt: args.prompt,
        createdAt: new Date().toISOString(),
        type: 'edited',
      });
    }

    return { content: result.contents };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image editing failed';
    return textResponse(`Edit error: ${msg}`, true);
  }
}

export async function handleContinueEditing(args: {
  prompt: string;
  referenceImages?: string[];
  model?: string;
}): Promise<CallToolResult> {
  if (!lastImagePath) {
    return textResponse(
      'No previous image in this session. Use generate_image or edit_image first.',
      true,
    );
  }

  return handleEditImage({
    imagePath: lastImagePath,
    prompt: args.prompt,
    referenceImages: args.referenceImages,
    model: args.model,
  });
}

export async function handleGetStatus(): Promise<CallToolResult> {
  const configStatus = settingsManager.getStatusMessage();
  const outputDir = storageService.getOutputDirectory();
  const currentModel = settingsManager.getModel();

  const lines = [
    '=== Nano Banana MCP Status ===',
    '',
    `Configuration: ${configStatus}`,
    `Model: ${currentModel}`,
    `Output directory: ${outputDir}`,
    `Last image: ${lastImagePath ?? 'None (no images in this session)'}`,
  ];

  if (lastImagePath) {
    const info = await storageService.getImageInfo(lastImagePath);
    if (info) {
      lines.push(`  Size: ${(info.size / 1024).toFixed(1)} KB`);
      lines.push(`  Modified: ${info.modified}`);
    }
  }

  return textResponse(lines.join('\n'));
}

export async function handleListHistory(args: { count?: number }): Promise<CallToolResult> {
  const count = Math.min(Math.max(args.count ?? 10, 1), 50);
  const records: IImageRecord[] = await storageService.listRecentImages(count);

  if (records.length === 0) {
    return textResponse('No image history found.');
  }

  const lines = [`=== Recent Images (${records.length}) ===`, ''];

  for (const record of records) {
    const tag = record.type === 'generated' ? '[GEN]' : '[EDIT]';
    lines.push(`${tag} ${record.createdAt}`);
    lines.push(`  Path: ${record.filePath}`);
    lines.push(`  Prompt: ${record.prompt.substring(0, 80)}${record.prompt.length > 80 ? '...' : ''}`);
    lines.push('');
  }

  return textResponse(lines.join('\n'));
}

function ensureReady(): void {
  if (!geminiService.isConfigured()) {
    throw new Error(settingsManager.getStatusMessage());
  }
}
