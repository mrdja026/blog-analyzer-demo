# UI Integration Change Summary

## New Types

### Mode
- `'analyze' | 'describe' | 'summarize' | 'all'`  
(Threaded through, used for logging/telemetry only)

### Role
- Now: `'marketing' | 'po' | 'free'`

---

## Config Updates (`picture-ts/src/config.ts`)

- Added `FREEFORM_PROMPT = "Give me the transcribed text."`
- `ROLE_PROMPTS` now includes `free: FREEFORM_PROMPT`
- Models remain hard-coded; **no UI control needed**

---

## Pipeline Args (`picture-ts/src/types.ts`)

- `AnalyzeCommandArgs` and `OcrCommandArgs` gained optional `mode?: Mode`

---

## Pipeline Logging (`picture-ts/src/services/pipeline.service.ts`)

- `mode` is threaded through OCR and analysis for logs/progress titles.
- **Behavior unchanged**

---

## API Contract

### `/api/upload` (`multipart/form-data`)
- Accepts optional `mode` text field; stored on the job and passed through.
- **Response unchanged:** `{ jobId }`

### `/api/analyze` (`application/json`)
- Accepts:
```json
{
  "jobId": "<from /api/upload>",
  "role": "marketing" | "po" | "free",
  "prompt": "<optional custom prompt; overrides role if present>",
  "mode": "analyze" | "summarize" | "describe" | "all"   // optional, logged only
}
# Behavior:
    - If prompt is non-empty, it is used; otherwise, role prompt is used (supports marketing | po | free)

    - mode is logged; no behavioral change yet

    - Job state now includes mode (useful if UI wants to display it)
Chunking / Models

    - Grid chunking is always on (no UI flag used)

    - Model selection is not configurable via UI

#Upload with Mode
POST /api/upload
Content-Type: multipart/form-data
    image: <file>
    mode: analyze | summarize | describe | all

# Analyze with Role OR Custom Prompt

POST /api/analyze
Content-Type: application/json
```json
{
  "jobId": "<from /api/upload>",
  "role": "marketing" | "po" | "free",
  "prompt": "<optional custom prompt; overrides role if present>",
  "mode": "analyze" | "summarize" | "describe" | "all"
}
```
#Prompt Override Rule

- If prompt is provided, it is used and role is ignored.
- If no prompt, backend uses the role’s default prompt:
    - free → “Give me the transcribed text.”
    - marketing / po → existing structured prompts in ROLE_PROMPTS

# Summary

- Added Mode and new free role; added FREEFORM_PROMPT and updated ROLE_PROMPTS

- Threaded mode through upload/analyze endpoints and pipeline (logging only)

- Kept grid chunking and hard-coded models; prompt override behavior unchanged