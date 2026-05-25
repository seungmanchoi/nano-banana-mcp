export interface IAppConfig {
  geminiApiKey: string;
  model?: string;
  fastModel?: string;
}

export type TQuality = 'high' | 'fast';

export interface IImageRecord {
  filePath: string;
  prompt: string;
  createdAt: string;
  type: 'generated' | 'edited';
}

export interface IVideoRecord {
  filePath: string;
  prompt: string;
  createdAt: string;
  type: 'generated' | 'extended';
  model: string;
  durationSeconds?: number;
  resolution?: string;
  aspectRatio?: string;
}

export type TMediaRecord = IImageRecord | IVideoRecord;

export interface IGenerateParams {
  prompt: string;
}

export interface IEditParams {
  imagePath: string;
  prompt: string;
  referenceImages?: string[];
}

export interface IContinueEditParams {
  prompt: string;
  referenceImages?: string[];
}

export interface IGenerateVideoParams {
  prompt: string;
  model?: string;
  imagePath?: string;
  lastFramePath?: string;
  aspectRatio?: string;
  resolution?: string;
  durationSeconds?: number;
  numberOfVideos?: number;
  negativePrompt?: string;
}

export interface IExtendVideoParams {
  prompt: string;
  model?: string;
  resolution?: string;
}

export type TMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
export type TVideoMimeType = 'video/mp4';
