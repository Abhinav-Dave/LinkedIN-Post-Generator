"use client";

import { useCallback, useEffect, useState } from "react";

type TrendItem = {
  trend_id: string;
  headline: string;
  source_url: string;
  source_name: string;
  published_at: string;
  relevance_score: number;
  content_angle: string;
};

type LintFlag = {
  rule: string;
  severity: string;
  suggestion?: string;
  excerpt?: string;
};

type Post = {
  post_id: string;
  hook_archetype: string;
  hook_clarity_score: number;
  body: string;
  char_count: number;
  credibility_signals: string[];
  trend_source: string;
  post_type: string;
  cta_type: string;
  lint_flags: LintFlag[];
};

type GenerateResponse = {
  batch_id: string;
  generated_at: string;
  prompt_version: string;
  posts: Post[];
  failed_slots: number;
  trend_brief_freshness: string | null;
  style_guide_only?: boolean;
  warning_message?: string;
  error?: string;
  message?: string;
  retryAfterSec?: number;
};

export default function Page() {
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [trendCached, setTrendCached] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [meta, setMeta] = useState<Partial<GenerateResponse>>({});
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPosts, setNumPosts] = useState(5);

  const loadTrends = useCallback(async () => {
    setLoadingTrends(true);
    setError(null);
    try {
      const res = await fetch("/api/trends");
      const data = await res.json();
      setTrends(data.items ?? []);
      setTrendCached(data.cached_at ?? null);
    } catch {
      setError("Could not load trends.");
    } finally {
      setLoadingTrends(false);
    }
  }, []);

  useEffect(() => {
    void loadTrends();
  }, [loadTrends]);

  async function refreshTrendsPlaceholder() {
    setError(null);
    await fetch("/api/trends/refresh", { method: "POST" });
    await loadTrends();
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setPosts([]);
    setMeta({});
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ num_posts: numPosts }),
      });
      const data = (await res.json()) as GenerateResponse;
      if (!res.ok) {
        if (data.error === "rate_limited") {
          setError(`Rate limited. Retry in ~${data.retryAfterSec ?? 60}s.`);
        } else {
          setError(data.message || data.error || "Generation failed.");
        }
        return;
      }
      setPosts(data.posts ?? []);
      setMeta(data);
    } catch {
      setError("Network error while generating.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row">
      <aside className="w-full shrink-0 space-y-4 md:w-80">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            LinkedIn Post Generator
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Style guide + trend brief → batched posts → deterministic quality gates.
          </p>
        </div>

        <div className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-200">Trend brief</h2>
            <button
              type="button"
              onClick={() => void refreshTrendsPlaceholder()}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Refresh note
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Cached: {loadingTrends ? "…" : trendCached ?? "—"}
          </p>
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-xs text-slate-300">
            {trends.length === 0 && !loadingTrends && (
              <li className="text-slate-500">
                No trends in DB yet. Run{" "}
                <code className="rounded bg-slate-800 px-1">python ingestion/trend_ingestor.py</code>{" "}
                or wait for GitHub Actions.
              </li>
            )}
            {trends.map((t) => (
              <li key={t.trend_id} className="rounded border border-slate-800/80 bg-slate-950/50 p-2">
                <div className="font-medium text-slate-200">{t.headline}</div>
                <div className="mt-1 text-slate-500">
                  {t.source_name} · score {t.relevance_score}
                </div>
                {t.content_angle ? (
                  <div className="mt-1 text-slate-400">{t.content_angle}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-sm text-slate-300">
            Posts per batch
            <input
              type="number"
              min={1}
              max={12}
              value={numPosts}
              onChange={(e) => setNumPosts(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-blue-500 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {meta.warning_message ? (
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            {meta.warning_message}
          </div>
        ) : null}

        {meta.batch_id ? (
          <p className="text-xs text-slate-500">
            Batch {meta.batch_id} · prompt {meta.prompt_version ?? "—"} · failed slots{" "}
            {meta.failed_slots ?? 0} · trend freshness {meta.trend_brief_freshness ?? "—"}
          </p>
        ) : null}

        <div className="space-y-6">
          {posts.map((p) => (
            <article
              key={p.post_id}
              className="rounded-xl border border-slate-700/80 bg-slate-900/30 p-5 shadow-sm"
            >
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded bg-slate-800 px-2 py-0.5">{p.post_type}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5">{p.hook_archetype}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5">
                  hook score {p.hook_clarity_score}
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5">{p.char_count} chars</span>
                <span className="rounded bg-slate-800 px-2 py-0.5">CTA: {p.cta_type}</span>
              </div>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-100">
                {p.body}
              </pre>
              <div className="mt-3 text-xs text-slate-500">
                Signals: {p.credibility_signals.join(", ") || "—"} · Trend:{" "}
                {p.trend_source === "none" ? "none" : p.trend_source}
              </div>
              {p.lint_flags?.length ? (
                <ul className="mt-3 space-y-1 border-t border-slate-800 pt-3 text-xs text-amber-200/90">
                  {p.lint_flags.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium">{f.rule}</span>
                      {f.suggestion ? ` — ${f.suggestion}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
