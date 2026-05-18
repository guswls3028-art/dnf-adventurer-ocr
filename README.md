# dnf-adventurer-ocr

던파 모바일 모험단 인증용 OCR 헬퍼입니다.

핵심 정책은 단순합니다.

- `basic_info`: 모험단 기본정보 화면에서 모험단명, 대표 캐릭터명, 대표 캐릭터 직업을 추출합니다.
- `character_list`: 보유 캐릭터 화면에서 캐릭터 목록을 추출합니다.
- `character_select`: 로그인 직후 캐릭터 선택창에서 캐릭터 목록을 추출합니다.
- 인증 판정은 `basic_info.mainCharacterName`이 `character_select` 캐릭터 목록에 있을 때만 `true`입니다. 보유 캐릭터 화면은 사칭 가능성이 있어 목록 보강에만 사용합니다.

## 빠른 사용

```bash
pnpm install
cp .env.example .env
pnpm build
GEMINI_API_KEY=... pnpm ocr ./basic.jpg ./list.jpg ./select.jpg
```

이미지 순서는 상관없습니다. Gemini가 화면 종류를 분류한 뒤 병합합니다.

## 라이브러리 사용

```ts
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { extractDnfProfileFromImages } from "dnf-adventurer-ocr";

const paths = ["basic.jpg", "list.jpg", "select.jpg"];
const images = await Promise.all(
  paths.map(async (path) => ({
    data: await readFile(path),
    mimeType: "image/jpeg",
    fileName: basename(path),
  })),
);

const result = await extractDnfProfileFromImages(images, {
  apiKey: process.env.GEMINI_API_KEY,
});

console.log(result.merged);
```

반환 예시:

```json
{
  "adventurerName": "소비에트연맹",
  "mainCharacterName": "지금간다",
  "mainCharacterClass": "엘레멘탈마스터",
  "mainCharacterClassGroup": "마법사(여)",
  "characters": [
    { "name": "지금간다", "klass": "엘레멘탈마스터", "classGroup": "마법사(여)" }
  ],
  "verifiedBySelectScreen": true
}
```

## API 연동 포인트

서버에서는 업로드 이미지를 `Uint8Array` 또는 `Buffer`로 읽어서 `extractDnfProfileFromImages()`에 넘기면 됩니다. Hono 예시는 [examples/hono-route.ts](examples/hono-route.ts)에 있습니다.

운영 권장값:

- `maxConcurrency`: 2
- `timeoutMs`: 60000
- 업로드 제한: 이미지당 10MB 이하
- 저장 정책: OCR 원본 이미지는 인증 완료 후 필요 기간만 보관하거나 즉시 폐기

## 주의

- 이 패키지는 Gemini API 키를 서버에서만 사용하도록 설계했습니다. 브라우저에 API 키를 노출하지 마세요.
- 항마력, 서버, 길드 정보는 의도적으로 추출하지 않습니다.
- 공개 배포 전 라이선스 정책을 결정하세요. 현재 `UNLICENSED`입니다.
