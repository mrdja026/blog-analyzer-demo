"use client";

import { useEffect, useRef } from "react";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    type P = { x: number; y: number; vx: number; vy: number; r: number };
    let particles: P[] = [];
    const mouse = { x: 0, y: 0, active: false };

    const random = (min: number, max: number) => Math.random() * (max - min) + min;

    function createParticle(): P {
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

    function drawConnections() {
      const threshold = 120;
      context.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < Math.min(i + 14, particles.length); j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dsq = dx * dx + dy * dy;
          if (dsq < threshold * threshold) {
            const o = 0.18 * (1 - Math.sqrt(dsq) / threshold);
            context.strokeStyle = `rgba(153, 193, 255, ${o.toFixed(3)})`;
            context.beginPath();
            context.moveTo(p1.x, p1.y);
            context.lineTo(p2.x, p2.y);
            context.stroke();
          }
        }
      }
      if (mouse.active) {
        for (const p of particles) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const o = 0.25 * (1 - dist / 120);
            context.strokeStyle = `rgba(106, 227, 255, ${o.toFixed(3)})`;
            context.beginPath();
            context.moveTo(mouse.x, mouse.y);
            context.lineTo(p.x, p.y);
            context.stroke();
          }
        }
      }
    }

    function step() {
      context.clearRect(0, 0, width, height);
      drawConnections();
      for (const p of particles) {
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dsq = dx * dx + dy * dy;
          const influence = 140;
          if (dsq < influence * influence) {
            const dist = Math.sqrt(dsq) || 1;
            const force = ((influence - dist) / influence) * 0.6;
            p.vx += (dx / dist) * force * 0.12;
            p.vy += (dy / dist) * force * 0.12;
          }
        }
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

    function onMove(e: MouseEvent) {
      const rect = canvasEl.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    }
    function onLeave() { mouse.active = false; }

    window.addEventListener("resize", init);
    canvasEl.addEventListener("mousemove", onMove);
    canvasEl.addEventListener("mouseleave", onLeave);
    init();
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", init);
      canvasEl.removeEventListener("mousemove", onMove);
      canvasEl.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const tags = (items: string[]) => (
    <ul className="flex flex-wrap gap-2 m-0 p-0 list-none">
      {items.map((it) => (
        <li
          key={it}
          className="px-3 py-2 rounded-full border border-white/10 bg-white/5 text-[13px] tracking-[0.01em]"
        >
          {it}
        </li>
      ))}
    </ul>
  );

  return (
    <main className="relative min-h-screen grid grid-rows-[1fr_auto]">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0" style={{
          background:
            "radial-gradient(1200px 800px at 20% 10%, rgba(106,227,255,0.10), transparent 55%)," +
            "radial-gradient(1000px 700px at 80% 20%, rgba(155,140,255,0.10), transparent 60%)," +
            "radial-gradient(900px 600px at 50% 80%, rgba(57,255,182,0.08), transparent 60%)," +
            "linear-gradient(180deg, #0b0f14 0%, #0b0f14 100%)",
          filter: "saturate(110%)",
        }} />
        <div className="absolute inset-0">
          <span className="absolute left-[12%] top-[18%] w-[60vmax] h-[60vmax] rounded-full opacity-25 mix-blend-screen blur-[60px] animate-[float_18s_ease-in-out_infinite]"
            style={{ background: "radial-gradient(circle at 30% 30%, #6ae3ff, transparent 60%)" }} />
          <span className="absolute left-[85%] top-[12%] w-[60vmax] h-[60vmax] rounded-full opacity-25 mix-blend-screen blur-[60px] animate-[float_18s_ease-in-out_infinite] [animation-delay:4s]"
            style={{ background: "radial-gradient(circle at 70% 40%, #9b8cff, transparent 60%)" }} />
          <span className="absolute left-[70%] top-[85%] w-[60vmax] h-[60vmax] rounded-full opacity-25 mix-blend-screen blur-[60px] animate-[float_18s_ease-in-out_infinite] [animation-delay:8s]"
            style={{ background: "radial-gradient(circle at 40% 60%, #39ffb6, transparent 60%)" }} />
          <span className="absolute left-[15%] top-[75%] w-[60vmax] h-[60vmax] rounded-full opacity-25 mix-blend-screen blur-[60px] animate-[float_18s_ease-in-out_infinite] [animation-delay:12s]"
            style={{ background: "radial-gradient(circle at 60% 50%, #ffd166, transparent 60%)" }} />
        </div>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,transparent_60%,rgba(0,0,0,0.55)_100%)]" />
      </div>

      {/* Hero */}
      <section className="pt-[min(120px,8vw)] px-6 pb-6 grid place-items-center text-center">
        <h1 className="font-extrabold text-[clamp(36px,8vw,88px)] tracking-[-0.02em] m-0 mb-3 text-[#e7edf4] drop-shadow-[0_10px_40px_rgba(106,227,255,0.08)]">
          mrdjanb<span className="text-[#6ae3ff]">.net</span>
        </h1>
        <p className="m-0 text-[clamp(16px,2.4vw,22px)] text-[#a8b3c4]">10 YOE fullstack engineer</p>
      </section>

      {/* Skills */}
      <section className="px-6 pb-12 max-w-[1200px] w-full mx-auto">
        <div className="grid gap-1 mb-6">
          <h2 className="m-0 text-[clamp(22px,3.2vw,32px)]">Skills</h2>
          <p className="m-0 text-[#a8b3c4] text-sm">A toolkit shaped by a decade of shipping real products</p>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <article className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition will-change-transform hover:-translate-y-0.5 hover:border-white/20">
            <h3 className="m-0 mb-2 text-sm tracking-[0.02em] uppercase text-[#c8d3e0]">Frontend</h3>
            {tags(["React", "Next.js", "TypeScript", "Tailwind CSS", "Vite", "Redux", "Zustand"])}
          </article>

          <article className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:border-white/20">
            <h3 className="m-0 mb-2 text-sm tracking-[0.02em] uppercase text-[#c8d3e0]">Backend</h3>
            {tags(["Node.js", "NestJS", "Express", "GraphQL", "REST", "WebSockets", "tRPC"])}
          </article>

          <article className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:border-white/20">
            <h3 className="m-0 mb-2 text-sm tracking-[0.02em] uppercase text-[#c8d3e0]">Cloud & DevOps</h3>
            {tags(["AWS", "Docker", "Kubernetes", "Terraform", "GitHub Actions", "Vercel", "Cloudflare"])}
          </article>

          <article className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:border-white/20">
            <h3 className="m-0 mb-2 text-sm tracking-[0.02em] uppercase text-[#c8d3e0]">Datastores</h3>
            {tags(["PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "SQLite"])}
          </article>

          <article className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:border-white/20">
            <h3 className="m-0 mb-2 text-sm tracking-[0.02em] uppercase text-[#c8d3e0]">Testing & Quality</h3>
            {tags(["Jest", "Playwright", "Cypress", "Vitest", "Testing Library", "Contract Testing"])}
          </article>

          <article className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:border-white/20">
            <h3 className="m-0 mb-2 text-sm tracking-[0.02em] uppercase text-[#c8d3e0]">Architecture</h3>
            {tags(["Microservices", "Event‑Driven", "Domain‑Driven Design", "CQRS", "Hexagonal", "Monorepos (Nx/Turborepo)"])}
          </article>

          <article className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:border-white/20">
            <h3 className="m-0 mb-2 text-sm tracking-[0.02em] uppercase text-[#c8d3e0]">Observability</h3>
            {tags(["OpenTelemetry", "Prometheus", "Grafana", "Jaeger", "Sentry", "Datadog"])}
          </article>

          <article className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-2xl p-4 border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:border-white/20">
            <h3 className="m-0 mb-2 text-sm tracking-[0.02em] uppercase text-[#c8d3e0]">Messaging</h3>
            {tags(["Kafka", "RabbitMQ", "Pub/Sub", "Event Bus"])}
          </article>
        </div>
      </section>

      <footer className="px-6 pb-14 text-center text-[#a8b3c4] text-sm">
        © {new Date().getFullYear()} mrdjanb.net
      </footer>
    </main>
  );
}

// keyframes for blobs are defined in globals.css
