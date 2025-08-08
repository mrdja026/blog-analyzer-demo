## Overview

Next.js app with a visual demo for a GenAI image analyzer. The demo lives at `/demo` and supports drag‑and‑drop uploads, configurable analysis, real‑time progress via SSE, and result export (TXT/JSON/ZIP placeholder).

Key files:
- `src/app/demo/page.tsx`: main demo UI (uploader, config, progress, results, logs)
- `src/lib/api.ts`: API helpers and SSE event types

## Features

- Upload and preview images (PNG/JPEG/WEBP, 10MB limit; only first image analyzed in live mode)
- Configurable Mode (`Analyze/Describe/Summarize/All`) and Role (`Marketing/Product Owner/Custom prompt`)
- Optional prompt override, chunking UI controls (UI only — backend currently uses fixed grid chunking)
- Progress display styles (bar/spinner/simple/none); elapsed time and tokens/sec
- Two run modes:
  - Live API: connects to backend (`/api/health`, `/api/upload`, `/api/stream/:jobId`, `/api/analyze`)
  - Demo mode: deterministic simulated flow with fake progress and result
- Exports: TXT and JSON (ZIP is a placeholder)
- Verbose UI logs for transparency

## Quick Start

1) Install and run
```bash
npm install
npm run dev
```

2) Backend URL
- Defaults to `http://localhost:3001`. Override with `NEXT_PUBLIC_API_BASE` env var.

3) Use the demo
- Visit `http://localhost:3000/demo`
- Drag & drop an image or browse, tweak config, click Analyze
- Watch progress and tokens/sec; download summary/result

## API contract (UI expectations)

Endpoints the UI calls:
- `GET /api/health` → `{ ok: boolean, gridChunking: string }`
- `POST /api/upload` (multipart): `image`, optional `mode` (`analyze|describe|summarize|all`) → `{ jobId }`
- `POST /api/analyze` (JSON): `{ jobId, role: 'marketing'|'po'|'free', prompt?: string, mode?: string }`
- `GET /api/stream/:jobId` (SSE) → events:
  - `{ type: 'stage', stage: string }`
  - `{ type: 'progress', current: number, total: number, message?: string }`
  - `{ type: 'tokens', rate: number, total?: number }` emitted on a fixed cadence (500–1000ms)
    - Compatibility: UI also accepts `{ tokens: number }` and treats it as a rate
  - `{ type: 'message', message: string }`
  - `{ type: 'error', error: string }`
  - `{ type: 'done', result?: string }`

See `src/lib/api.ts` for the TypeScript union used by the UI.

## Challenges and fixes

- Tokens/sec appeared as a single number or jumped unpredictably
  - Root cause: SSE “tokens” payload ambiguous (cumulative vs instantaneous, bursty emission)
  - Fix (Option B): backend now emits `{ type: 'tokens', rate, total }` on a stable cadence; UI consumes `rate` (fallback to `tokens`) and displays rounded TPS
- SSE lifecycle and cleanup
  - Ensure one timer per job on the backend; clear interval on completion/disconnect
  - UI cleans up object URLs and resets run state reliably
- Prompt vs role precedence
  - If a prompt is provided, it overrides role (enforced server‑side and reflected in docs)
- Chunking & model selection
  - UI exposes controls for UX parity; backend currently uses fixed grid chunking and predetermined models

## Troubleshooting

- Health check fails
  - Confirm backend base URL (`NEXT_PUBLIC_API_BASE`) and CORS settings
- SSE not connecting or drops
  - Check server logs for `/api/stream/:jobId`; verify the job exists before connecting
- No tokens/sec updates
  - Verify the backend emits `{ type: 'tokens', rate, total }` every 500–1000ms
- Upload rejected
  - Ensure image type is PNG/JPEG/WEBP and size ≤ 10MB

## Notes

- The home page (`/`) is a static landing. The demo is under `/demo`.
- Logs are intentionally verbose to surface live API behavior.
