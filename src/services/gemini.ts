import { GoogleGenAI } from '@google/genai';
import { TextContent, ImageContent } from '@modelcontextprotocol/sdk/types.js';
import { settingsManager } from '../config/index.js';
import { storageService } from './storage.js';

type TContentItem = TextContent | ImageContent;

interface IGeminiResult {
  contents: TContentItem[];
  savedPath: string | null;
}

class GeminiService {
  private client: GoogleGenAI | null = null;

  configure(apiKey: string): void {
    this.client = new GoogleGenAI({ apiKey });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private ensureClient(): GoogleGenAI {
    if (!this.client) {
      throw new Error(
        'Gemini API is not configured. Use configure_api_key tool first or set GEMINI_API_KEY environment variable.',
      );
    }
    return this.client;
  }

  private resolveModel(override?: string): string {
    return override ?? settingsManager.getModel();
  }

  async generateImage(prompt: string, model?: string): Promise<IGeminiResult> {
    const client = this.ensureClient();
    const resolvedModel = this.resolveModel(model);
    const contents: TContentItem[] = [];
    let savedPath: string | null = null;

    const response = await client.models.generateContent({
      model: resolvedModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      if (part.text) {
        contents.push({ type: 'text', text: part.text });
      }

      if (part.inlineData?.data) {
        const path = await storageService.saveImage(part.inlineData.data, 'gen');
        savedPath = path;

        contents.push({
          type: 'image',
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType ?? 'image/png',
        });

        contents.push({
          type: 'text',
          text: `Image saved to: ${path}`,
        });
      }
    }

    if (contents.length === 0) {
      contents.push({
        type: 'text',
        text: 'No image was generated. Try a different prompt.',
      });
    }

    return { contents, savedPath };
  }

  async editImage(
    imagePath: string,
    prompt: string,
    referenceImages?: string[],
    model?: string,
  ): Promise<IGeminiResult> {
    const client = this.ensureClient();
    const resolvedModel = this.resolveModel(model);
    const contents: TContentItem[] = [];
    let savedPath: string | null = null;

    const base64 = await storageService.readImageAsBase64(imagePath);
    const mimeType = storageService.getMimeType(imagePath);

    const inputParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      {
        inlineData: {
          data: base64,
          mimeType,
        },
      },
    ];

    if (referenceImages && referenceImages.length > 0) {
      for (const refPath of referenceImages) {
        const refBase64 = await storageService.readImageAsBase64(refPath);
        const refMime = storageService.getMimeType(refPath);
        inputParts.push({
          inlineData: {
            data: refBase64,
            mimeType: refMime,
          },
        });
      }
    }

    inputParts.push({ text: prompt });

    const response = await client.models.generateContent({
      model: resolvedModel,
      contents: [{ role: 'user', parts: inputParts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      if (part.text) {
        contents.push({ type: 'text', text: part.text });
      }

      if (part.inlineData?.data) {
        const path = await storageService.saveImage(part.inlineData.data, 'edit');
        savedPath = path;

        contents.push({
          type: 'image',
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType ?? 'image/png',
        });

        contents.push({
          type: 'text',
          text: `Edited image saved to: ${path}`,
        });
      }
    }

    if (contents.length === 0) {
      contents.push({
        type: 'text',
        text: 'No edited image was returned. Try adjusting your prompt.',
      });
    }

    return { contents, savedPath };
  }
}

export const geminiService = new GeminiService();
