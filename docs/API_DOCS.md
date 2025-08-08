## Frontend API Blueprint (UI -> `api/`)

This section documents the HTTP API your frontend should call. The API server runs from the `api/` package and exposes endpoints for health, upload, progress (SSE), and analysis.

### Base

- **Base URL**: `http://localhost:3001`
- **CORS**: Enabled for all origins
- **Max upload size**: 25 MB

### Endpoints

- **Health**: `GET /api/health`
  - Response: `{ ok: boolean, gridChunking: "enabled" | "disabled" }`

- **Upload image**: `POST /api/upload`
  - Content-Type: `multipart/form-data`
  - Body: field name `image` with the file
  - Response: `202 Accepted` with `{ jobId: string }`
  - Errors: `400 { error: "image file is required" }`, `500 { error: string }`

- **Progress stream (SSE)**: `GET /api/stream/:jobId`
  - Content-Type: `text/event-stream`
  - Emits JSON lines with a `type` discriminator
  - Connect anytime after `jobId` is known
  - Errors: `404` if job not found

- **Analyze combined text**: `POST /api/analyze`
  - Content-Type: `application/json`
  - Body: `{ jobId: string, role?: "marketing" | "po", prompt?: string }`
    - If `prompt` is provided and non-empty, it is used and `role` is ignored
  - Response: `202 Accepted` with `{ accepted: true }`
  - Result is delivered via SSE as a `done` event with `result`
  - Errors: `400 { error: string }`, `404 { error: "job not found" }`, `500 { error: string }`

### SSE Event Shapes

Events are emitted as lines like: `data: { ... }\n\n`.

Common `type` values your UI should handle:

- **stage**: `{ type: "stage", stage: "chunking" | "ocr" | "combining" | "analyzing" | "finished" | "error" }`
- **progress**: `{ type: "progress", current: number, total: number, message?: string }`
- **tokens**: `{ type: "tokens", tokens: number }` (rate/throughput indicators)
- **message**: `{ type: "message", message: string }`
- **error**: `{ type: "error", error: string }`
- **done**:
  - Upload OCR completion: `{ type: "done" }` (OCR finished; combined text stored server-side)
  - Analyze completion: `{ type: "done", result: string }` (final analysis available)

Notes on lifecycle:

- Upload job goes through `chunking` → `ocr` → `combining` → `finished`. A `done` event is emitted when OCR completes.
- Analyze job sets `analyzing` → `finished` and emits a `done` event with `result`.

### Recommended UI Flow

1. POST `/api/upload` with the file, receive `jobId`
2. Open SSE `GET /api/stream/:jobId` to observe `stage`, `progress`, and `message`
3. Wait until you see upload OCR `done` and/or `stage: finished`
4. POST `/api/analyze` with `jobId` and either `role` or `prompt`
5. Keep the same SSE open; when analysis finishes, you'll receive `type: done` with `result`

### Frontend Examples (TypeScript)

- **Upload image**

```ts
async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch("http://localhost:3001/api/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const data = await res.json();
  return data.jobId as string;
}
```

- **Subscribe to SSE**

```ts
type SseEvent =
  | { type: "stage"; stage: string }
  | { type: "progress"; current: number; total: number; message?: string }
  | { type: "tokens"; tokens: number }
  | { type: "message"; message: string }
  | { type: "error"; error: string }
  | { type: "done"; result?: string };

function subscribe(jobId: string, onEvent: (e: SseEvent) => void): () => void {
  const es = new EventSource(`http://localhost:3001/api/stream/${jobId}`);
  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as SseEvent;
      onEvent(data);
    } catch {
      // ignore malformed messages
    }
  };
  es.onerror = () => {
    // Optionally implement backoff/reconnect
  };
  return () => es.close();
}
```

- **Trigger analyze (role or prompt)**

```ts
async function analyze(jobId: string, opts: { role?: "marketing" | "po"; prompt?: string }) {
  const res = await fetch("http://localhost:3001/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, ...opts }),
  });
  if (!res.ok) throw new Error(`Analyze failed: ${res.status}`);
  // Server responds 202 Accepted; result comes via SSE `done` event
}
```

### Error Handling

- **Common errors**
  - `400`: Missing parameters (e.g., no file on upload, missing `jobId`)
  - `404`: Unknown `jobId`
  - `500`: Internal server error

- **Shape**: `{ error: string }`

### Constraints & Tips

- **File size**: uploads above 25 MB will be rejected
- **Sequencing**: Always upload first; only call analyze after OCR is finished
- **SSE**: Keep one EventSource per `jobId`; reuse it for both OCR and analysis phases
- **Prompt vs role**: Supplying `prompt` overrides `role`

### Curl (Git Bash)

```bash
# Upload
JOB_ID=$(curl -s -F "image=@/full/path/to/image.png" http://localhost:3001/api/upload | sed -n 's/.*"jobId":"\([^"]*\)".*/\1/p')
echo "$JOB_ID"

# Stream
curl http://localhost:3001/api/stream/$JOB_ID

# Analyze with role
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"jobId':'"$JOB_ID"'", "role":"marketing"}'

# Analyze with prompt
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"jobId":"'"$JOB_ID"'","prompt":"Summarize key points and risks."}'
```
