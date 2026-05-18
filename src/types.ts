import type { DnfClassGroup } from "./classes.js";

export const DNF_OCR_SCREEN_TYPES = [
  "basic_info",
  "character_list",
  "character_select",
  "unknown",
] as const;

export type DnfOcrScreenType = (typeof DNF_OCR_SCREEN_TYPES)[number];

export interface DnfOcrImageInput {
  data: Uint8Array | ArrayBuffer | string;
  mimeType?: string;
  fileName?: string;
}

export interface DnfOcrOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxConcurrency?: number;
  includeRaw?: boolean;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface DnfOcrBasicInfo {
  adventurerName?: string;
  mainCharacterName?: string;
  mainCharacterClass?: string;
  mainCharacterClassGroup?: DnfClassGroup;
}

export interface DnfOcrCharacter {
  name: string;
  klass: string;
  classGroup?: DnfClassGroup;
}

export interface DnfOcrPerImage {
  index: number;
  fileName?: string;
  screenType: DnfOcrScreenType;
  basicInfo?: DnfOcrBasicInfo;
  characters?: DnfOcrCharacter[];
  raw?: string;
  error?: string;
}

export interface DnfOcrMergedProfile {
  adventurerName?: string;
  mainCharacterName?: string;
  mainCharacterClass?: string;
  mainCharacterClassGroup?: DnfClassGroup;
  characters: DnfOcrCharacter[];
  verifiedBySelectScreen: boolean;
}

export interface DnfOcrResult {
  source: "gemini";
  model: string;
  merged: DnfOcrMergedProfile;
  perImage: DnfOcrPerImage[];
}
