import {
  extractDnfProfileFromImagesWithClassifier,
  type DnfImageClassifier,
} from "./application/extract-dnf-profile.js";
import {
  DEFAULT_GEMINI_MODEL,
  classifyAndExtractDnfImage,
} from "./infrastructure/gemini.js";
import type {
  DnfOcrImageInput,
  DnfOcrOptions,
  DnfOcrResult,
} from "./domain/types.js";

export * from "./application/extract-dnf-profile.js";
export * from "./domain/classes.js";
export * from "./domain/types.js";
export * from "./infrastructure/gemini.js";

export async function extractDnfProfileFromImages(
  images: DnfOcrImageInput[],
  options: DnfOcrOptions = {},
  classifyImage: DnfImageClassifier = classifyAndExtractDnfImage,
): Promise<DnfOcrResult> {
  return extractDnfProfileFromImagesWithClassifier(
    images,
    options,
    classifyImage,
    DEFAULT_GEMINI_MODEL,
  );
}
