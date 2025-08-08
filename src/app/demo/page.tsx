"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { DragEvent as ReactDragEvent, ChangeEvent } from "react";
import { apiAnalyze, apiHealth, apiStream, apiUpload, mapRoleToApi, mapModeToApi, type SseEvent, type RoleApi } from "@/lib/api";

type Mode = "Analyze" | "Describe" | "Summarize" | "All";
type Role = "Marketing" | "Product Owner" | "Custom";
type ProgressStyle = "Bar" | "Spinner" | "Simple" | "None";

type Step =
    | "Upload"
    | "Chunking"
    | "Per-chunk analysis"
    | "Merge"
    | "Summarize"
    | "Save";

type FileItem = {
    id: string;
    file: File;
    previewUrl?: string;
    error?: string;
};

export default function DemoPage() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Background particle field (decorative)
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctxMaybe = c.getContext("2d");
        if (!ctxMaybe) return;
        const context: CanvasRenderingContext2D = ctxMaybe;
        const canvasEl: HTMLCanvasElement = c;

        let width = 0;
        let height = 0;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let raf = 0;

        type Particle = { x: number; y: number; vx: number; vy: number; r: number };
        let particles: Particle[] = [];

        const random = (min: number, max: number) => Math.random() * (max - min) + min;

        function createParticle(): Particle {
            const speed = random(0.15, 0.45);
            const angle = random(0, Math.PI * 2);
            return {
                x: random(0, width),
                y: random(0, height),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: random(1.0, 2.2),
            };
        }

        function init() {
            width = canvasEl.clientWidth;
            height = canvasEl.clientHeight;
            canvasEl.width = Math.floor(width * dpr);
            canvasEl.height = Math.floor(height * dpr);
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            const area = width * height;
            const target = Math.max(40, Math.min(140, Math.floor(area * 0.00006)));
            particles = Array.from({ length: target }, createParticle);
        }

        function step() {
            context.clearRect(0, 0, width, height);
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < -20) p.x = width + 20;
                if (p.x > width + 20) p.x = -20;
                if (p.y < -20) p.y = height + 20;
                if (p.y > height + 20) p.y = -20;
                p.vx *= 0.995;
                p.vy *= 0.995;
                context.beginPath();
                context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                context.fillStyle = "rgba(231, 237, 244, 0.85)";
                context.shadowColor = "rgba(106, 227, 255, 0.35)";
                context.shadowBlur = 8;
                context.fill();
                context.shadowBlur = 0;
            }
            raf = requestAnimationFrame(step);
        }

        window.addEventListener("resize", init);
        init();
        raf = requestAnimationFrame(step);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", init);
        };
    }, []);

    // Uploader state
    const [items, setItems] = useState<FileItem[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const maxFileSizeBytes = 10 * 1024 * 1024; // 10MB
    const acceptedMime = ["image/png", "image/jpeg", "image/webp"]; // images only

    const addFiles = useCallback((files: FileList | File[]) => {
        const arr = Array.from(files);
        const next: FileItem[] = arr.map((file) => {
            const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random()
                .toString(36)
                .slice(2, 8)}`;
            let error: string | undefined;
            if (!acceptedMime.includes(file.type)) {
                error = "Unsupported file type";
            } else if (file.size > maxFileSizeBytes) {
                error = "File too large (max 10MB)";
            }
            const previewUrl = file.type.startsWith("image/")
                ? URL.createObjectURL(file)
                : undefined;
            return { id, file, previewUrl, error };
        });
        setItems((prev) => [...prev, ...next]);
    }, []);

    useEffect(() => {
        return () => {
            // Revoke created object URLs
            items.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
        };
    }, [items]);

    const validItems = useMemo(() => items.filter((i) => !i.error), [items]);
    const canAnalyze = validItems.length > 0;

    // Config state
    const [mode, setMode] = useState<Mode>("Analyze");
    const [role, setRole] = useState<Role>("Marketing");
    const [prompt, setPrompt] = useState("");
    const [visionModel, setVisionModel] = useState("gpt-4o-mini");
    const [textModel, setTextModel] = useState("gpt-4.1-mini");
    const [chunking, setChunking] = useState(false);
    const [chunkMaxDim, setChunkMaxDim] = useState(1024);
    const [chunkAspect, setChunkAspect] = useState("1:1");
    const [chunkOverlap, setChunkOverlap] = useState(10);
    const [saveChunks, setSaveChunks] = useState(false);
    const [outputDir, setOutputDir] = useState("/downloads");
    const [progressStyle, setProgressStyle] = useState<ProgressStyle>("Bar");
    const [showTps, setShowTps] = useState(true);
    const [showElapsed, setShowElapsed] = useState(true);
    const [debug, setDebug] = useState(false);
    const [configOpen, setConfigOpen] = useState(true);
    const [demoMode, setDemoMode] = useState<boolean>(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const [resultText, setResultText] = useState<string>("");
    const [logs, setLogs] = useState<string[]>([]);

    const log = useCallback((msg: string) => {
        const ts = new Date().toLocaleTimeString();
        setLogs((prev) => [...prev, `[${ts}] ${msg}`].slice(-500));
        // eslint-disable-next-line no-console
        console.log(`[UI] ${msg}`);
    }, []);

    // Run/progress state
    const steps: Step[] = useMemo(
        () => ["Upload", "Chunking", "Per-chunk analysis", "Merge", "Summarize", "Save"],
        []
    );
    const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
    const [running, setRunning] = useState(false);
    const [canceled, setCanceled] = useState(false);
    const [percent, setPercent] = useState(0);
    const [startAt, setStartAt] = useState<number | null>(null);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const elapsedSec = useMemo(() => {
        if (!startAt) return 0;
        return Math.floor((Date.now() - startAt) / 1000);
    }, [startAt, percent]);

    const [tokensPerSecond, setTokensPerSecond] = useState<number>(0);

    // Simulated run sequence (fallback / demo mode)
    const runSimulated = useCallback(async () => {
        log("Starting simulated run");
        setRunning(true);
        setCanceled(false);
        setError(null);
        setDone(false);
        setStartAt(Date.now());
        setActiveStepIndex(0);
        setPercent(0);
        setTokensPerSecond(0);
        setResultText("");

        const stepDurationsMs = [1200, 2500, 3500, 1000, 1500, 800];
        try {
            for (let i = 0; i < steps.length; i++) {
                if (canceled) break;
                setActiveStepIndex(i);
                const duration = stepDurationsMs[i];
                const start = Date.now();
                if (progressStyle === "Bar") {
                    await new Promise<void>((resolve) => {
                        const id = setInterval(() => {
                            const p = Math.min(99, Math.floor(((Date.now() - start) / duration) * 100));
                            setPercent(p);
                            setTokensPerSecond(Math.round(20 + Math.random() * 80));
                            if (Date.now() - start >= duration) {
                                clearInterval(id);
                                setPercent(100);
                                resolve();
                            }
                        }, 80);
                    });
                } else {
                    await new Promise((r) => setTimeout(r, duration));
                }
            }
            if (!canceled) {
                setDone(true);
                setResultText("Demo mode result: High-level findings... (simulated)");
                log("Simulated run completed");
            }
        } catch (e) {
            setError("Unexpected error");
            log(`Simulated run error: ${String(e)}`);
        } finally {
            setRunning(false);
            setActiveStepIndex((idx) => (canceled ? -1 : idx));
        }
    }, [steps, progressStyle, canceled, log]);

    // Live run sequence via API with SSE; uses only role + first valid image
    const runLive = useCallback(async () => {
        log("Starting live run");
        setRunning(true);
        setCanceled(false);
        setError(null);
        setDone(false);
        setStartAt(Date.now());
        setActiveStepIndex(0);
        setPercent(0);
        setTokensPerSecond(0);
        setResultText("");
        setJobId(null);

        try {
            log("Health check...");
            await apiHealth();
            log("Health OK");

            const first = validItems[0];
            if (!first) throw new Error("No valid file");

            log(`Uploading: ${first.file.name} (${first.file.type}, ${first.file.size} bytes)`);
            const newJobId = await apiUpload(first.file, mapModeToApi(mode));
            setJobId(newJobId);
            log(`Upload OK: jobId=${newJobId}`);

            let analyzeStarted = false;
            log("Opening SSE stream");
            const close = apiStream(newJobId, (ev: SseEvent) => {
                if (ev.type === "stage") {
                    log(`SSE stage: ${ev.stage}`);
                    if (ev.stage === "chunking") setActiveStepIndex(1);
                    else if (ev.stage === "ocr") setActiveStepIndex(2);
                    else if (ev.stage === "combining") setActiveStepIndex(3);
                    else if (ev.stage === "analyzing") setActiveStepIndex(4);
                } else if (ev.type === "progress") {
                    log(`SSE progress: ${ev.current}/${ev.total}`);
                    if (typeof ev.total === "number" && ev.total > 0) {
                        const pct = Math.min(99, Math.floor((ev.current / ev.total) * 100));
                        setPercent(pct);
                    }
                } else if (ev.type === "tokens") {
                    const rate = typeof ev.rate === "number" ? ev.rate : (typeof ev.tokens === "number" ? ev.tokens : 0);
                    const total = typeof ev.total === "number" ? ev.total : undefined;
                    log(`SSE tokens: rate=${Math.round(rate)}${total !== undefined ? ` total=${total}` : ""}`);
                    setTokensPerSecond(Math.round(rate));
                } else if (ev.type === "error") {
                    setError(ev.error);
                    log(`SSE error: ${ev.error}`);
                } else if (ev.type === "done") {
                    if (typeof ev.result === "string" && ev.result.length > 0) {
                        setResultText(ev.result);
                        setDone(true);
                        setPercent(100);
                        setRunning(false);
                        log("SSE done with result (analysis finished)");
                        close();
                    } else if (!analyzeStarted) {
                        analyzeStarted = true;
                        const analyzeBody: { role?: RoleApi; prompt?: string; mode?: ReturnType<typeof mapModeToApi> } = {
                            mode: mapModeToApi(mode),
                        };
                        const trimmedPrompt = prompt.trim();
                        if (trimmedPrompt) {
                            analyzeBody.prompt = trimmedPrompt;
                        } else if (role !== "Custom") {
                            analyzeBody.role = mapRoleToApi(role);
                        } else {
                            analyzeBody.role = "free";
                        }
                        log(
                            `Trigger analyze (mode=${analyzeBody.mode})${analyzeBody.role ? ` role=${analyzeBody.role}` : ""}${analyzeBody.prompt ? " with prompt" : ""}`
                        );
                        apiAnalyze(newJobId, analyzeBody)
                            .then(() => log("Analyze accepted (202)"))
                            .catch((e) => {
                                setError(String(e));
                                log(`Analyze error: ${String(e)}`);
                            });
                    }
                }
            }, (err) => {
                log(`SSE connection error: ${JSON.stringify(err instanceof Event ? { type: err.type } : err)}`);
            });
        } catch (e) {
            setError(String(e));
            log(`Live run error: ${String(e)}`);
            setRunning(false);
        }
    }, [validItems, role, prompt, log]);

    const run = useCallback(async () => {
        if (demoMode) {
            await runSimulated();
        } else {
            await runLive();
        }
    }, [demoMode, runSimulated, runLive]);

    const cancelRun = useCallback(() => {
        setCanceled(true);
        setRunning(false);
    }, []);

    const resetRun = useCallback(() => {
        setCanceled(false);
        setRunning(false);
        setDone(false);
        setError(null);
        setActiveStepIndex(-1);
        setPercent(0);
        setStartAt(null);
        setTokensPerSecond(0);
        setResultText("");
        setJobId(null);
    }, []);

    // Exports (mocked)
    const exportText = useCallback(() => {
        const content = `Role: ${role}\nMode: ${mode}\nFiles: ${validItems
            .map((f) => f.file.name)
            .join(", ")}\nJob ID: ${jobId ?? "-"}\n\nResult:\n${resultText || "(no result)"}`;
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "summary.txt";
        a.click();
        URL.revokeObjectURL(url);
    }, [role, mode, validItems, jobId, resultText]);

    const exportJson = useCallback(() => {
        const payload = {
            jobId,
            role,
            mode,
            prompt,
            visionModel,
            textModel,
            chunking: chunking ? { maxDim: chunkMaxDim, aspect: chunkAspect, overlap: chunkOverlap } : null,
            files: validItems.map((f) => ({ name: f.file.name, size: f.file.size })),
            result: resultText || null,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "analysis.json";
        a.click();
        URL.revokeObjectURL(url);
    }, [jobId, role, mode, prompt, visionModel, textModel, chunking, chunkMaxDim, chunkAspect, chunkOverlap, validItems, resultText]);

    const exportZip = useCallback(() => {
        // No real zip generation; produce a placeholder binary-like blob
        const content = "This would contain chunks and results in a ZIP.";
        const blob = new Blob([content], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "results.zip";
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    // Helpers
    const removeItem = (id: string) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
    };

    const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const onBrowse = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(e.target.files);
    };

    const statusText = running
        ? `Running: ${steps[activeStepIndex] ?? ""}`
        : done
            ? "Completed"
            : error
                ? `Error: ${error}`
                : "Idle";

    return (
        <main className="relative min-h-screen grid grid-rows-[1fr_auto]">
            {/* Background */}
            <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                <div
                    className="absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(1200px 800px at 20% 10%, rgba(106,227,255,0.10), transparent 55%)," +
                            "radial-gradient(1000px 700px at 80% 20%, rgba(155,140,255,0.10), transparent 60%)," +
                            "radial-gradient(900px 600px at 50% 80%, rgba(57,255,182,0.08), transparent 60%)," +
                            "linear-gradient(180deg, #0b0f14 0%, #0b0f14 100%)",
                        filter: "saturate(110%)",
                    }}
                />
                <div className="absolute inset-0">
                    <span
                        className="absolute left-[12%] top-[18%] w-[60vmax] h-[60vmax] rounded-full opacity-25 mix-blend-screen blur-[60px] animate-[float_18s_ease-in-out_infinite]"
                        style={{ background: "radial-gradient(circle at 30% 30%, #6ae3ff, transparent 60%)" }}
                    />
                    <span
                        className="absolute left-[85%] top-[12%] w-[60vmax] h-[60vmax] rounded-full opacity-25 mix-blend-screen blur-[60px] animate-[float_18s_ease-in-out_infinite] [animation-delay:4s]"
                        style={{ background: "radial-gradient(circle at 70% 40%, #9b8cff, transparent 60%)" }}
                    />
                    <span
                        className="absolute left-[70%] top-[85%] w-[60vmax] h-[60vmax] rounded-full opacity-25 mix-blend-screen blur-[60px] animate-[float_18s_ease-in-out_infinite] [animation-delay:8s]"
                        style={{ background: "radial-gradient(circle at 40% 60%, #39ffb6, transparent 60%)" }}
                    />
                    <span
                        className="absolute left-[15%] top-[75%] w-[60vmax] h-[60vmax] rounded-full opacity-25 mix-blend-screen blur-[60px] animate-[float_18s_ease-in-out_infinite] [animation-delay:12s]"
                        style={{ background: "radial-gradient(circle at 60% 50%, #ffd166, transparent 60%)" }}
                    />
                </div>
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
                <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,transparent_60%,rgba(0,0,0,0.55)_100%)]" />
            </div>

            {/* Header */}
            <section className="pt-[min(120px,8vw)] px-6 pb-4 grid place-items-center text-center">
                <h1 className="font-extrabold text-[clamp(28px,6vw,48px)] tracking-[-0.02em] m-0 mb-2 text-[#e7edf4]">
                    GenAI Analyzer — Demo
                </h1>
                <p className="m-0 text-[#a8b3c4] max-w-[70ch]">
                    Drag & drop files, configure analysis, then simulate a run with progress, metrics, and
                    results. UI-only per the plan.
                </p>
            </section>

            {/* Main content */}
            <section className="px-6 pb-12 max-w-[1200px] w-full mx-auto grid grid-cols-12 gap-4 items-start">
                {/* Uploader card */}
                <article className="col-span-12 lg:col-span-7 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px]">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h2 className="m-0 text-lg">Upload</h2>
                        <button
                            className="lg:hidden text-sm px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:border-white/20"
                            onClick={() => setConfigOpen((v) => !v)}
                        >
                            {configOpen ? "Hide config" : "Show config"}
                        </button>
                    </div>

                    {/* Drag & drop */}
                    <div
                        onDragEnter={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragActive(true);
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragActive(false);
                        }}
                        onDrop={onDrop}
                        className={`rounded-xl border-2 border-dashed p-6 grid place-items-center text-center transition ${dragActive ? "border-[#6ae3ff]/60 bg-white/[0.03]" : "border-white/15 bg-white/[0.02]"
                            }`}
                        aria-label="File uploader"
                    >
                        <div className="grid gap-2">
                            <p className="m-0 text-sm text-[#c8d3e0]">
                                Drag & drop files here, or
                                <label className="ml-1 underline decoration-dotted cursor-pointer text-[#6ae3ff]">
                                    browse
                                    <input
                                        className="sr-only"
                                        type="file"
                                        multiple
                                        accept={acceptedMime.join(",")}
                                        onChange={onBrowse}
                                    />
                                </label>
                            </p>
                            <p className="m-0 text-xs text-[#a8b3c4]">
                                Accepted: PNG, JPEG, WEBP. Max 10MB each. Only the first image will be analyzed in demo.
                            </p>
                        </div>
                    </div>

                    {/* File list */}
                    {items.length > 0 && (
                        <ul className="mt-4 grid gap-3 m-0 p-0 list-none">
                            {items.map((it) => (
                                <li
                                    key={it.id}
                                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02]"
                                >
                                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 grid place-items-center">
                                        {it.previewUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={it.previewUrl} alt="preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-xs text-[#a8b3c4]">{it.file.type || "file"}</span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="m-0 truncate">{it.file.name}</p>
                                            {it.error ? (
                                                <span className="text-xs text-red-300">{it.error}</span>
                                            ) : (
                                                <span className="text-xs text-[#a8b3c4]">
                                                    {(it.file.size / 1024).toFixed(1)} KB
                                                </span>
                                            )}
                                        </div>
                                        <p className="m-0 text-xs text-[#a8b3c4] truncate">{it.file.type || "unknown"}</p>
                                    </div>
                                    <button
                                        onClick={() => removeItem(it.id)}
                                        className="text-sm px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:border-white/20"
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Run controls & status */}
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button
                            onClick={run}
                            disabled={!canAnalyze || running}
                            className="px-4 py-2 rounded-full border border-white/10 bg-[#6ae3ff]/10 text-[#e7f7ff] hover:border-[#6ae3ff]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Analyze
                        </button>
                        {running ? (
                            <button
                                onClick={cancelRun}
                                className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:border-white/20"
                            >
                                Cancel
                            </button>
                        ) : (
                            <button
                                onClick={resetRun}
                                className="px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:border-white/20"
                            >
                                Reset
                            </button>
                        )}

                        <div role="status" aria-live="polite" className="text-sm text-[#a8b3c4] ml-auto flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full border text-xs ${demoMode ? "border-white/10 bg-white/5" : "border-emerald-400/30 bg-emerald-400/10"}`}>
                                {demoMode ? "Demo mode" : "Live API"}
                            </span>
                            {statusText}
                        </div>
                    </div>

                    {/* Stepper + Progress */}
                    {(running || done || error) && (
                        <div className="mt-5 grid gap-3">
                            <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2 m-0 p-0 list-none">
                                {steps.map((s, idx) => {
                                    const state =
                                        idx < activeStepIndex
                                            ? "done"
                                            : idx === activeStepIndex && running
                                                ? "active"
                                                : idx === activeStepIndex && done
                                                    ? "done"
                                                    : "pending";
                                    return (
                                        <li
                                            key={s}
                                            className={`rounded-lg px-3 py-2 text-sm border ${state === "done"
                                                ? "border-emerald-400/30 bg-emerald-400/10"
                                                : state === "active"
                                                    ? "border-[#6ae3ff]/40 bg-[#6ae3ff]/10"
                                                    : "border-white/10 bg-white/[0.02]"
                                                }`}
                                        >
                                            <span className="opacity-80">{s}</span>
                                        </li>
                                    );
                                })}
                            </ol>

                            {progressStyle === "Bar" && running && (
                                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-[#6ae3ff] to-[#9b8cff] transition-[width] duration-75"
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>
                            )}
                            {progressStyle === "Spinner" && running && (
                                <div className="flex items-center gap-3 text-sm text-[#a8b3c4]">
                                    <span className="inline-block w-4 h-4 rounded-full border-2 border-[#6ae3ff]/60 border-t-transparent animate-spin" />
                                    Working...
                                </div>
                            )}
                            {progressStyle === "Simple" && running && (
                                <div className="text-sm text-[#a8b3c4]">Processing...</div>
                            )}

                            {/* Metrics */}
                            {(showElapsed || showTps) && (
                                <div className="flex flex-wrap items-center gap-4 text-sm text-[#c8d3e0]">
                                    {showElapsed && (
                                        <span>
                                            Elapsed: <span className="text-[#e7edf4]">{elapsedSec}s</span>
                                        </span>
                                    )}
                                    {showTps && running && (
                                        <span>
                                            Tokens/sec: <span className="text-[#e7edf4]">{tokensPerSecond}</span>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Results */}
                    {done && !error && (
                        <div className="mt-6 grid gap-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <button onClick={exportText} className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:border-white/20 text-sm">
                                    Download TXT
                                </button>
                                <button onClick={exportJson} className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:border-white/20 text-sm">
                                    Download JSON
                                </button>
                                <button onClick={exportZip} className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:border-white/20 text-sm">
                                    Download ZIP
                                </button>
                            </div>

                            <ResultsTabs items={validItems} role={role} resultText={resultText} />

                            {/* Logs panel */}
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="m-0 text-sm text-[#c8d3e0]">Logs</h3>
                                    <button
                                        type="button"
                                        onClick={() => setLogs([])}
                                        className="text-xs px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:border-white/20"
                                    >
                                        Clear
                                    </button>
                                </div>
                                <pre className="text-xs whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 max-h-56 overflow-auto">
                                    {logs.join("\n") || "(no logs)"}
                                </pre>
                            </div>
                        </div>
                    )}
                </article>

                {/* Config drawer */}
                <aside
                    className={`col-span-12 lg:col-span-5 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] ${configOpen ? "block" : "hidden lg:block"
                        }`}
                >
                    <h2 className="m-0 text-lg mb-3">Configuration</h2>

                    {/* Mode */}
                    <fieldset className="mb-4">
                        <legend className="text-sm text-[#c8d3e0] mb-1">Mode</legend>
                        <div className="grid grid-cols-2 gap-2">
                            {["Analyze", "Describe", "Summarize", "All"].map((m) => (
                                <label key={m} className={`px-3 py-2 rounded-lg border text-sm cursor-pointer ${mode === m
                                    ? "border-[#6ae3ff]/40 bg-[#6ae3ff]/10"
                                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                                    }`}>
                                    <input
                                        type="radio"
                                        name="mode"
                                        value={m}
                                        className="sr-only"
                                        checked={mode === (m as Mode)}
                                        onChange={() => setMode(m as Mode)}
                                    />
                                    {m}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {/* Role segmented control */}
                    <fieldset className="mb-4">
                        <legend className="text-sm text-[#c8d3e0] mb-1">Role</legend>
                        <div className="inline-flex rounded-full border border-white/10 overflow-hidden">
                            {["Marketing", "Product Owner", "Custom"].map((r) => (
                                <button
                                    type="button"
                                    key={r}
                                    onClick={() => setRole(r as Role)}
                                    className={`px-4 py-2 text-sm ${role === r
                                        ? "bg-[#6ae3ff]/15 text-white"
                                        : "bg-transparent text-[#c8d3e0] hover:bg-white/[0.04]"
                                        }`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    {/* Prompt */}
                    <div className="mb-4">
                        <label className="block text-sm text-[#c8d3e0] mb-1" htmlFor="prompt">Prompt</label>
                        <textarea
                            id="prompt"
                            rows={4}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Optional guidance for the model..."
                            className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-2 text-sm outline-none focus:border-[#6ae3ff]/40"
                        />
                        <p className="m-0 mt-1 text-xs text-[#a8b3c4]">Optional. If provided, this prompt will be sent to the backend and can override the default prompt.</p>
                    </div>

                    {/* Models */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div>
                            <label className="block text-sm text-[#c8d3e0] mb-1" htmlFor="vision">Vision model</label>
                            <select
                                id="vision"
                                value={visionModel}
                                onChange={(e) => setVisionModel(e.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-2 text-sm outline-none focus:border-[#6ae3ff]/40"
                            >
                                <option value="gpt-4o-mini">gpt-4o-mini</option>
                                <option value="gpt-4o">gpt-4o</option>
                                <option value="claude-3.7-sonnet">claude-3.7-sonnet</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-[#c8d3e0] mb-1" htmlFor="text">Text model</label>
                            <select
                                id="text"
                                value={textModel}
                                onChange={(e) => setTextModel(e.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-2 text-sm outline-none focus:border-[#6ae3ff]/40"
                            >
                                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                                <option value="gpt-4.1">gpt-4.1</option>
                                <option value="claude-3.7-haiku">claude-3.7-haiku</option>
                            </select>
                        </div>
                    </div>

                    {/* Chunking */}
                    <fieldset className="mb-4">
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={chunking} onChange={(e) => setChunking(e.target.checked)} />
                            Use chunking
                        </label>
                        {chunking && (
                            <div className="mt-3 grid gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                <label className="grid gap-1 text-sm">
                                    <span className="text-[#c8d3e0]">Max dim: {chunkMaxDim}px</span>
                                    <input
                                        type="range"
                                        min={256}
                                        max={2048}
                                        step={64}
                                        value={chunkMaxDim}
                                        onChange={(e) => setChunkMaxDim(parseInt(e.target.value))}
                                    />
                                </label>
                                <label className="grid gap-1 text-sm">
                                    <span className="text-[#c8d3e0]">Aspect ratio</span>
                                    <select
                                        value={chunkAspect}
                                        onChange={(e) => setChunkAspect(e.target.value)}
                                        className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-sm"
                                    >
                                        <option>1:1</option>
                                        <option>4:3</option>
                                        <option>16:9</option>
                                    </select>
                                </label>
                                <label className="grid gap-1 text-sm">
                                    <span className="text-[#c8d3e0]">Overlap: {chunkOverlap}%</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={40}
                                        step={1}
                                        value={chunkOverlap}
                                        onChange={(e) => setChunkOverlap(parseInt(e.target.value))}
                                    />
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={saveChunks} onChange={(e) => setSaveChunks(e.target.checked)} />
                                    Save chunks
                                </label>
                                <label className="grid gap-1 text-sm">
                                    <span className="text-[#c8d3e0]">Output dir</span>
                                    <input
                                        type="text"
                                        value={outputDir}
                                        onChange={(e) => setOutputDir(e.target.value)}
                                        className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-sm"
                                    />
                                </label>
                            </div>
                        )}
                    </fieldset>

                    {/* Progress & Metrics */}
                    <fieldset className="mb-4">
                        <legend className="text-sm text-[#c8d3e0] mb-1">Progress display</legend>
                        <div className="inline-flex rounded-full border border-white/10 overflow-hidden">
                            {["Bar", "Spinner", "Simple", "None"].map((p) => (
                                <button
                                    type="button"
                                    key={p}
                                    onClick={() => setProgressStyle(p as ProgressStyle)}
                                    className={`px-4 py-2 text-sm ${progressStyle === p
                                        ? "bg-[#6ae3ff]/15 text-white"
                                        : "bg-transparent text-[#c8d3e0] hover:bg-white/[0.04]"
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="mb-4 grid gap-2">
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showTps} onChange={(e) => setShowTps(e.target.checked)} />
                            Show tokens/sec
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={showElapsed} onChange={(e) => setShowElapsed(e.target.checked)} />
                            Show elapsed time
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
                            Debug
                        </label>
                    </fieldset>

                    <div className="mb-4">
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} />
                            Simple demo mode (ignores mode, prompt, model and chunking settings)
                        </label>
                    </div>

                    {debug && (
                        <pre className="text-xs whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 overflow-auto max-h-64">
                            {JSON.stringify({ demoMode, mode, role, prompt, visionModel, textModel, chunking, chunkMaxDim, chunkAspect, chunkOverlap, saveChunks, outputDir, progressStyle, jobId, resultPreview: resultText?.slice(0, 80) }, null, 2)}
                        </pre>
                    )}
                </aside>
            </section>

            <footer className="px-6 pb-14 text-center text-[#a8b3c4] text-sm">
                Live mode connects to the local API; demo mode simulates the flow and results.
            </footer>
        </main>
    );
}

function ResultsTabs({ items, role, resultText }: { items: FileItem[]; role: Role; resultText?: string }) {
    const [tab, setTab] = useState<"Summary" | "Analysis" | "Chunks">("Summary");
    const [selectedIdx, setSelectedIdx] = useState(0);

    const images = items.filter((i) => i.previewUrl);

    return (
        <div className="grid gap-4">
            <div className="inline-flex rounded-full border border-white/10 overflow-hidden">
                {["Summary", "Analysis", "Chunks"].map((t) => (
                    <button
                        key={t}
                        className={`px-4 py-2 text-sm ${tab === t
                            ? "bg-[#6ae3ff]/15 text-white"
                            : "bg-transparent text-[#c8d3e0] hover:bg-white/[0.04]"
                            }`}
                        onClick={() => setTab(t as typeof tab)}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {tab === "Summary" && (
                <div className="grid gap-2 text-sm text-[#c8d3e0]">
                    <p className="m-0 text-[#e7edf4]">Summary for role: {role}</p>
                    {resultText ? (
                        <pre className="m-0 whitespace-pre-wrap text-[#c8d3e0] bg-white/5 rounded-lg p-3 border border-white/10">{resultText}</pre>
                    ) : (
                        <ul className="list-disc pl-5 m-0">
                            <li>Key insights extracted from content...</li>
                            <li>Opportunities and risks highlighted...</li>
                            <li>Recommended next steps tailored to {role}...</li>
                        </ul>
                    )}
                </div>
            )}

            {tab === "Analysis" && (
                <div className="grid gap-2 text-sm text-[#c8d3e0]">
                    <p className="m-0">Combined analysis across {items.length} files:</p>
                    <ul className="list-disc pl-5 m-0">
                        {items.map((f) => (
                            <li key={f.id} className="truncate">
                                {f.file.name} — {f.file.type || "unknown"} — {Math.round(f.file.size / 1024)} KB
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {tab === "Chunks" && (
                <div className="grid gap-3">
                    <div className="relative w-full aspect-[16/10] rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                        {/* Zoomable placeholder with grid overlay */}
                        {images[selectedIdx]?.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={images[selectedIdx].previewUrl}
                                alt="chunk view"
                                className="absolute inset-0 w-full h-full object-contain"
                            />
                        ) : (
                            <div className="absolute inset-0 grid place-items-center text-sm text-[#a8b3c4]">
                                No image previews available
                            </div>
                        )}
                        <div
                            className="absolute inset-0 pointer-events-none opacity-50"
                            style={{
                                backgroundImage:
                                    "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
                                backgroundSize: "32px 32px, 32px 32px",
                            }}
                        />
                    </div>

                    {/* Thumbnails */}
                    <div className="flex overflow-x-auto gap-2 p-1 rounded-lg border border-white/10 bg-white/[0.02]">
                        {images.length === 0 ? (
                            <div className="text-sm text-[#a8b3c4] px-2 py-1">No image thumbnails</div>
                        ) : (
                            images.map((img, idx) => (
                                <button
                                    key={img.id}
                                    onClick={() => setSelectedIdx(idx)}
                                    className={`flex-none w-20 h-16 rounded-md overflow-hidden border ${selectedIdx === idx ? "border-[#6ae3ff]/60" : "border-white/10 hover:border-white/20"
                                        }`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={img.previewUrl} alt="thumb" className="w-full h-full object-cover" />
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
