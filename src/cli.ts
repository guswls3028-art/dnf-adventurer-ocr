#!/usr/bin/env node
import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { extractDnfProfileFromImages } from "./index.js";
import type { DnfOcrImageInput } from "./domain/types.js";

function printHelp(): void {
  console.log(`dnf-adventurer-ocr

Usage:
  dnf-adventurer-ocr [--model MODEL] [--include-raw] <image...>

Examples:
  GEMINI_API_KEY=... dnf-adventurer-ocr ./basic.jpg ./list.jpg ./select.jpg
  dnf-adventurer-ocr --include-raw ./capture1.png ./capture2.png
`);
}

function mimeFromPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let apiKey: string | undefined;
  let includeRaw = false;
  let model: string | undefined;
  const paths: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return;
    }
    if (arg === "--api-key") {
      apiKey = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--include-raw") {
      includeRaw = true;
      continue;
    }
    if (arg === "--model") {
      model = args[index + 1];
      index += 1;
      continue;
    }
    if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (arg) paths.push(arg);
  }

  if (paths.length === 0) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  if (apiKey) {
    console.error("Warning: --api-key can leak through shell history/process lists. Prefer GEMINI_API_KEY.");
  }

  const maxImages = 10;
  const maxTotalBytes = 30 * 1024 * 1024;
  if (paths.length > maxImages) {
    throw new Error(`Too many images. Maximum is ${maxImages}.`);
  }
  let totalBytes = 0;
  const images: DnfOcrImageInput[] = [];
  for (const path of paths) {
    const info = await stat(path);
    totalBytes += info.size;
    if (totalBytes > maxTotalBytes) {
      throw new Error(`Images are too large. Maximum total is ${maxTotalBytes} bytes.`);
    }
    images.push({
      data: await readFile(path),
      mimeType: mimeFromPath(path),
      fileName: basename(path),
    });
  }
  const result = await extractDnfProfileFromImages(images, {
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
    includeRaw,
    maxImages,
    maxTotalBytes,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
