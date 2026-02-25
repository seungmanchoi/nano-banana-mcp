import { mkdir, writeFile, readFile, stat, access } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { homedir, platform } from 'node:os';
import { IImageRecord, IVideoRecord, TMimeType } from '../types/index.js';

const FOLDER_NAME = 'nano-banana-images';
const VIDEO_FOLDER_NAME = 'nano-banana-videos';
const HISTORY_FILE = '.nano-banana-history.json';
const VIDEO_HISTORY_FILE = '.nano-banana-video-history.json';

function resolveOutputDir(): string {
  const os = platform();
  if (os === 'win32') {
    const docs = join(homedir(), 'Documents');
    return join(docs, FOLDER_NAME);
  }
  return join(homedir(), FOLDER_NAME);
}

function resolveVideoOutputDir(): string {
  const os = platform();
  if (os === 'win32') {
    const docs = join(homedir(), 'Documents');
    return join(docs, VIDEO_FOLDER_NAME);
  }
  return join(homedir(), VIDEO_FOLDER_NAME);
}

function buildFileName(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}.png`;
}

function buildVideoFileName(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}.mp4`;
}

function detectMimeType(filePath: string): TMimeType {
  const ext = extname(filePath).toLowerCase();
  const mapping: Record<string, TMimeType> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return mapping[ext] ?? 'image/png';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

class StorageService {
  private outputDir: string;
  private videoOutputDir: string;
  private historyPath: string;
  private videoHistoryPath: string;

  constructor() {
    this.outputDir = resolveOutputDir();
    this.videoOutputDir = resolveVideoOutputDir();
    this.historyPath = join(this.outputDir, HISTORY_FILE);
    this.videoHistoryPath = join(this.videoOutputDir, VIDEO_HISTORY_FILE);
  }

  async initialize(): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
  }

  async initializeVideo(): Promise<void> {
    await mkdir(this.videoOutputDir, { recursive: true });
  }

  async saveImage(base64Data: string, prefix: 'gen' | 'edit'): Promise<string> {
    await this.initialize();
    const fileName = buildFileName(prefix);
    const filePath = join(this.outputDir, fileName);
    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(filePath, buffer);
    return filePath;
  }

  getVideoFilePath(prefix: 'video' | 'extend'): string {
    return join(this.videoOutputDir, buildVideoFileName(prefix));
  }

  async readImageAsBase64(filePath: string): Promise<string> {
    const exists = await fileExists(filePath);
    if (!exists) {
      throw new Error(`Image not found: ${filePath}`);
    }
    const buffer = await readFile(filePath);
    return buffer.toString('base64');
  }

  getMimeType(filePath: string): TMimeType {
    return detectMimeType(filePath);
  }

  async getImageInfo(filePath: string): Promise<{ size: number; modified: string } | null> {
    const exists = await fileExists(filePath);
    if (!exists) return null;

    const info = await stat(filePath);
    return {
      size: info.size,
      modified: info.mtime.toISOString(),
    };
  }

  async getVideoInfo(filePath: string): Promise<{ size: number; modified: string } | null> {
    return this.getImageInfo(filePath);
  }

  async appendHistory(record: IImageRecord): Promise<void> {
    const history = await this.loadHistory();
    history.push(record);
    const trimmed = history.slice(-50);
    await writeFile(this.historyPath, JSON.stringify(trimmed, null, 2));
  }

  async appendVideoHistory(record: IVideoRecord): Promise<void> {
    await this.initializeVideo();
    const history = await this.loadVideoHistory();
    history.push(record);
    const trimmed = history.slice(-50);
    await writeFile(this.videoHistoryPath, JSON.stringify(trimmed, null, 2));
  }

  async loadHistory(): Promise<IImageRecord[]> {
    const exists = await fileExists(this.historyPath);
    if (!exists) return [];

    try {
      const raw = await readFile(this.historyPath, 'utf-8');
      return JSON.parse(raw) as IImageRecord[];
    } catch {
      return [];
    }
  }

  async loadVideoHistory(): Promise<IVideoRecord[]> {
    const exists = await fileExists(this.videoHistoryPath);
    if (!exists) return [];

    try {
      const raw = await readFile(this.videoHistoryPath, 'utf-8');
      return JSON.parse(raw) as IVideoRecord[];
    } catch {
      return [];
    }
  }

  async listRecentImages(count: number = 10): Promise<IImageRecord[]> {
    const history = await this.loadHistory();
    return history.slice(-count).reverse();
  }

  async listRecentVideos(count: number = 10): Promise<IVideoRecord[]> {
    const history = await this.loadVideoHistory();
    return history.slice(-count).reverse();
  }

  getOutputDirectory(): string {
    return this.outputDir;
  }

  getVideoOutputDirectory(): string {
    return this.videoOutputDir;
  }
}

export const storageService = new StorageService();
