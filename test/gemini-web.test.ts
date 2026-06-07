import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNestedValue,
  parseFrames,
  extractCandidates,
  extractGeneratedImages,
  extractReplyText,
  extractErrorCode,
} from '../src/services/gemini-web.js';

// --- helpers: build a synthetic StreamGenerate response ---------------------

/** Wrap a chunk array in Google's length-prefixed frame (`<utf16-len>\n<json>`). */
function frameOf(chunkArray: unknown): string {
  const chunk = JSON.stringify(chunkArray);
  const payload = '\n' + chunk;
  return String(payload.length) + payload;
}

/** A single generated-image item: item[0][3][3] = url, item[0][3][2] = alt. */
function genImageItem(url: string, alt: string): unknown {
  return [[null, null, null, [null, null, alt, url]]];
}

/** Build a candidate whose plain generated image lives at [12][7][0]. */
function candidateWithImage(text: string, url: string, alt: string): unknown {
  const c12: unknown[] = [];
  c12[7] = [[genImageItem(url, alt)]]; // c[12][7][0] = [ item ]
  const candidate: unknown[] = [];
  candidate[0] = 'rcid_test';
  candidate[1] = [text];
  candidate[12] = c12;
  return candidate;
}

function wrbFrame(partJson: unknown): unknown {
  return [['wrb.fr', null, JSON.stringify(partJson)]];
}

// --- getNestedValue ---------------------------------------------------------

test('getNestedValue: array index path', () => {
  assert.equal(getNestedValue([1, [2, 3]], [1, 0]), 2);
});

test('getNestedValue: mixed object-key path ([12,0,"8",0] img2img shape)', () => {
  const candidate: unknown[] = [];
  candidate[12] = [{ '8': [['edited-image']] }];
  assert.deepEqual(getNestedValue(candidate, [12, 0, '8', 0]), ['edited-image']);
});

test('getNestedValue: returns fallback on missing path', () => {
  assert.equal(getNestedValue([1, 2], [9, 9], 'nope'), 'nope');
  assert.equal(getNestedValue(null, [0], 'nope'), 'nope');
  assert.equal(getNestedValue({ a: 1 }, ['b'], 'nope'), 'nope');
});

// --- parseFrames ------------------------------------------------------------

test('parseFrames: strips )]}\' prefix and parses one frame', () => {
  const part: unknown[] = [];
  part[4] = [candidateWithImage('hi', 'https://img/x.png', 'sunset')];
  const raw = ")]}'\n" + frameOf(wrbFrame(part));
  const frames = parseFrames(raw);
  assert.ok(frames.length >= 1);
  assert.equal((frames[0] as unknown[])[0], 'wrb.fr');
});

test('parseFrames: handles multiple concatenated frames + noise', () => {
  const part: unknown[] = [];
  part[4] = [candidateWithImage('hello', 'https://img/y.png', 'cat')];
  const raw = ")]}'\n" + frameOf([['di', 42]]) + frameOf(wrbFrame(part));
  const frames = parseFrames(raw);
  // both the noise frame and the wrb.fr frame should be present
  assert.ok(frames.some((f) => Array.isArray(f) && f[0] === 'di'));
  assert.ok(frames.some((f) => Array.isArray(f) && f[0] === 'wrb.fr'));
});

test('parseFrames: incomplete trailing frame is ignored, not thrown', () => {
  const raw = ")]}'\n" + '999\n[["wrb.fr"'; // declares 999 units but truncated
  assert.doesNotThrow(() => parseFrames(raw));
  assert.equal(parseFrames(raw).length, 0);
});

// --- end-to-end extraction --------------------------------------------------

test('extractGeneratedImages + extractReplyText from a full response', () => {
  const part: unknown[] = [];
  part[4] = [candidateWithImage('Here is your image.', 'https://img/abc.png', 'a sunset')];
  const raw = ")]}'\n" + frameOf(wrbFrame(part));
  const frames = parseFrames(raw);

  const images = extractGeneratedImages(frames);
  assert.equal(images.length, 1);
  assert.equal(images[0].url, 'https://img/abc.png');
  assert.equal(images[0].alt, 'a sunset');

  assert.equal(extractReplyText(frames), 'Here is your image.');
});

test('extractGeneratedImages: image-to-image path [12,0,"8",0]', () => {
  const c12: unknown[] = [];
  c12[0] = { '8': [[genImageItem('https://img/edited.png', 'edited')]] };
  const candidate: unknown[] = [];
  candidate[0] = 'rcid';
  candidate[1] = ['done'];
  candidate[12] = c12;
  const part: unknown[] = [];
  part[4] = [candidate];

  const frames = parseFrames(")]}'\n" + frameOf(wrbFrame(part)));
  const images = extractGeneratedImages(frames);
  assert.equal(images.length, 1);
  assert.equal(images[0].url, 'https://img/edited.png');
});

test('extractCandidates: ignores non-wrb.fr frames', () => {
  const frames = parseFrames(")]}'\n" + frameOf([['di', 1]]));
  assert.equal(extractCandidates(frames).length, 0);
});

test('extractErrorCode: reads error code at [5,2,0,1,0]', () => {
  const errFrame: unknown[] = [];
  errFrame[0] = 'wrb.fr';
  errFrame[5] = [null, null, [[null, [1037]]]]; // [5][2][0][1][0] = 1037
  const frames = parseFrames(")]}'\n" + frameOf([errFrame]));
  assert.equal(extractErrorCode(frames), 1037);
});

test('extractGeneratedImages: empty when no images present (text-only reply)', () => {
  const candidate: unknown[] = [];
  candidate[0] = 'rcid';
  candidate[1] = ['Just text, no image generated.'];
  const part: unknown[] = [];
  part[4] = [candidate];
  const frames = parseFrames(")]}'\n" + frameOf(wrbFrame(part)));
  assert.equal(extractGeneratedImages(frames).length, 0);
  assert.equal(extractReplyText(frames), 'Just text, no image generated.');
});

// --- token scrape regex (locks the documented bootstrap pattern) ------------

test('bootstrap token scrape regexes match the /app HTML shape', () => {
  const html = 'window.WIZ_global_data = {"SNlM0e":"AB_xyz123","cfb2h":"boq_assistant-bard-web-server_20260101","FdrFJe":"-7890","TuX5cc":"en"};';
  assert.equal(/"SNlM0e":\s*"(.*?)"/.exec(html)?.[1], 'AB_xyz123');
  assert.equal(/"cfb2h":\s*"(.*?)"/.exec(html)?.[1], 'boq_assistant-bard-web-server_20260101');
  assert.equal(/"FdrFJe":\s*"(.*?)"/.exec(html)?.[1], '-7890');
  assert.equal(/"TuX5cc":\s*"(.*?)"/.exec(html)?.[1], 'en');
});
