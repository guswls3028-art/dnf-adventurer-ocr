import { DEFAULT_GEMINI_MODEL, classifyAndExtractDnfImage } from "./gemini.js";
import type {
  DnfOcrCharacter,
  DnfOcrImageInput,
  DnfOcrMergedProfile,
  DnfOcrOptions,
  DnfOcrPerImage,
  DnfOcrResult,
} from "./types.js";

export * from "./classes.js";
export * from "./gemini.js";
export * from "./types.js";

function identityKey(value: string | undefined): string {
  return value?.replace(/\s+/g, "").trim() ?? "";
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
  if (images.length === 0) {
    throw new Error("At least one image is required.");
  }
  const maxConcurrency = options.maxConcurrency ?? 2;
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
