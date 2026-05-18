#!/usr/bin/env node
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { extractDnfProfileFromImages } from "./index.js";
import type { DnfOcrImageInput } from "./types.js";

function printHelp(): void {
  console.log(`dnf-adventurer-ocr

Usage:
  dnf-adventurer-ocr [--api-key KEY] [--model MODEL] <image...>

Examples:
  GEMINI_API_KEY=... dnf-adventurer-ocr ./basic.jpg ./list.jpg ./select.jpg
  dnf-adventurer-ocr --api-key AIza... ./capture1.png ./capture2.png
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

  const images: DnfOcrImageInput[] = await Promise.all(
    paths.map(async (path) => ({
      data: await readFile(path),
      mimeType: mimeFromPath(path),
      fileName: basename(path),
    })),
  );
  const result = await extractDnfProfileFromImages(images, {
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
