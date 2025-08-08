Proposed UI (only UI) informed by UX research
Patterns used: step-based progress for GenAI tasks [Cloudscape “Progressive steps”], determinate/indeterminate progress with ETA and tokens/sec [UX Collective; Cieden], modern file uploader with validation and previews [Uploadcare], role selection via segmented control [Component Gallery], tile/chunk viewers [OpenSeadragon].
Information architecture
Home / New Run
Drag & drop upload (single/multiple), file list, preview, validation (type/size) [Uploadcare guide].
Primary CTA: “Analyze” (disabled until valid).
Configuration (right drawer)
Mode: radio (“Analyze”, “Describe”, “Summarize”, “All”).
Role: segmented control (“Marketing”, “Product Owner”).
Prompt: textarea with helper text.
Models: selects for Vision and Text.
Chunking: switch; when on, show:
Max dim, Aspect ratio, Overlap, “Save chunks” toggle, Output dir.
Progress display: segmented (“Bar”, “Spinner”, “Simple”, “None”).
Metrics: “Show tokens/sec”, “Show elapsed time”.
Debug: switch.
Run / Progress
Progressive steps: Upload → Chunking → Per-chunk analysis → Merge → Summarize → Save [Cloudscape].
For >10s tasks: show ETA or determinate percent; otherwise indeterminate spinner [UX Collective; Cieden].
Live metrics row: tokens/sec, elapsed time; cancel/retry controls; backgroundable jobs [UX patterns for long tasks].
Results
Tabs: “Summary”, “Analysis”, “Chunks”.
Summary: role-structured output sections per role template.
Analysis: detailed extracted/combined content.
Chunks: zoomable viewer with overlays/grid, chunk thumbnails; click-to-focus [OpenSeadragon].
Exports: Download buttons (TXT/JSON/ZIP), Copy to clipboard [frontend download patterns].
History (optional)
Recent runs with status, params, and quick re-run.
Settings (optional)
Default models, role, chunking defaults, output paths.
Component-to-flag mapping
Mode → --mode
Role → --role
Prompt → --prompt
Vision/Text model → --vision-model, --text-model
Progress style → --progress / --no-progress
Debug → --debug
Save results → --save
Chunking toggles/params → --use-chunking, --save-chunks, --output-dir, --chunk-max-dim, --chunk-aspect-ratio, --chunk-overlap
Metrics → --show-tokens-per-second, --show-time-elapsed
Key UX details
Uploader: drag & drop, multi-file, previews, file-type/size validation, clear error messaging, remove/replace [Uploadcare; HMRC patterns].
Progress: avoid loaders <1s, switch to percent/ETA >10s, keep UI responsive, allow cancel/retry; announce with ARIA role="status" and live regions [UX Collective; accessibility patterns].
Role selection: segmented control with 2 options; inline descriptions/tooltips [Component Gallery].
Chunk visualization: grid overlay and tile viewer to inspect chunks; thumbnail strip for quick navigation [OpenSeadragon].
Accessibility: keyboard operable, sufficient contrast, live region updates, reduced motion support; sized touch targets; plain-language copy [Accessibility loading patterns; DOL guidance].
Mobile: responsive layout; uploader supports camera scan; context-aware truncation of heavy views on small screens [DOL mobile guidance].
Export: buttons to download analysis, summary, and zipped chunks; visible success/error toasts; no backend dependency required to trigger downloads from the UI.
Visual/interaction sketch (high-level)
Top bar: App name, History, Settings.
Main: Uploader card (left), Config drawer (right).
On run: Progress view with stepper, progress bar/spinner, metrics row, controls.
After run: Results tabs with export actions; chunk viewer panel with thumbnails.
Tech notes (UI-only)
Works well with your existing Next.js site; Tailwind or MUI for components; stepper and progress primitives from your chosen UI kit.
OpenSeadragon for chunk/tiles viewing overlays [OpenSeadragon].
References
File upload UX best practices: Uploadcare blog [“UX best practices for designing an intuitive file uploader”].
Long-running tasks, progress indicators, ETA guidance: UX Collective; Cieden; Accessibility loading patterns.
Step-based GenAI progress: Cloudscape “Progressive steps”.
Segmented controls: Component Gallery.
Tiled/zoomable chunk viewer: OpenSeadragon.
Would you like me to proceed to: a) low-fidelity wireframes (per screen), or b) a clickable Figma prototype with the above IA?
Implemented: Feature extraction and flow mapping; a UI plan with screens, components, and patterns mapped to CLI flags.
Impact: Clear path to convert the CLI into a usable, accessible UI with best-practice progress handling, role selection, and chunk visualization.