# Google 쿠키(무료) 인증 모드 추가 — 설계 문서

- 날짜: 2026-06-07
- 브랜치: `feat/google-cookie-auth`
- 상태: 설계 승인됨, 구현 진행

## 1. 배경 / 목표

현재 nano-banana-mcp는 **Gemini API 키**(AI Studio 발급)를 `GoogleGenAI({ apiKey })`
클라이언트에 주입해 이미지/영상을 생성한다. 그런데 이미지 생성 모델
(`gemini-3-pro-image`, nano-banana 계열)은 사실상 유료/제한적이라 "무료로 쓰고 싶다"는
요구를 충족하지 못한다.

**목표**: 기존 API 키 방식은 그대로 두고, **consumer Gemini 웹앱(gemini.google.com)을
세션 쿠키로 구동하는 무료 인증 모드를 "설정 옵션 하나"로 추가**한다.

### 무료 + Google 로그인의 현실

| 경로 | 인증 | 무료 | 공식 |
|------|------|------|------|
| 기존 (Gemini API 키) | AI Studio 키 | 이미지 생성은 사실상 유료 | ✅ |
| Vertex AI (gcloud OAuth) | Google 계정 | ❌ GCP 결제 필수 | ✅ |
| **consumer Gemini 웹 (세션 쿠키)** | `__Secure-1PSID` 쿠키 | ✅ 무료 | ❌ 비공식 |

"무료 + Google 로그인"을 동시에 만족하는 유일한 길은 **세 번째 비공식 경로**뿐이다.
본인 Google 계정의 개인적 자동화 용도라는 전제로 진행한다.

## 2. 비기능 요구 / 제약

- 기존 API 키 사용자는 **동작 변화 0** (기본 `authMode = 'apiKey'`).
- **추가 런타임 의존성 없음** — Node 24 내장 `fetch` 사용 (npm 배포 패키지이므로 Python/브라우저 의존 금지).
- 핸들러는 두 모드를 **동일한 반환 형태**(`IGeminiResult`)로 받아 라우팅만 한다.
- 쿠키는 기존 API 키와 동일하게 `~/.nano-banana/config.json`에 저장.

## 3. 사전 검증 (de-risking)

가장 큰 리스크인 TLS 핑거프린팅 차단 여부를 경험적으로 확인했다:

```
GET https://gemini.google.com/app (plain Node fetch, no TLS impersonation)
→ status=200, body=715KB, "cfb2h" 스크랩 성공
```

연결/TLS 단계에서 차단되지 않으며 init용 토큰 스크랩이 plain `fetch`로 동작함을 확인.
(`SNlM0e`는 인증 쿠키가 있어야 나타나므로 미로그인 테스트에서는 미검출 — 정상.)

## 4. 역공학 프로토콜 (검증된 Python 구현 분석 결과)

출처: `HanaokaYuzu/Gemini-API` (가장 성숙한 reverse-engineered 구현).

### 4.1 엔드포인트 / 상수

- INIT: `https://gemini.google.com/app`
- GENERATE: `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`
- UPLOAD: `https://content-push.googleapis.com/upload` (헤더 `X-Tenant-Id: bard-storage`, `Push-ID: <push_id>`)

### 4.2 init — 토큰 스크랩 (정규식)

`/app`을 쿠키와 함께 GET 후 응답 HTML에서:

| 값 | 정규식 | 용도 |
|----|--------|------|
| access_token | `"SNlM0e":\s*"(.*?)"` | POST body의 `at` |
| build_label | `"cfb2h":\s*"(.*?)"` | 쿼리 `bl` |
| session_id | `"FdrFJe":\s*"(.*?)"` | 쿼리 `f.sid` |
| language | `"TuX5cc":\s*"(.*?)"` | 쿼리 `hl` |
| push_id | `"qKIAYe":\s*"(.*?)"` | 업로드 `Push-ID` |

쿠키: `__Secure-1PSID`(필수), `__Secure-1PSIDTS`(권장). `SNlM0e` 없으면 POST가 400.

### 4.3 generate 요청

- POST `StreamGenerate`
- 쿼리: `{ hl, _reqid, rt: 'c', bl: build_label, 'f.sid': session_id }` (`_reqid`는 호출마다 +100000)
- 헤더: `Content-Type: application/x-www-form-urlencoded;charset=utf-8`, `Origin/Referer: https://gemini.google.com`, `X-Same-Domain: 1`, `Cookie: __Secure-1PSID=...; __Secure-1PSIDTS=...`
- body(form):
  - `at = <access_token>`
  - `f.req = JSON.stringify([null, JSON.stringify(innerReqList)])`
- `innerReqList`: 길이 69 배열. 핵심만 채움:
  - `[0] = [prompt, 0, null, reqFileData, null, null, 0]` (생성은 `reqFileData = null`)
  - `[1] = [language]`
  - `[2] = DEFAULT_METADATA = ["","","",null,null,null,null,null,null,""]`
  - `[7] = 1`(STREAMING_FLAG), `[10]=1`, `[11]=0`, `[17]=[[0]]`, `[18]=0`, `[27]=1`, `[30]=[4]`, `[41]=[1]`, `[53]=0`, `[61]=[]`, `[68]=2`
  - `[59] = uuidV4().toUpperCase()`, 동일 uuid를 헤더 `x-goog-ext-525005358-jspb: ["<uuid>",1]`에 넣음
- **모델 헤더는 생략** → 계정 기본 모델 사용(이미지 생성은 프롬프트에 따라 자동 트리거).

### 4.4 응답 파싱 (batchexecute 스트림)

응답은 `)]}'\n` 프리픽스 후 `<길이>\n<JSON청크>` 형태가 반복되는 청크 스트림.
각 청크는 JSON 배열. 관심 대상은 `part[0] === 'wrb.fr'`인 항목의 `part[2]`
(JSON 문자열) 을 다시 파싱한 `partJson`.

`partJson[4][0]`이 candidate. candidate에서:

- 텍스트: `candidate[1][0]` (카드면 `candidate[22][0]`)
- **생성 이미지**: `candidate[12][7][0]` (plain) + `candidate[12][0]["8"][0]` (image-to-image=편집)
  - 각 항목: url = `gen[0][3][3]`, alt = `gen[0][3][2]`
- 에러코드: `part[5][2][0][1][0]`

> 인덱스가 깊고 취약하다. `getNestedValue(obj, path, default)` 헬퍼로 안전하게 접근하고,
> 파싱 실패 시 빈 결과 + 명확한 에러 메시지로 폴백한다.

### 4.5 이미지 다운로드

생성 이미지 url을 **쿠키 + `Referer: https://gemini.google.com/` 헤더**로 GET → 바이트 수신.
v1은 단순 다운로드(원본 풀사이즈 RPC `c8o8Fe`는 범위 제외; 필요 시 후속).
받은 바이트를 base64로 변환해 기존 `storageService.saveImage(base64, prefix)` 재사용.

### 4.6 편집용 업로드

`editImage`는 입력 이미지를 UPLOAD 엔드포인트에 multipart(`file` 파트)로 POST →
응답 텍스트가 파일 식별자. 이 식별자로 `reqFileData`를 구성해 generate 요청에 포함.
`reqFileData` 형태(Python 분석): `[[[fileId], filename]]` 계열 — 구현 시 실제 응답으로 검증.

## 5. 아키텍처 / 변경 대상

### 5.1 `src/types/index.ts`

```ts
export type TAuthMode = 'apiKey' | 'gemini-web';

export interface IGoogleCookies {
  secure1psid: string;
  secure1psidts?: string;
}

export interface IAppConfig {
  authMode: TAuthMode;          // 신규 (기본 'apiKey')
  geminiApiKey?: string;        // apiKey 모드에서 필수 → optional로 완화
  cookies?: IGoogleCookies;     // 신규 (gemini-web 모드에서 필수)
  model?: string;
  fastModel?: string;
}
```

### 5.2 `src/config/settings.ts`

- `configSchema`를 mode 기반 `superRefine`으로 변경:
  - `apiKey` 모드 → `geminiApiKey` 필수
  - `gemini-web` 모드 → `cookies.secure1psid` 필수
- env: `GEMINI_AUTH_MODE`, `GEMINI_SECURE_1PSID`, `GEMINI_SECURE_1PSIDTS` 로딩
- 신규 메서드: `setAuthMode`, `setCookies`, `getAuthMode()`, `getCookies()`
- `isReady()`: `(apiKey 모드 && geminiApiKey) || (web 모드 && cookies.secure1psid)`
- `getStatusMessage()`: 모드별 메시지(웹 모드는 1PSID 마스킹 표시)
- `persistConfig()`: authMode/cookies 직렬화

### 5.3 신규 `src/services/gemini-web.ts` — `GeminiWebClient`

```ts
class GeminiWebClient {
  configure(cookies: IGoogleCookies): void
  isConfigured(): boolean
  private async ensureInit(): Promise<void>      // 토큰 스크랩 (lazy, 캐시; 400/401 시 1회 재시도)
  async generateImage(prompt: string): Promise<IGeminiResult>
  async editImage(imagePath, prompt, referenceImages?): Promise<IGeminiResult>
  // 내부: buildFReq(), postStreamGenerate(), parseStream(), extractImages(), downloadImage(), uploadFile()
}
export const geminiWebClient = new GeminiWebClient();
```

- `IGeminiResult { contents: TContentItem[]; savedPath: string | null }` — `geminiService`와 동일 형태. (이 타입을 `gemini.ts`에서 export하거나 `types`로 승격해 공유)

### 5.4 `src/tools/handlers.ts` — 모드 라우팅

- `ensureReady()` → `settingsManager.isReady()` 기반 + 모드별 클라이언트 `isConfigured()` 확인
- `handleGenerateImage` / `handleEditImage` / `handleContinueEditing`:
  `getAuthMode() === 'gemini-web'` 이면 `geminiWebClient`, 아니면 `geminiService`로 분기
  (히스토리 기록·`lastImagePath` 갱신 로직은 공통)
- `handleGenerateVideo`: 웹 모드면 즉시 에러 — "영상 생성은 API 키 모드에서만 지원됩니다."
- 신규 `handleConfigureGoogleLogin({ secure1psid, secure1psidts? })`:
  쿠키 저장 + `authMode='gemini-web'` 전환 + `geminiWebClient.configure()`
- `get_status`: 모드/모델 표기 모드 인식

### 5.5 `src/tools/definitions.ts` + `index.ts` + `server.ts`

- 신규 툴 `configure_google_login` 정의 추가 (입력: `secure1psid` 필수, `secure1psidts` 선택)
- `server.ts switch`에 `case 'configure_google_login'` 추가
- `server.ts start()`: 로드된 `authMode`에 따라
  `geminiService.configure(apiKey)` **또는** `geminiWebClient.configure(cookies)` 분기
  (현재 `config.geminiApiKey` 무조건 접근 → undefined 크래시 버그 방지)

### 5.6 문서 / 환경

- `.env.example`에 웹 모드 변수 추가
- `README.md`에 "무료(Google 쿠키) 모드" 섹션 + 쿠키 추출 방법(DevTools → Application → Cookies → `gemini.google.com` → `__Secure-1PSID`, `__Secure-1PSIDTS`) + 비공식/만료/ToS 주의 명시

## 6. 데이터 흐름 (web 모드 generate_image)

```
generate_image(prompt)
  → handler: authMode==='gemini-web' → geminiWebClient.generateImage(prompt)
      → ensureInit(): GET /app (쿠키) → SNlM0e/cfb2h/FdrFJe/qKIAYe 스크랩·캐시
      → POST StreamGenerate (at + f.req)
      → parseStream(): 청크 파싱 → candidate[12][7][0] → 이미지 url 추출
      → downloadImage(url, 쿠키) → bytes → base64
      → storageService.saveImage(base64, 'gen') → savedPath
      → IGeminiResult { contents:[image, text], savedPath }
  → handler: history 기록 + lastImagePath 갱신 → CallToolResult
```

## 7. 에러 처리

- `SNlM0e` 미검출 → "쿠키가 만료되었거나 유효하지 않습니다. `__Secure-1PSID`/`__Secure-1PSIDTS`를 다시 추출하세요."
- POST 비200 / 에러코드(1037 usage limit, 1016 unauthenticated 등) → 코드 매핑한 한국어 메시지
- 이미지 0개(텍스트만 반환) → "이미지가 생성되지 않았습니다. 프롬프트를 이미지 생성 의도로 더 명확히 하세요." (consumer Gemini는 프롬프트가 모호하면 텍스트만 답함)
- 파싱 예외 → 원본 응답 일부를 디버그로 남기고 안전 폴백

## 8. 테스트 전략

- **단위(의존성 없이)**: `parseStream`/`extractImages`를 **고정된 샘플 응답 문자열**로 검증
  (실제 네트워크/쿠키 불필요). `getNestedValue` 헬퍼 단위 테스트.
- **스크랩 정규식**: 사전 검증에서 받은 실제 `/app` HTML 스니펫으로 `cfb2h` 추출 검증.
- **빌드/타입/린트**: `npm run build`, `npm run typecheck`, `npm run lint` 통과.
- **수동 E2E(사용자 쿠키 필요)**: 사용자가 본인 `__Secure-1PSID` 입력 후 `generate_image`
  → 실제 이미지 저장 확인. **이 단계는 사용자의 실제 쿠키가 있어야만 가능** (개발자가 대신 못 함).

## 9. 범위 제외 (YAGNI)

채팅 세션 연속성, Gem, deep research, 영상/음악(웹), 자동 쿠키 회전(RotateCookies),
원본 풀사이즈 이미지 RPC, 브라우저 쿠키 자동 로딩 → 전부 제외.
오직 **web 모드의 이미지 생성·편집·다운로드**만.

## 10. 리스크 / 완화

| 리스크 | 심각도 | 완화 |
|--------|--------|------|
| TLS 핑거프린팅 차단 | 중(↓ 사전검증으로 완화) | GET은 검증됨. POST 차단 시 HTTP 계층을 교체 가능하게 분리 |
| `__Secure-1PSIDTS` 만료/회전 | 중 | v1은 인증 실패 시 재스크랩 + 재추출 안내. 자동 회전은 후속 |
| batchexecute 응답 구조 변경 | 중 | `getNestedValue` + 샘플 기반 단위 테스트 + 안전 폴백 |
| 개발자가 E2E 직접 검증 불가 | 중 | 단위 테스트로 파싱/스크랩 최대 커버, 사용자 쿠키로 최종 확인 |
| ToS / 계정 제재 | 낮~중 | 본인 개인 용도 전제, README에 명시 |
```
