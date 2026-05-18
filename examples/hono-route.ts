import { Hono } from "hono";
import { extractDnfProfileFromImages } from "dnf-adventurer-ocr";
import type { DnfOcrImageInput } from "dnf-adventurer-ocr";

const app = new Hono();

app.post("/dnf-profile/ocr", async (c) => {
  const form = await c.req.parseBody({ all: true });
  const images: DnfOcrImageInput[] = [];

  for (const value of Object.values(form)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (!(item instanceof File) || item.size === 0) continue;
      if (item.size > 10 * 1024 * 1024) {
        return c.json({ error: "image_too_large", fileName: item.name }, 400);
      }
      images.push({
        data: await item.arrayBuffer(),
        mimeType: item.type || "image/jpeg",
        fileName: item.name,
      });
    }
  }

  if (images.length === 0) return c.json({ error: "image_required" }, 400);
  if (images.length > 20) return c.json({ error: "too_many_images" }, 400);

  const result = await extractDnfProfileFromImages(images, {
    apiKey: process.env.GEMINI_API_KEY,
    maxConcurrency: 2,
  });

  return c.json(result);
});

export default app;
