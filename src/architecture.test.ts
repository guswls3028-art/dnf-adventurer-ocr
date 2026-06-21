import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const srcRoot = join(root, "src");

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith(".ts")) files.push(fullPath);
  }
  return files;
}

describe("architecture boundaries", () => {
  it("keeps domain and application free of infrastructure imports", () => {
    const innerFiles = [
      ...sourceFiles(join(srcRoot, "domain")),
      ...sourceFiles(join(srcRoot, "application")),
    ];

    const offenders = innerFiles.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /from "\.\.\/(?:infrastructure|cli)|from "\.\/(?:infrastructure|cli)/u.test(content);
    });

    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });

  it("keeps the public entrypoint as the infrastructure composition root", () => {
    const indexSource = readFileSync(join(srcRoot, "index.ts"), "utf8");
    const applicationSource = readFileSync(
      join(srcRoot, "application", "extract-dnf-profile.ts"),
      "utf8",
    );

    expect(indexSource).toContain('from "./infrastructure/gemini.js"');
    expect(indexSource).toContain("classifyAndExtractDnfImage");
    expect(applicationSource).toContain("DnfImageClassifier");
    expect(applicationSource).not.toContain("../infrastructure/");
  });
});
