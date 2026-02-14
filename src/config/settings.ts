import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { IAppConfig } from '../types/index.js';

const CONFIG_DIR = join(homedir(), '.nano-banana');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const configSchema = z.object({
  geminiApiKey: z.string().min(1, 'API key cannot be empty'),
});

type TConfigSource = 'env' | 'file' | 'runtime' | 'none';

class SettingsManager {
  private current: IAppConfig | null = null;
  private source: TConfigSource = 'none';

  async load(): Promise<void> {
    // 1순위: 환경 변수
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) {
      this.current = { geminiApiKey: envKey };
      this.source = 'env';
      return;
    }

    // 2순위: 설정 파일
    try {
      await access(CONFIG_FILE);
      const raw = await readFile(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const validated = configSchema.parse(parsed);
      this.current = { geminiApiKey: validated.geminiApiKey };
      this.source = 'file';
    } catch {
      // 설정 없음
    }
  }

  async setApiKey(apiKey: string): Promise<void> {
    const validated = configSchema.parse({ geminiApiKey: apiKey });
    this.current = { geminiApiKey: validated.geminiApiKey };
    this.source = 'runtime';

    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(this.current, null, 2));
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
    return `Configured (source: ${this.source}, key: ${masked})`;
  }
}

export const settingsManager = new SettingsManager();
