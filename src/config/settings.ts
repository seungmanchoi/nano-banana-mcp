import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { IAppConfig } from '../types/index.js';

const CONFIG_DIR = join(homedir(), '.nano-banana');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_MODEL = 'gemini-2.0-flash-preview-image-generation';

const configSchema = z.object({
  geminiApiKey: z.string().min(1, 'API key cannot be empty'),
  model: z.string().min(1).optional(),
});

type TConfigSource = 'env' | 'file' | 'runtime' | 'none';

class SettingsManager {
  private current: IAppConfig | null = null;
  private source: TConfigSource = 'none';

  getDefaultModel(): string {
    return DEFAULT_MODEL;
  }

  async load(): Promise<void> {
    const envKey = process.env.GEMINI_API_KEY;
    const envModel = process.env.GEMINI_MODEL;

    if (envKey) {
      this.current = { geminiApiKey: envKey, model: envModel };
      this.source = 'env';
      return;
    }

    try {
      await access(CONFIG_FILE);
      const raw = await readFile(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const validated = configSchema.parse(parsed);
      this.current = {
        geminiApiKey: validated.geminiApiKey,
        model: envModel ?? validated.model,
      };
      this.source = 'file';
    } catch {
      // no config found
    }
  }

  async setApiKey(apiKey: string): Promise<void> {
    const validated = configSchema.parse({ geminiApiKey: apiKey });
    const model = this.current?.model;
    this.current = { geminiApiKey: validated.geminiApiKey, model };
    this.source = 'runtime';

    await this.persistConfig();
  }

  async setModel(model: string): Promise<void> {
    if (!this.current) {
      throw new Error('API key must be configured before setting a model.');
    }
    this.current.model = model;

    await this.persistConfig();
  }

  private async persistConfig(): Promise<void> {
    if (!this.current) return;

    const data: Record<string, string> = { geminiApiKey: this.current.geminiApiKey };
    if (this.current.model) {
      data.model = this.current.model;
    }

    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(data, null, 2));
  }

  getModel(): string {
    return this.current?.model ?? DEFAULT_MODEL;
  }

  getConfig(): IAppConfig | null {
    return this.current;
  }

  getSource(): TConfigSource {
    return this.source;
  }

  isReady(): boolean {
    return this.current !== null;
  }

  getStatusMessage(): string {
    if (!this.current) {
      return [
        'Gemini API is not configured.',
        'Options:',
        '  1. Set GEMINI_API_KEY environment variable',
        '  2. Use configure_api_key tool with your API key',
        '',
        'Get a key at: https://aistudio.google.com/apikey',
      ].join('\n');
    }

    const masked = this.current.geminiApiKey.slice(0, 6) + '...' + this.current.geminiApiKey.slice(-4);
    return `Configured (source: ${this.source}, key: ${masked}, model: ${this.getModel()})`;
  }
}

export const settingsManager = new SettingsManager();
