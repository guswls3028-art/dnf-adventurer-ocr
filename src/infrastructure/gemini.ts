import { normalizeClassName } from "../domain/classes.js";
import type {
  DnfOcrBasicInfo,
  DnfOcrCharacter,
  DnfOcrImageInput,
  DnfOcrOptions,
  DnfOcrPerImage,
} from "../domain/types.js";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 60_000;

const AUTO_PROMPT =
  "이 이미지는 던전앤파이터 모바일의 어느 화면인지 분류하고 정보 추출. 3 화면:\n" +
  "A) screenType='basic_info' — 정보→모험단→기본정보. 추출:\n" +
  "   basicInfo.adventurerName (명패 칭호 제외, 옆 작은 텍스트 — 예 '소비에트연맹')\n" +
  "   basicInfo.mainCharacterName ('대표 캐릭터' 박스 캐릭 이름)\n" +
  "   basicInfo.mainCharacterClass (같은 박스 직업명)\n" +
  "B) screenType='character_list' — 모험단→보유캐릭터. characters[] 추출 (name+klass).\n" +
  "C) screenType='character_select' — 로그인 직후 캐릭터 선택창. characters[] 추출.\n" +
  "   character_select 에서는 각 캐릭터 아래 'Lv.85 이름'의 이름을 name, 그 바로 아래 줄을 klass 로 추출.\n" +
  "   화면 상단의 모험단 레벨, 이벤트 문구, 항마력 숫자, 배경 텍스트는 제외.\n" +
  "직업 변경/직업표 화면처럼 실제 보유 캐릭터 이름이 없으면 'unknown'. 항마력 절대 추출 X. 레벨/서버/길드/UI 라벨 제외.";

const AUTO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    screenType: {
      type: "string",
      enum: ["basic_info", "character_list", "character_select", "unknown"],
    },
    basicInfo: {
      type: "object",
      properties: {
        adventurerName: { type: "string" },
        mainCharacterName: { type: "string" },
        mainCharacterClass: { type: "string" },
      },
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          klass: { type: "string" },
        },
      },
    },
  },
  required: ["screenType"],
} as const;

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
}

function getApiKey(options: DnfOcrOptions): string {
  const envKey = typeof process !== "undefined" ? process.env.GEMINI_API_KEY : undefined;
  const apiKey = options.apiKey ?? envKey;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required. Pass options.apiKey or set process.env.GEMINI_API_KEY.");
  }
  return apiKey;
}

function toBase64(input: DnfOcrImageInput): string {
  if (typeof input.data === "string") {
    const commaIndex = input.data.indexOf(",");
    return input.data.startsWith("data:") && commaIndex >= 0
      ? input.data.slice(commaIndex + 1)
      : input.data;
  }
  const bytes = input.data instanceof ArrayBuffer ? new Uint8Array(input.data) : input.data;
  return Buffer.from(bytes).toString("base64");
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini response was not a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBasicInfo(input: unknown): DnfOcrBasicInfo | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  const adventurerName = clean(raw.adventurerName);
  const mainCharacterName = clean(raw.mainCharacterName);
  const rawClass = clean(raw.mainCharacterClass);
  const normalized = rawClass ? normalizeClassName(rawClass) : null;
  return {
    ...(adventurerName ? { adventurerName } : {}),
    ...(mainCharacterName ? { mainCharacterName } : {}),
    ...(rawClass ? { mainCharacterClass: normalized?.baseClass ?? rawClass } : {}),
    ...(normalized?.classGroup ? { mainCharacterClassGroup: normalized.classGroup } : {}),
  };
}

function normalizeCharacters(input: unknown): DnfOcrCharacter[] {
  if (!Array.isArray(input)) return [];
  const out: DnfOcrCharacter[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const name = clean(raw.name);
    if (!name) continue;
    const rawClass = clean(raw.klass) ?? "";
    const normalized = rawClass ? normalizeClassName(rawClass) : null;
    out.push({
      name,
      klass: normalized?.baseClass ?? rawClass,
      ...(normalized?.classGroup ? { classGroup: normalized.classGroup } : {}),
    });
  }
  return out;
}

export async function classifyAndExtractDnfImage(
  image: DnfOcrImageInput,
  index: number,
  options: DnfOcrOptions = {},
): Promise<DnfOcrPerImage> {
  const apiKey = getApiKey(options);
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const body = {
    contents: [
      {
        parts: [
          { text: AUTO_PROMPT },
          {
            inlineData: {
              mimeType: image.mimeType || "image/jpeg",
              data: toBase64(image),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: AUTO_RESPONSE_SCHEMA,
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        index,
        ...(image.fileName ? { fileName: image.fileName } : {}),
        screenType: "unknown",
        error: `gemini_${response.status}:${text.slice(0, 160)}`,
      };
    }

    const data = (await response.json()) as { candidates?: GeminiCandidate[] };
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = parseJsonObject(rawJson);
    const screenType = parsed.screenType;
    if (
      screenType !== "basic_info" &&
      screenType !== "character_list" &&
      screenType !== "character_select" &&
      screenType !== "unknown"
    ) {
      return {
        index,
        ...(image.fileName ? { fileName: image.fileName } : {}),
        screenType: "unknown",
        raw: rawJson,
        error: "invalid_screen_type",
      };
    }

    const result: DnfOcrPerImage = {
      index,
      ...(image.fileName ? { fileName: image.fileName } : {}),
      screenType,
      ...(options.includeRaw ? { raw: rawJson } : {}),
    };
    if (screenType === "basic_info") {
      const basicInfo = normalizeBasicInfo(parsed.basicInfo);
      if (basicInfo) result.basicInfo = basicInfo;
    }
    if (screenType === "character_list" || screenType === "character_select") {
      result.characters = normalizeCharacters(parsed.characters);
    }
    return result;
  } catch (error) {
    return {
      index,
      ...(image.fileName ? { fileName: image.fileName } : {}),
      screenType: "unknown",
      error: error instanceof Error ? error.message : "unknown_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
