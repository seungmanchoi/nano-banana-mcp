export interface IAppConfig {
  geminiApiKey: string;
}

export interface IImageRecord {
  filePath: string;
  prompt: string;
  createdAt: string;
  type: 'generated' | 'edited';
}

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

export type TMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
