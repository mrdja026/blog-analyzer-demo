export type SseEvent =
    | { type: "stage"; stage: string }
    | { type: "progress"; current: number; total: number; message?: string }
    | { type: "tokens"; tokens: number }
    | { type: "message"; message: string }
    | { type: "error"; error: string }
    | { type: "done"; result?: string };

export type RoleApi = "marketing" | "po";

const BASE = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) || "http://localhost:3001";

export async function apiHealth(): Promise<{ ok: boolean; gridChunking: string }> {
    const res = await fetch(`${BASE}/api/health`, { method: "GET" });
    if (!res.ok) throw new Error(`health failed: ${res.status}`);
    return res.json();
}

export async function apiUpload(file: File): Promise<string> {
    const form = new FormData();
    form.append("image", file);
    const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    const data = await res.json();
    return data.jobId as string;
}

export function apiStream(
    jobId: string,
    onEvent: (e: SseEvent) => void,
    onError?: (err: MessageEvent | Event) => void
): () => void {
    const es = new EventSource(`${BASE}/api/stream/${jobId}`);
    es.onmessage = (msg) => {
        try {
            const data = JSON.parse(msg.data) as SseEvent;
            onEvent(data);
        } catch {
            // ignore
        }
    };
    es.onerror = (e) => {
        if (onError) onError(e);
    };
    return () => es.close();
}

export async function apiAnalyze(jobId: string, body: { role?: RoleApi; prompt?: string }): Promise<void> {
    const res = await fetch(`${BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, ...body }),
    });
    if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
}

export function mapRoleToApi(role: "Marketing" | "Product Owner"): RoleApi {
    return role === "Marketing" ? "marketing" : "po";
}


