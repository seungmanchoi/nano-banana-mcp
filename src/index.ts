#!/usr/bin/env node
import 'dotenv/config';
import { NanoBananaServer } from './server.js';

async function main(): Promise<void> {
  const server = new NanoBananaServer();
  await server.start();
}

main().catch((err) => {
  console.error('[nano-banana] Fatal error:', err);
  process.exit(1);
});
