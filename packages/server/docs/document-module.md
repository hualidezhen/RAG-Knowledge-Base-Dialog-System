# Document Upload & Vectorization Module

## Architecture

```
src/
├── index.ts                        # Entry: registers document routes
├── types/index.ts                  # Shared type definitions
├── utils/fileParser.ts             # File parsing (PDF/DOCX/TXT)
├── services/vectorStoreService.ts  # ChromaDB + Embeddings + Text splitter
├── controllers/documentController.ts  # Request handlers
└── routes/document.ts              # Route definitions (multer middleware)
```

### Layer Responsibilities

| Layer | File | Role |
|-------|------|------|
| **Routes** | `routes/document.ts` | Define HTTP routes, attach multer middleware |
| **Controller** | `controllers/documentController.ts` | Parse request, call services, format response |
| **Service** | `services/vectorStoreService.ts` | ChromaDB init, embeddings, text splitting, CRUD |
| **Utils** | `utils/fileParser.ts` | File format detection and text extraction |
| **Types** | `types/index.ts` | Shared TypeScript interfaces |

## API Endpoints

### `POST /api/documents/upload`

Upload one or more files (PDF, DOCX, TXT).

- **Method:** POST
- **Content-Type:** multipart/form-data
- **Field name:** `files`
- **Max file size:** 50MB per file

**Request:**
```bash
curl -X POST http://localhost:3001/api/documents/upload \
  -F "files=@/path/to/document.pdf" \
  -F "files=@/path/to/notes.txt"
```

**Success Response (200):**
```json
{
  "message": "成功上传 2 个文件",
  "documents": [
    {
      "documentId": "document.pdf-1718000000000",
      "fileName": "document.pdf",
      "fileType": "pdf",
      "totalChunks": 12,
      "success": true
    }
  ]
}
```

**Error Responses:**
- `400` — 文件格式不支持、解析失败、内容为空
- `500` — 服务器内部错误或 ChromaDB 连接失败

### `GET /api/documents`

List all uploaded documents (deduplicated by filename).

**Request:**
```bash
curl http://localhost:3001/api/documents
```

**Response (200):**
```json
{
  "documents": [
    {
      "fileName": "document.pdf",
      "fileType": "pdf",
      "uploadTime": "2024-06-10T08:00:00.000Z",
      "chunkCount": 12
    }
  ]
}
```

## Data Flow

```
Upload → Multer (memory storage) → fileParser (text extraction)
  → RecursiveCharacterTextSplitter (chunkSize=500, overlap=50)
  → OpenAIEmbeddings (DeepSeek endpoint, model=deepseek-v4-flash)
  → ChromaDB collection "rag_knowledge" (vectors + metadata)
```

## Chunk Storage Schema

Each chunk stored in ChromaDB:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | `{fileName}-{timestamp}-chunk-{index}` |
| `document` | `string` | Raw text content of the chunk |
| `embedding` | `number[]` | Vector embedding (via DeepSeek/OpenAI compatible API) |
| `metadata.fileName` | `string` | Source filename |
| `metadata.fileType` | `string` | `pdf`, `docx`, or `txt` |
| `metadata.uploadTime` | `string` | ISO 8601 timestamp |
| `metadata.chunkIndex` | `number` | Position of chunk in document (0-based) |
| `metadata.totalChunks` | `number` | Total chunks for this document |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | Yes | — | DeepSeek API key (also used for embeddings) |
| `DEEPSEEK_OPENAI_BASE_URL` | No | `https://api.deepseek.com/v1` | OpenAI-compatible endpoint for embeddings |
| `CHROMA_URL` | No | `http://localhost:8000` | ChromaDB server URL |
| `PORT` | No | `3001` | Express server port |

## ChromaDB Setup

The `chromadb` npm package is an HTTP client and requires a running Chroma server.

### Install & Start Chroma Server (Python)

```bash
pip install chromadb
chroma run --path ./data/chroma
```

This stores vector data persistently in the `./data/chroma` directory.

### Verify Connection

```bash
curl http://localhost:8000/api/v1/heartbeat
# → { "nanosecond heartbeat": 1718000000000000000 }
```

## Development

```bash
# Terminal 1: ChromaDB server
chroma run --path ./data/chroma

# Terminal 2: Express backend (auto-reload via nodemon)
npm run dev -w packages/server

# Test health check
curl http://localhost:3001/api/health

# Test upload
curl -X POST -F "files=@test.pdf" http://localhost:3001/api/documents/upload

# Test list
curl http://localhost:3001/api/documents
```

## Error Handling

| Scenario | HTTP Status | Behavior |
|----------|-------------|----------|
| No files uploaded | 400 | Returns "请至少上传一个文件" |
| Unsupported file format | 400 | Returns supported formats list |
| File parse failure | 400 | Returns specific parse error per file |
| Empty content after parse | 400 | Returns "解析后内容为空" |
| Embedding API failure | 500 | Propagates API error with status |
| ChromaDB connection refused | 500 | Returns setup instructions |
| Unknown error | 500 | Returns generic error message |

## Type Definitions

File: `src/types/index.ts`

```typescript
interface ParsedDocument {
  fileName: string
  fileType: 'pdf' | 'docx' | 'txt'
  content: string
}

interface ChunkMetadata {
  fileName: string
  fileType: string
  uploadTime: string
  chunkIndex: number
  totalChunks: number
}

interface UploadResult {
  documentId: string
  fileName: string
  fileType: string
  totalChunks: number
  success: true
}

interface DocumentListItem {
  fileName: string
  fileType: string
  uploadTime: string
  chunkCount: number
}
```
