import { DEFAULT_GEMINI_MODEL, classifyAndExtractDnfImage } from "../infrastructure/gemini.js";
import type {
  DnfOcrCharacter,
  DnfOcrImageInput,
  DnfOcrMergedProfile,
  DnfOcrOptions,
  DnfOcrPerImage,
  DnfOcrResult,
} from "../domain/types.js";

export * from "../domain/classes.js";
export * from "../domain/types.js";
export * from "../infrastructure/gemini.js";

const DEFAULT_MAX_IMAGES = 10;
const DEFAULT_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

function identityKey(value: string | undefined): string {
  return value?.replace(/\s+/g, "").trim() ?? "";
}

function imageByteLength(image: DnfOcrImageInput): number {
  const data = image.data;
  if (typeof data === "string") return Buffer.byteLength(data);
  if (data instanceof ArrayBuffer) return data.byteLength;
  return data.byteLength;
}

function validateExtractionInput(images: DnfOcrImageInput[], options: DnfOcrOptions): number {
  if (images.length === 0) {
    throw new Error("At least one image is required.");
  }
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  if (!Number.isInteger(maxImages) || maxImages < 1) {
    throw new Error("maxImages must be a positive integer.");
  }
  if (images.length > maxImages) {
    throw new Error(`Too many images. Maximum is ${maxImages}.`);
  }

  const maxConcurrency = options.maxConcurrency ?? 2;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > maxImages) {
    throw new Error(`maxConcurrency must be between 1 and ${maxImages}.`);
  }

  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  if (!Number.isFinite(maxTotalBytes) || maxTotalBytes < 1) {
    throw new Error("maxTotalBytes must be a positive number.");
  }
  const totalBytes = images.reduce((sum, image) => sum + imageByteLength(image), 0);
  if (totalBytes > maxTotalBytes) {
    throw new Error(`Images are too large. Maximum total is ${maxTotalBytes} bytes.`);
  }
  return maxConcurrency;
}

export function computeVerified(
  mainCharacterName: string | undefined,
  selectNames: string[] = [],
): boolean {
  const target = identityKey(mainCharacterName);
  if (!target) return false;
  return new Set(selectNames.map(identityKey).filter(Boolean)).has(target);
}

export function mergeDnfOcrResults(perImage: DnfOcrPerImage[]): DnfOcrMergedProfile {
  const basicInfo = perImage.find((item) => item.screenType === "basic_info" && item.basicInfo)?.basicInfo;
  const charsFromSelect = perImage
    .filter((item) => item.screenType === "character_select")
    .flatMap((item) => item.characters ?? []);
  const charsFromList = perImage
    .filter((item) => item.screenType === "character_list")
    .flatMap((item) => item.characters ?? []);

  const seen = new Set<string>();
  const characters: DnfOcrCharacter[] = [];
  for (const character of [...charsFromSelect, ...charsFromList]) {
    const key = identityKey(character.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    characters.push(character);
  }

  const selectMain = charsFromSelect.find(
    (character) => identityKey(character.name) === identityKey(basicInfo?.mainCharacterName),
  );
  const verifiedBySelectScreen = computeVerified(
    basicInfo?.mainCharacterName,
    charsFromSelect.map((character) => character.name),
  );

  const mainCharacterClass = basicInfo?.mainCharacterClass ?? selectMain?.klass;
  const mainCharacterClassGroup = basicInfo?.mainCharacterClassGroup ?? selectMain?.classGroup;

  return {
    ...(basicInfo?.adventurerName ? { adventurerName: basicInfo.adventurerName } : {}),
    ...(basicInfo?.mainCharacterName ? { mainCharacterName: basicInfo.mainCharacterName } : {}),
    ...(mainCharacterClass ? { mainCharacterClass } : {}),
    ...(mainCharacterClassGroup ? { mainCharacterClassGroup } : {}),
    characters,
    verifiedBySelectScreen,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current] as T, current);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function extractDnfProfileFromImages(
  images: DnfOcrImageInput[],
  options: DnfOcrOptions = {},
): Promise<DnfOcrResult> {
  const maxConcurrency = validateExtractionInput(images, options);
  const perImage = await mapWithConcurrency(images, maxConcurrency, (image, index) =>
    classifyAndExtractDnfImage(image, index, options),
  );

  return {
    source: "gemini",
    model: options.model ?? DEFAULT_GEMINI_MODEL,
    merged: mergeDnfOcrResults(perImage),
    perImage,
  };
}

export function buildMockDnfOcrResult(): DnfOcrResult {
  const perImage: DnfOcrPerImage[] = [
    {
      index: 0,
      fileName: "basic_info.mock.jpg",
      screenType: "basic_info",
      basicInfo: {
        adventurerName: "소비에트연맹",
        mainCharacterName: "지금간다",
        mainCharacterClass: "엘레멘탈마스터",
        mainCharacterClassGroup: "마법사(여)",
      },
    },
    {
      index: 1,
      fileName: "character_select.mock.jpg",
      screenType: "character_select",
      characters: [
        { name: "지금간다", klass: "엘레멘탈마스터", classGroup: "마법사(여)" },
        { name: "방장여", klass: "블레이드", classGroup: "귀검사(여)" },
      ],
    },
  ];
  return {
    source: "gemini",
    model: DEFAULT_GEMINI_MODEL,
    perImage,
    merged: mergeDnfOcrResults(perImage),
  };
}
