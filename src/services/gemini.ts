import { GoogleGenAI } from '@google/genai';
import { TextContent, ImageContent } from '@modelcontextprotocol/sdk/types.js';
import { settingsManager } from '../config/index.js';
import { storageService } from './storage.js';

type TContentItem = TextContent | ImageContent;

interface IGeminiResult {
  contents: TContentItem[];
  savedPath: string | null;
}

interface IVideoResult {
  contents: TContentItem[];
  savedPath: string | null;
}

const DEFAULT_VIDEO_MODEL = 'veo-3.1-generate-preview';
const VIDEO_POLL_INTERVAL_MS = 10_000;

// Image generation models require v1alpha endpoint
const IMAGE_API_VERSION = 'v1alpha';

class GeminiService {
  private client: GoogleGenAI | null = null;
  private imageClient: GoogleGenAI | null = null;

  configure(apiKey: string): void {
    this.client = new GoogleGenAI({ apiKey });
    this.imageClient = new GoogleGenAI({ apiKey, apiVersion: IMAGE_API_VERSION });
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

  private ensureImageClient(): GoogleGenAI {
    if (!this.imageClient) {
      throw new Error(
        'Gemini API is not configured. Use configure_api_key tool first or set GEMINI_API_KEY environment variable.',
      );
    }
    return this.imageClient;
  }

  private resolveModel(override?: string, quality?: string): string {
    if (override) return override;
    if (quality === 'fast') return settingsManager.getFastModel();
    return settingsManager.getModel();
  }

  private resolveVideoModel(override?: string): string {
    return override ?? DEFAULT_VIDEO_MODEL;
  }

  async generateImage(prompt: string, model?: string, quality?: string): Promise<IGeminiResult> {
    const client = this.ensureImageClient();
    const resolvedModel = this.resolveModel(model, quality);
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
    quality?: string,
  ): Promise<IGeminiResult> {
    const client = this.ensureImageClient();
    const resolvedModel = this.resolveModel(model, quality);
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

  async generateVideo(params: {
    prompt: string;
    model?: string;
    imagePath?: string;
    lastFramePath?: string;
    aspectRatio?: string;
    resolution?: string;
    durationSeconds?: number;
    numberOfVideos?: number;
    negativePrompt?: string;
  }): Promise<IVideoResult> {
    const client = this.ensureClient();
    const resolvedModel = this.resolveVideoModel(params.model);
    const contents: TContentItem[] = [];
    let savedPath: string | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generateParams: Record<string, any> = {
      model: resolvedModel,
      prompt: params.prompt,
    };

    // Config options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {};
    if (params.aspectRatio) config.aspectRatio = params.aspectRatio;
    if (params.resolution) config.resolution = params.resolution;
    if (params.durationSeconds) config.durationSeconds = params.durationSeconds;
    if (params.numberOfVideos) config.numberOfVideos = params.numberOfVideos;
    if (params.negativePrompt) config.negativePrompt = params.negativePrompt;

    // Image-to-video: first frame
    if (params.imagePath) {
      const base64 = await storageService.readImageAsBase64(params.imagePath);
      const mimeType = storageService.getMimeType(params.imagePath);
      generateParams.image = {
        imageBytes: base64,
        mimeType,
      };
    }

    // Last frame for interpolation
    if (params.lastFramePath) {
      const lastBase64 = await storageService.readImageAsBase64(params.lastFramePath);
      const lastMime = storageService.getMimeType(params.lastFramePath);
      config.lastFrame = {
        imageBytes: lastBase64,
        mimeType: lastMime,
      };
    }

    if (Object.keys(config).length > 0) {
      generateParams.config = config;
    }

    contents.push({
      type: 'text',
      text: `Starting video generation with model: ${resolvedModel}... This may take 1-6 minutes.`,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let operation = await (client.models as any).generateVideos(generateParams);

    // Poll until done
    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      operation = await (client.operations as any).getVideosOperation({ operation });
    }

    const generatedVideos = operation.response?.generatedVideos;

    if (generatedVideos && generatedVideos.length > 0) {
      for (let i = 0; i < generatedVideos.length; i++) {
        const video = generatedVideos[i]?.video;
        if (video) {
          await storageService.initializeVideo();
          const prefix = params.imagePath ? 'img2video' : 'video';
          const downloadPath = storageService.getVideoFilePath(prefix as 'video' | 'extend');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (client.files as any).download({ file: video, downloadPath });

          savedPath = downloadPath;

          const info = await storageService.getVideoInfo(downloadPath);
          const sizeStr = info ? `${(info.size / (1024 * 1024)).toFixed(1)} MB` : 'unknown size';

          contents.push({
            type: 'text',
            text: `Video ${i + 1} saved to: ${downloadPath} (${sizeStr})`,
          });
        }
      }
    }

    if (!savedPath) {
      contents.push({
        type: 'text',
        text: 'No video was generated. The prompt may have been filtered by safety checks. Try a different prompt.',
      });
    }

    return { contents, savedPath };
  }

  async extendVideo(params: {
    videoFilePath: string;
    prompt: string;
    model?: string;
    resolution?: string;
  }): Promise<IVideoResult> {
    const client = this.ensureClient();
    const resolvedModel = this.resolveVideoModel(params.model);
    const contents: TContentItem[] = [];
    let savedPath: string | null = null;

    // For video extension, we need to pass the video file reference
    // The video must have been generated by Veo within the last 2 days
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generateParams: Record<string, any> = {
      model: resolvedModel,
      prompt: params.prompt,
    };

    // Read the video file info from history to get the video reference
    const videoHistory = await storageService.loadVideoHistory();
    const lastVideo = videoHistory.find((v) => v.filePath === params.videoFilePath);

    if (!lastVideo) {
      contents.push({
        type: 'text',
        text: 'Video extension requires a video previously generated by Veo (within last 2 days). The provided video was not found in generation history.',
      });
      return { contents, savedPath: null };
    }

    contents.push({
      type: 'text',
      text: `Extending video with model: ${resolvedModel}... This may take 1-6 minutes. Note: Extension is limited to 720p resolution.`,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {
      numberOfVideos: 1,
      resolution: params.resolution ?? '720p',
    };

    generateParams.config = config;

    // Extension requires passing the video object from a previous generation
    // Since we can't store the video object reference across sessions,
    // we'll re-upload using the file path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let operation = await (client.models as any).generateVideos(generateParams);

    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      operation = await (client.operations as any).getVideosOperation({ operation });
    }

    const generatedVideos = operation.response?.generatedVideos;

    if (generatedVideos && generatedVideos.length > 0) {
      const video = generatedVideos[0]?.video;
      if (video) {
        await storageService.initializeVideo();
        const downloadPath = storageService.getVideoFilePath('extend');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client.files as any).download({ file: video, downloadPath });

        savedPath = downloadPath;

        const info = await storageService.getVideoInfo(downloadPath);
        const sizeStr = info ? `${(info.size / (1024 * 1024)).toFixed(1)} MB` : 'unknown size';

        contents.push({
          type: 'text',
          text: `Extended video saved to: ${downloadPath} (${sizeStr})`,
        });
      }
    }

    if (!savedPath) {
      contents.push({
        type: 'text',
        text: 'Video extension failed. Ensure the source video was generated by Veo within the last 2 days.',
      });
    }

    return { contents, savedPath };
  }
}

export const geminiService = new GeminiService();
