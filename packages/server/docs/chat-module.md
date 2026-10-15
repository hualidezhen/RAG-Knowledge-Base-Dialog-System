# RAG Chat Module

## Architecture

```
POST /api/chat  { message: string }
       │
       ▼
  chatController.ts          ──  Parse request, validate input
       │
       ▼
  ragService.ts              ──  RAG pipeline orchestration
       │
       ├─ retrieveRelevantChunks()
       │     ├─ embedQuery(userMessage) → vector
       │     └─ collection.query(vector, topK=3) → chunks
       │
       └─ streamAnswer()
             ├─ Build system prompt with context
             └─ anthropic.messages.stream() → SSE events
```

### File Roles

| File | Role |
|------|------|
| `routes/chat.ts` | Define `POST /` route |
| `controllers/chatController.ts` | Validate input, call RAG service |
| `services/ragService.ts` | RAG pipeline: retrieve → stream |
| `types/index.ts` | SSE event types, `RetrievedChunk`, `ChatRequest` |

## API Endpoint

### `POST /api/chat`

Send a user message and receive an SSE stream of the RAG-enhanced answer.

**Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "文档中提到了哪些技术栈？"}'
```

**SSE Response Events:**

| Event | Type | Description |
|-------|------|-------------|
| `sources` | `data: {"type":"sources","sources":[...]}\n\n` | Retrieved chunks with metadata |
| `token` | `data: {"type":"token","content":"..."}\n\n` | Streaming text token |
| `error` | `data: {"type":"error","message":"..."}\n\n` | Error message |
| `[DONE]` | `data: [DONE]\n\n` | Stream complete signal |

**Example SSE Stream:**
```
data: {"type":"sources","sources":[{"content":"...","fileName":"doc.pdf","chunkIndex":0,"distance":0.15}]}

data: {"type":"token","content":"根据"}

data: {"type":"token","content":"文档"}

data: {"type":"token","content":"..."}

data: [DONE]
```

## RAG Pipeline

### 1. Retrieve (`retrieveRelevantChunks`)

- Embed user message via `OpenAIEmbeddings` (DeepSeek v1 endpoint, model `deepseek-v4-flash`)
- Query ChromaDB collection `rag_knowledge` with `queryEmbeddings`, `nResults: 3`
- Include documents, metadatas, and distances in results
- Return array of `RetrievedChunk` objects (content, fileName, chunkIndex, distance)

### 2. Stream (`streamAnswer`)

- Build context string from retrieved chunks:
  ```
  [来源: fileName (段落 N)]
  chunk content
  ```
- Construct system prompt:
  ```
  你是一个基于文档内容回答问题的助手。请使用以下参考资料回答问题，
  如果资料中不包含答案，请明确说"该问题不在知识库范围内"。

  参考资料：
  {context}
  ```
- Stream Anthropic message (DeepSeek Anthropic-compatible endpoint):
  - Model: `deepseek-v4-flash`
  - Max tokens: 1024
  - Events: `text` → SSE token, `end` → `[DONE]`, `error` → SSE error

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty message | HTTP 400 `{"error":"消息不能为空"}` |
| No relevant chunks found | SSE: `sources: []` → `token: "未找到相关资料..."` → `[DONE]` |
| ChromaDB connection failure | SSE: `error` event with setup instructions |
| Anthropic API error | SSE: `error` event with API error message |
| Streaming interrupted | SSE: `error` event, connection closes |

## Types

File: `src/types/index.ts`

```typescript
interface ChatRequest {
  message: string
}

interface RetrievedChunk {
  content: string
  fileName: string
  chunkIndex: number
  distance: number
}

interface SourceEvent {
  type: 'sources'
  sources: RetrievedChunk[]
}

interface TokenEvent {
  type: 'token'
  content: string
}

interface ErrorEvent {
  type: 'error'
  message: string
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key |
| `DEEPSEEK_ANTHROPIC_BASE_URL` | Yes | DeepSeek Anthropic-compatible endpoint |
| `DEEPSEEK_OPENAI_BASE_URL` | Yes | DeepSeek OpenAI-compatible endpoint (embeddings) |
| `CHROMA_URL` | Yes | ChromaDB server URL |

## Development

```bash
# Terminal 1: ChromaDB
chroma run --path ./data/chroma

# Terminal 2: Express backend
npm run dev -w packages/server

# Test health
curl http://localhost:3001/api/health

# Test chat
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
```
