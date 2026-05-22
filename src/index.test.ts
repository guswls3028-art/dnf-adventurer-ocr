import { describe, expect, it } from "vitest";
import {
  computeVerified,
  extractDnfProfileFromImages,
  mergeDnfOcrResults,
  normalizeClassName,
} from "./index.js";

describe("dnf adventurer verification", () => {
  it("verifies only when the main character exists in the select screen", () => {
    expect(computeVerified("지금 간다", ["다른캐릭", "지금간다"])).toBe(true);
    expect(computeVerified("지금간다", ["다른캐릭"])).toBe(false);
  });

  it("normalizes awakening class names to base classes", () => {
    const entry = normalizeClassName("오버마인드");
    expect(entry?.baseClass).toBe("엘레멘탈마스터");
    expect(entry?.classGroup).toBe("마법사(여)");
  });

  it("merges select screen characters before list characters and computes verification", () => {
    const merged = mergeDnfOcrResults([
      {
        index: 0,
        screenType: "basic_info",
        basicInfo: {
          adventurerName: "소비에트연맹",
          mainCharacterName: "지금간다",
          mainCharacterClass: "오버마인드",
        },
      },
      {
        index: 1,
        screenType: "character_select",
        characters: [{ name: "지금간다", klass: "엘레멘탈마스터", classGroup: "마법사(여)" }],
      },
      {
        index: 2,
        screenType: "character_list",
        characters: [{ name: "지금간다", klass: "엘레멘탈마스터", classGroup: "마법사(여)" }],
      },
    ]);

    expect(merged.verifiedBySelectScreen).toBe(true);
    expect(merged.characters).toHaveLength(1);
  });

  it("rejects unsafe batch limits before calling OCR", async () => {
    await expect(
      extractDnfProfileFromImages([{ data: new Uint8Array([1]), mimeType: "image/png" }], {
        maxConcurrency: 0,
      }),
    ).rejects.toThrow(/maxConcurrency/u);

    await expect(
      extractDnfProfileFromImages([{ data: new Uint8Array([1, 2]), mimeType: "image/png" }], {
        maxTotalBytes: 1,
      }),
    ).rejects.toThrow(/too large/u);
  });
});
