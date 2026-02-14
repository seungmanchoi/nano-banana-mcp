# Nano Banana MCP

Google Gemini AI를 활용한 이미지 생성 및 편집 MCP 서버입니다.
Claude Code, Cursor 등 MCP 클라이언트에서 텍스트로 이미지를 생성하고 편집할 수 있습니다.

## Features

- 텍스트 프롬프트로 이미지 생성
- 기존 이미지 편집 (텍스트 지시)
- 세션 메모리 기반 연속 편집
- 참조 이미지를 활용한 스타일 가이드
- 이미지 히스토리 관리
- 크로스 플랫폼 지원 (macOS, Windows, Linux)

## Setup

### 1. Gemini API Key

[Google AI Studio](https://aistudio.google.com/apikey)에서 API 키를 발급받으세요.

### 2. Install & Build

```bash
npm install
npm run build
```

### 3. Configure MCP Client

**Claude Code** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "nano-banana": {
      "command": "node",
      "args": ["/absolute/path/to/nano-banana-mcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your-api-key"
      }
    }
  }
}
```

**환경변수 없이 사용하려면** MCP 서버 시작 후 `configure_api_key` 도구를 호출하세요.

## Tools

| Tool | Description |
|------|-------------|
| `configure_api_key` | Gemini API 키 설정 |
| `generate_image` | 텍스트로 새 이미지 생성 |
| `edit_image` | 기존 이미지 편집 |
| `continue_editing` | 마지막 이미지 연속 편집 |
| `get_status` | 설정 상태 및 마지막 이미지 정보 |
| `list_history` | 최근 생성/편집 이미지 히스토리 |

## Development

```bash
npm run dev        # TypeScript 직접 실행
npm run build      # 빌드
npm run typecheck   # 타입 체크
npm run lint       # ESLint
```

## Project Structure

```
src/
├── index.ts           # Entry point
├── server.ts          # MCP server class
├── config/
│   └── settings.ts    # API key management
├── services/
│   ├── gemini.ts      # Gemini API integration
│   └── storage.ts     # File I/O & history
├── tools/
│   ├── definitions.ts # Tool schemas
│   └── handlers.ts    # Tool implementations
└── types/
    └── index.ts       # Type definitions
```

## Image Storage

- **macOS/Linux**: `~/nano-banana-images/`
- **Windows**: `Documents\nano-banana-images\`

## License

MIT
