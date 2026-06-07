import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { storageService } from './storage.js';
import { IGeminiResult, TContentItem, IGoogleCookies } from '../types/index.js';

// consumer Gemini web app endpoints (reverse-engineered, unofficial).
const INIT_URL = 'https://gemini.google.com/app';
const GENERATE_URL =
  'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate';
const UPLOAD_URL = 'https://content-push.googleapis.com/upload';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_PUSH_ID = 'feeds/mcudyrk2a4khkz';
const DEFAULT_METADATA = ['', '', '', null, null, null, null, null, null, ''];

// Tokens scraped from the /app HTML bootstrap.
const RE_ACCESS_TOKEN = /"SNlM0e":\s*"(.*?)"/;
const RE_BUILD_LABEL = /"cfb2h":\s*"(.*?)"/;
const RE_SESSION_ID = /"FdrFJe":\s*"(.*?)"/;
const RE_LANGUAGE = /"TuX5cc":\s*"(.*?)"/;
const RE_PUSH_ID = /"qKIAYe":\s*"(.*?)"/;

interface IWebSession {
  accessToken: string;
  buildLabel?: string;
  sessionId?: string;
  language: string;
  pushId: string;
}

export interface IExtractedImage {
  url: string;
  alt: string;
}

/**
 * Safely walk a nested array/object using a path of indices (arrays) and keys (objects).
 * Mirrors the behaviour of the reference Python implementation's get_nested_value.
 */
export function getNestedValue(
  data: unknown,
  path: Array<number | string>,
  fallback: unknown = null,
): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (typeof key === 'number') {
      if (Array.isArray(current) && key >= -current.length && key < current.length) {
        current = current[key < 0 ? current.length + key : key];
      } else {
        return fallback;
      }
    } else if (
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      key in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return fallback;
    }
  }
  return current === undefined || current === null ? fallback : current;
}

/**
 * Parse Google's length-prefixed framing protocol into a flat list of frames.
 * Each frame block is `<utf16-length>\n<json>`. JS strings are UTF-16, so the
 * length value maps directly to `String.prototype.length`/`slice` units.
 */
export function parseFrames(raw: string): unknown[] {
  let content = raw;
  if (content.startsWith(")]}'")) {
    content = content.slice(4);
  }
  content = content.replace(/^\s+/, '');

  const frames: unknown[] = [];
  const len = content.length;
  const marker = /(\d+)\n/y;
  let pos = 0;

  while (pos < len) {
    while (pos < len && /\s/.test(content[pos])) pos++;
    if (pos >= len) break;

    marker.lastIndex = pos;
    const m = marker.exec(content);
    if (!m || m.index !== pos) break;

    const length = parseInt(m[1], 10);
    const startContent = pos + m[1].length; // points at the '\n' after the digits
    if (startContent + length > len) break; // incomplete frame

    const chunk = content.slice(startContent, startContent + length).trim();
    pos = startContent + length;
    if (!chunk) continue;

    try {
      const parsed = JSON.parse(chunk);
      if (Array.isArray(parsed)) frames.push(...parsed);
      else frames.push(parsed);
    } catch {
      // skip non-JSON frame
    }
  }

  return frames;
}

/** Extract the model response candidates from parsed frames. */
export function extractCandidates(frames: unknown[]): unknown[] {
  const candidates: unknown[] = [];
  for (const frame of frames) {
    if (!Array.isArray(frame) || frame[0] !== 'wrb.fr') continue;
    const inner = frame[2];
    if (typeof inner !== 'string') continue;
    let partJson: unknown;
    try {
      partJson = JSON.parse(inner);
    } catch {
      continue;
    }
    const list = getNestedValue(partJson, [4], []);
    if (Array.isArray(list)) candidates.push(...list);
  }
  return candidates;
}

/** Find the first fatal error code in the frames, if any. */
export function extractErrorCode(frames: unknown[]): number | null {
  for (const frame of frames) {
    const code = getNestedValue(frame, [5, 2, 0, 1, 0], null);
    if (typeof code === 'number') return code;
  }
  return null;
}

/** Pull generated-image URLs out of a single candidate (plain generation + image-to-image). */
export function extractImagesFromCandidate(candidate: unknown): IExtractedImage[] {
  const plain = getNestedValue(candidate, [12, 7, 0], []);
  const img2img = getNestedValue(candidate, [12, 0, '8', 0], []);
  const all = [
    ...(Array.isArray(plain) ? plain : []),
    ...(Array.isArray(img2img) ? img2img : []),
  ];

  const images: IExtractedImage[] = [];
  for (const item of all) {
    const url = getNestedValue(item, [0, 3, 3], null);
    if (typeof url === 'string' && url) {
      const alt = getNestedValue(item, [0, 3, 2], '');
      images.push({ url, alt: typeof alt === 'string' ? alt : '' });
    }
  }
  return images;
}

/** Collect every generated image across all candidates. */
export function extractGeneratedImages(frames: unknown[]): IExtractedImage[] {
  const images: IExtractedImage[] = [];
  for (const candidate of extractCandidates(frames)) {
    images.push(...extractImagesFromCandidate(candidate));
  }
  return images;
}

/** Best-effort reply text from the first candidate that has any. */
export function extractReplyText(frames: unknown[]): string {
  for (const candidate of extractCandidates(frames)) {
    const text = getNestedValue(candidate, [1, 0], '');
    if (typeof text === 'string' && text.trim()) return text;
  }
  return '';
}

function describeErrorCode(code: number): string {
  switch (code) {
    case 1016:
      return '인증되지 않은 세션입니다. 쿠키(__Secure-1PSID/__Secure-1PSIDTS)가 만료되었을 수 있으니 다시 추출하세요.';
    case 1037:
      return '사용량 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
    case 1052:
      return '모델 헤더가 유효하지 않습니다.';
    case 1060:
      return '현재 지역/IP에서 일시적으로 차단되었습니다.';
    default:
      return `Gemini 웹에서 에러 코드 ${code}를 반환했습니다.`;
  }
}

class GeminiWebClient {
  private cookies: IGoogleCookies | null = null;
  private session: IWebSession | null = null;
  private reqId = Math.floor(Math.random() * 90000) + 10000;

  configure(cookies: IGoogleCookies): void {
    this.cookies = cookies;
    this.session = null; // force re-init with new cookies
  }

  isConfigured(): boolean {
    return !!this.cookies?.secure1psid;
  }

  private cookieHeader(): string {
    const c = this.cookies;
    if (!c) throw new Error('Google 쿠키가 설정되지 않았습니다. configure_google_login을 먼저 사용하세요.');
    let header = `__Secure-1PSID=${c.secure1psid}`;
    if (c.secure1psidts) header += `; __Secure-1PSIDTS=${c.secure1psidts}`;
    return header;
  }

  /** Scrape the bootstrap tokens from the /app HTML. Cached until an auth failure. */
  private async ensureInit(force = false): Promise<void> {
    if (this.session && !force) return;

    const res = await fetch(INIT_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: this.cookieHeader(),
      },
      redirect: 'follow',
    });

    const html = await res.text();
    const accessToken = RE_ACCESS_TOKEN.exec(html)?.[1];
    if (!accessToken) {
      throw new Error(
        '로그인 토큰(SNlM0e)을 찾지 못했습니다. 쿠키가 만료되었거나 유효하지 않습니다. ' +
          'gemini.google.com에 로그인 후 __Secure-1PSID(및 __Secure-1PSIDTS)를 다시 추출하세요.',
      );
    }

    this.session = {
      accessToken,
      buildLabel: RE_BUILD_LABEL.exec(html)?.[1],
      sessionId: RE_SESSION_ID.exec(html)?.[1],
      language: RE_LANGUAGE.exec(html)?.[1] || 'en',
      pushId: RE_PUSH_ID.exec(html)?.[1] || DEFAULT_PUSH_ID,
    };
  }

  async generateImage(prompt: string): Promise<IGeminiResult> {
    await this.ensureInit();
    return this.run(prompt, null, 'gen');
  }

  async editImage(
    imagePath: string,
    prompt: string,
    referenceImages?: string[],
  ): Promise<IGeminiResult> {
    await this.ensureInit();

    const files = [imagePath, ...(referenceImages ?? [])];
    const fileData: Array<[string[], string]> = [];
    for (const filePath of files) {
      const id = await this.uploadFile(filePath);
      fileData.push([[id], basename(filePath)]);
    }

    return this.run(prompt, fileData, 'edit');
  }

  private async run(
    prompt: string,
    fileData: Array<[string[], string]> | null,
    prefix: 'gen' | 'edit',
  ): Promise<IGeminiResult> {
    let rawResponse: string;
    try {
      rawResponse = await this.postGenerate(prompt, fileData);
    } catch (err) {
      // A stale token surfaces as a 400/401; re-scrape once and retry.
      if (err instanceof AuthExpiredError) {
        await this.ensureInit(true);
        rawResponse = await this.postGenerate(prompt, fileData);
      } else {
        throw err;
      }
    }

    const frames = parseFrames(rawResponse);

    const errorCode = extractErrorCode(frames);
    if (errorCode) {
      throw new Error(describeErrorCode(errorCode));
    }

    const images = extractGeneratedImages(frames);
    const replyText = extractReplyText(frames);

    const contents: TContentItem[] = [];
    let savedPath: string | null = null;

    if (replyText) {
      contents.push({ type: 'text', text: replyText });
    }

    for (const image of images) {
      const { base64, mimeType } = await this.downloadImage(image.url);
      const path = await storageService.saveImage(base64, prefix);
      savedPath = path;

      contents.push({ type: 'image', data: base64, mimeType });
      contents.push({ type: 'text', text: `Image saved to: ${path}` });
    }

    if (contents.length === 0) {
      contents.push({
        type: 'text',
        text:
          '이미지가 생성되지 않았습니다. consumer Gemini는 프롬프트가 모호하면 텍스트만 답할 수 있습니다. ' +
          '"...의 이미지를 생성해줘"처럼 이미지 생성 의도를 명확히 해보세요.',
      });
    }

    return { contents, savedPath };
  }

  private async postGenerate(
    prompt: string,
    fileData: Array<[string[], string]> | null,
  ): Promise<string> {
    const session = this.session;
    if (!session) throw new Error('Gemini 웹 세션이 초기화되지 않았습니다.');

    const reqId = this.reqId;
    this.reqId += 100000;

    const inner: unknown[] = new Array(69).fill(null);
    inner[0] = [prompt, 0, null, fileData, null, null, 0];
    inner[1] = [session.language];
    inner[2] = DEFAULT_METADATA;
    inner[6] = [1];
    inner[7] = 1; // streaming flag
    inner[10] = 1;
    inner[11] = 0;
    inner[17] = [[0]];
    inner[18] = 0;
    inner[27] = 1;
    inner[30] = [4];
    inner[41] = [1];
    inner[53] = 0;
    inner[61] = [];
    inner[68] = 2;

    const uuid = randomUUID().toUpperCase();
    inner[59] = uuid;

    const fReq = JSON.stringify([null, JSON.stringify(inner)]);

    const params = new URLSearchParams({
      hl: session.language,
      _reqid: String(reqId),
      rt: 'c',
    });
    if (session.buildLabel) params.set('bl', session.buildLabel);
    if (session.sessionId) params.set('f.sid', session.sessionId);

    const body = new URLSearchParams({ at: session.accessToken, 'f.req': fReq });

    const res = await fetch(`${GENERATE_URL}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        Origin: 'https://gemini.google.com',
        Referer: 'https://gemini.google.com/',
        'X-Same-Domain': '1',
        'x-goog-ext-525005358-jspb': `["${uuid}",1]`,
        Cookie: this.cookieHeader(),
      },
      body: body.toString(),
    });

    if (res.status === 400 || res.status === 401) {
      throw new AuthExpiredError(res.status);
    }
    if (res.status !== 200) {
      throw new Error(`StreamGenerate 요청 실패 (status ${res.status})`);
    }

    return res.text();
  }

  private async downloadImage(url: string): Promise<{ base64: string; mimeType: string }> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://gemini.google.com/',
        Cookie: this.cookieHeader(),
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`이미지 다운로드 실패 (status ${res.status})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
    return { base64: buffer.toString('base64'), mimeType };
  }

  private async uploadFile(filePath: string): Promise<string> {
    const session = this.session;
    if (!session) throw new Error('Gemini 웹 세션이 초기화되지 않았습니다.');

    const data = await readFile(filePath);
    const filename = basename(filePath);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)]), filename);

    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Origin: 'https://gemini.google.com',
        Referer: 'https://gemini.google.com/',
        'X-Tenant-Id': 'bard-storage',
        'Push-ID': session.pushId,
        Cookie: this.cookieHeader(),
      },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`이미지 업로드 실패 (status ${res.status}): ${filePath}`);
    }

    return (await res.text()).trim();
  }
}

class AuthExpiredError extends Error {
  constructor(status: number) {
    super(`인증 실패 (status ${status})`);
    this.name = 'AuthExpiredError';
  }
}

export const geminiWebClient = new GeminiWebClient();
