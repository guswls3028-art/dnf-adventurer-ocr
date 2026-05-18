# dnf-adventurer-ocr

던파 모바일 뉴비 훈련소 방장이 개발한 모험단 정보 인증 및 캐릭터 목록 자동 추출 OCR 패키지입니다.

Gemini API를 연동해 던파 모바일 스크린샷을 분석하고, 모험단명 / 대표 캐릭터 / 보유 캐릭터 목록을 자동으로 추출합니다. 로그인 직후 캐릭터 선택창까지 함께 검사해 “이 사람이 실제로 해당 대표 캐릭터를 가진 계정인지”를 확인하는 용도로 만들었습니다.

## 무엇을 해주나요?

이 패키지는 이미지 여러 장을 받아 아래 정보를 반환합니다.

- 모험단명
- 대표 캐릭터명
- 대표 캐릭터 직업
- 보유 캐릭터 목록
- 캐릭터 선택창 기준 인증 여부

인증 판정은 일부러 보수적으로 잡았습니다.

- `basic_info`: 모험단 기본정보 화면입니다. 모험단명, 대표 캐릭터명, 대표 캐릭터 직업을 추출합니다.
- `character_list`: 보유 캐릭터 화면입니다. 캐릭터 목록 추출용으로만 씁니다.
- `character_select`: 로그인 직후 캐릭터 선택창입니다. 대표 캐릭터가 실제 계정에 있는지 확인하는 인증 신호로 씁니다.

`basic_info.mainCharacterName`이 `character_select` 화면의 캐릭터 목록에 있을 때만 `verifiedBySelectScreen: true`가 됩니다. 보유 캐릭터 화면은 사칭 가능성이 있어 인증 신호로 쓰지 않습니다.

## 필요한 준비물

- Node.js 20 이상
- pnpm 또는 npm
- Gemini API key
- 던파 모바일 캡처 이미지 1장 이상

Gemini API key는 Google AI Studio에서 발급한 뒤 서버 환경변수 `GEMINI_API_KEY`로 넣으면 됩니다. 브라우저 프론트엔드에 API 키를 직접 넣지 마세요.

## 캡처하면 좋은 화면

이미지는 순서대로 올리지 않아도 됩니다. Gemini가 화면 종류를 자동 분류합니다.

| 화면 | 용도 |
| --- | --- |
| 정보 → 모험단 → 기본정보 | 모험단명, 대표 캐릭터명, 대표 캐릭터 직업 추출 |
| 모험단 → 보유 캐릭터 | 보유 캐릭터 목록 자동 추출 |
| 로그인 직후 캐릭터 선택창 | 대표 캐릭터 실소유 여부 인증 |

최소 구성은 `기본정보 + 캐릭터 선택창`입니다. 보유 캐릭터 화면까지 넣으면 캐릭터 목록이 더 풍부해집니다.

## 빠른 실행

```bash
git clone <repo-url>
cd dnf-adventurer-ocr
pnpm install
cp .env.example .env
```

`.env`에 Gemini API key를 넣습니다.

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

CLI로 이미지를 분석합니다.

```bash
GEMINI_API_KEY=your_gemini_api_key_here pnpm ocr ./basic.jpg ./list.jpg ./select.jpg
```

Windows PowerShell에서는 이렇게 실행해도 됩니다.

```powershell
$env:GEMINI_API_KEY="your_gemini_api_key_here"
pnpm ocr .\basic.jpg .\list.jpg .\select.jpg
```

## 라이브러리로 사용

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
  includeRaw: false,
});

console.log(result.merged);
```

## 반환 예시

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

주요 필드 의미:

- `adventurerName`: 모험단명
- `mainCharacterName`: 대표 캐릭터명
- `mainCharacterClass`: 대표 캐릭터 직업명
- `characters`: 추출된 캐릭터 목록
- `verifiedBySelectScreen`: 캐릭터 선택창 기준 인증 성공 여부
- `perImage`: 이미지별 화면 분류 결과. 원본 OCR 응답은 `includeRaw: true`일 때만 포함됩니다.

## API 연동 포인트

서버에서는 업로드 이미지를 `Uint8Array` 또는 `Buffer`로 읽어서 `extractDnfProfileFromImages()`에 넘기면 됩니다. Hono 예시는 [examples/hono-route.ts](examples/hono-route.ts)에 있습니다.

운영 권장값:

- `maxConcurrency`: 2
- `timeoutMs`: 60000
- 업로드 제한: 이미지당 10MB 이하
- 저장 정책: OCR 원본 이미지는 인증 완료 후 필요 기간만 보관하거나 즉시 폐기

## 검증 정책

이 패키지의 핵심은 “캐릭터 목록 자동 추출”과 “간단한 사칭 방지”입니다.

보유 캐릭터 화면은 이미지 편집이나 타인 캡처 재사용 가능성이 있으므로, 캐릭터 목록 보강에만 씁니다. 반면 로그인 직후 캐릭터 선택창은 실제 계정 접근성이 필요하다고 보고 인증 신호로 씁니다.

즉, 사용자가 올린 기본정보 화면의 대표 캐릭터가 캐릭터 선택창에도 있으면 인증 성공입니다.

다만 캡처 기반 검증은 완전한 신원 인증이 아닙니다. 운영 편의와 사칭 방지 보조 장치로 쓰고, 금전 거래나 계정 소유권을 보증하는 용도로 단독 사용하지 않는 것을 권장합니다.

## 개인정보와 보안

- 업로드한 이미지는 Gemini API 분석을 위해 Google API로 전송됩니다. 서비스에 붙일 때는 사용자에게 이 사실을 고지하세요.
- 이 패키지는 이미지를 저장하지 않습니다. 저장 여부와 보관 기간은 연동하는 서버에서 별도로 정해야 합니다.
- API key는 서버 환경변수로만 다루세요. 브라우저 코드, 앱 번들, 공개 저장소에 넣으면 안 됩니다.
- 운영 API로 붙일 때는 로그인, rate limit, 이미지 용량 제한, 호출 실패 처리, 원본 이미지 폐기 정책을 함께 두는 것을 권장합니다.

## 문제 해결

- `GEMINI_API_KEY is required`: API 키가 없거나 환경변수로 전달되지 않았습니다.
- `verifiedBySelectScreen: false`: 기본정보의 대표 캐릭터명이 캐릭터 선택창에서 발견되지 않았습니다. 기본정보 화면과 캐릭터 선택창이 같은 계정인지 확인하세요.
- `screenType: unknown`: 던파 모바일 화면이 아니거나, 캡처가 흐리거나, 직업 변경표처럼 실제 캐릭터 목록이 없는 화면일 수 있습니다.
- 캐릭터 직업명이 이상함: OCR 결과를 던파 모바일 직업명 매핑으로 정규화하지만, 신규 직업이나 OCR 오타는 [src/classes.ts](src/classes.ts)에 alias를 추가해 보정할 수 있습니다.

## 주의

- 이 패키지는 Gemini API 키를 서버에서만 사용하도록 설계했습니다. 브라우저에 API 키를 노출하지 마세요.
- 항마력, 서버, 길드 정보는 의도적으로 추출하지 않습니다.
- 공개 배포 전 라이선스 정책을 결정하세요. 현재 `UNLICENSED`입니다.
