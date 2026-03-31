"use client";

import { useCallback, useEffect, useState } from "react";

const VOICE_PRESETS = [
  { value: "human_balanced", label: "Human Balanced" },
  { value: "sharp_sarcastic", label: "Sharp & Sarcastic" },
  { value: "professional_warm", label: "Professional Warm" },
] as const;

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

function LintFlagRow({ flag }: { flag: LintFlag }) {
  const sev = flag.severity === "BLOCK" ? "BLOCK" : "WARN";
  const isBlock = sev === "BLOCK";
  return (
    <li className="flex flex-col gap-1 rounded border border-slate-800/90 bg-slate-950/60 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            isBlock
              ? "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-100 bg-red-900/70 ring-1 ring-red-700/60"
              : "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 bg-amber-900/50 ring-1 ring-amber-700/50"
          }
        >
          {sev}
        </span>
        <span className="font-medium text-slate-200">{flag.rule}</span>
      </div>
      {flag.suggestion ? (
        <span className="text-slate-400">{flag.suggestion}</span>
      ) : null}
      {flag.excerpt ? (
        <span className="italic text-slate-500">&ldquo;{flag.excerpt}&rdquo;</span>
      ) : null}
    </li>
  );
}

export default function Page() {
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [trendCached, setTrendCached] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [meta, setMeta] = useState<Partial<GenerateResponse>>({});
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [refreshingTrends, setRefreshingTrends] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [numPosts, setNumPosts] = useState(5);
  const [voicePreset, setVoicePreset] = useState<(typeof VOICE_PRESETS)[number]["value"]>(
    "human_balanced",
  );

  const loadTrends = useCallback(async () => {
    setLoadingTrends(true);
    setTrendsError(null);
    try {
      const res = await fetch("/api/trends");
      const data = (await res.json()) as {
        items?: TrendItem[];
        cached_at?: string | null;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setTrendsError(
          typeof data.message === "string"
            ? data.message
            : typeof data.error === "string"
              ? data.error
              : `Trend brief unavailable (HTTP ${res.status}).`,
        );
        setTrends([]);
        setTrendCached(null);
        return;
      }
      setTrends(data.items ?? []);
      setTrendCached(data.cached_at ?? null);
    } catch {
      setTrendsError("Could not load trends.");
      setTrends([]);
      setTrendCached(null);
    } finally {
      setLoadingTrends(false);
    }
  }, []);

  useEffect(() => {
    void loadTrends();
  }, [loadTrends]);

  async function refreshTrends() {
    setTrendsError(null);
    setRefreshingTrends(true);
    try {
      const res = await fetch("/api/trends/refresh", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) {
        setTrendsError(data.message || "Refresh request failed.");
        return;
      }
      await loadTrends();
    } catch {
      setTrendsError("Network error while refreshing trend brief.");
    } finally {
      setRefreshingTrends(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setGenerateError(null);
    setPosts([]);
    setMeta({});
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ num_posts: numPosts, voice_preset: voicePreset }),
      });
      const data = (await res.json()) as GenerateResponse;
      if (!res.ok) {
        if (data.error === "rate_limited") {
          setGenerateError(`Rate limited. Retry in ~${data.retryAfterSec ?? 60}s.`);
        } else {
          setGenerateError(data.message || data.error || "Generation failed.");
        }
        return;
      }
      setPosts(data.posts ?? []);
      setMeta(data);
    } catch {
      setGenerateError("Network error while generating.");
    } finally {
      setGenerating(false);
    }
  }

  const trendSidebarBusy = loadingTrends || refreshingTrends;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row">
      <aside className="w-full shrink-0 space-y-4 md:w-80" aria-label="Trend brief">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            LinkedIn Post Generator
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Style guide + trend brief -&gt; batched posts -&gt; deterministic quality gates.
          </p>
        </div>

        <div className="rounded-lg border border-slate-700/80 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-200">Trend brief</h2>
            <button
              type="button"
              onClick={() => void refreshTrends()}
              disabled={trendSidebarBusy}
              title="Runs Python trend ingest on this machine, then reloads the list from SQLite. Requires Python 3 + pip install -r requirements.txt."
              className="text-xs text-blue-400 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshingTrends ? "Reloading..." : "Reload list"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Brief cached at (max of shown rows):{" "}
            {loadingTrends && !refreshingTrends ? "..." : trendCached ?? "-"}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
            Trends: HN/Reddit/GitHub -&gt; <code className="text-slate-500">trend_items</code> via{" "}
            <code className="text-slate-500">trend_ingestor.py</code> (Reload list runs it locally). Apify is
            for LinkedIn corpus only.
          </p>
          {trendsError ? (
            <p
              className="mt-2 rounded border border-red-900/50 bg-red-950/30 px-2 py-1.5 text-xs text-red-200"
              role="alert"
            >
              {trendsError}
            </p>
          ) : null}
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-xs text-slate-300">
            {loadingTrends && trends.length === 0 ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <li
                    key={i}
                    className="animate-pulse rounded border border-slate-800/80 bg-slate-950/50 p-2"
                  >
                    <div className="h-3 w-full max-w-[280px] rounded bg-slate-800" />
                    <div className="mt-2 h-2 w-2/3 rounded bg-slate-800/80" />
                  </li>
                ))}
              </>
            ) : null}
            {!loadingTrends && trends.length === 0 && !trendsError ? (
              <li className="text-slate-500">
                No trends in DB yet. Run{" "}
                <code className="rounded bg-slate-800 px-1">python ingestion/trend_ingestor.py</code>{" "}
                or wait for GitHub Actions.
              </li>
            ) : null}
            {trends.length > 0
              ? trends.map((t) => (
                  <li
                    key={t.trend_id}
                    className="rounded border border-slate-800/80 bg-slate-950/50 p-2"
                  >
                    <div className="font-medium text-slate-200">{t.headline}</div>
                    <div className="mt-1 text-slate-500">
                      {t.source_name} | score {t.relevance_score}
                      {t.published_at ? ` | ${t.published_at.slice(0, 10)}` : ""}
                    </div>
                    {t.source_url ? (
                      <a
                        href={t.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-[11px] text-blue-400 hover:text-blue-300"
                      >
                        Source
                      </a>
                    ) : null}
                    {t.content_angle ? (
                      <div className="mt-1 text-slate-400">{t.content_angle}</div>
                    ) : null}
                  </li>
                ))
              : null}
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
              disabled={generating}
              className="mt-1 w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-300">
            Voice
            <select
              value={voicePreset}
              onChange={(e) =>
                setVoicePreset(e.target.value as (typeof VOICE_PRESETS)[number]["value"])
              }
              disabled={generating}
              className="mt-1 min-w-48 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 disabled:opacity-50"
            >
              {VOICE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-blue-500 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Voice preset is sent as <code>voice_preset</code>. TODO: if backend ignores it, keep
          current default behavior until API wiring is completed.
        </p>

        {generateError ? (
          <div
            className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {generateError}
          </div>
        ) : null}

        {meta.style_guide_only ? (
          <div className="rounded-lg border border-slate-600/60 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
            <span className="font-medium text-slate-200">Style-guide-only mode</span> - generation ran
            without a full trend brief merge (demo / fallback).
          </div>
        ) : null}

        {meta.warning_message ? (
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            {meta.warning_message}
          </div>
        ) : null}

        {meta.batch_id ? (
          <p className="text-xs text-slate-500">
            Batch {meta.batch_id} | prompt {meta.prompt_version ?? "-"} | failed slots{" "}
            {meta.failed_slots ?? 0} | trend freshness {meta.trend_brief_freshness ?? "-"}
          </p>
        ) : null}

        {!generating && meta.batch_id && posts.length === 0 ? (
          <p className="rounded-lg border border-slate-700/80 bg-slate-900/30 px-4 py-3 text-sm text-slate-400">
            No posts returned in this batch (check failed_slots and logs).
          </p>
        ) : null}

        <div className="space-y-6">
          {generating ? (
            <div
              className="rounded-xl border border-slate-700/80 bg-slate-900/20 px-5 py-8 text-center text-sm text-slate-400"
              aria-live="polite"
            >
              Generating posts...
            </div>
          ) : null}
          {!generating
            ? posts.map((p) => (
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
                    Signals: {p.credibility_signals.join(", ") || "-"} | Trend:{" "}
                    {p.trend_source === "none" ? "none" : p.trend_source}
                  </div>
                  {p.lint_flags?.length ? (
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Quality flags (WARN / BLOCK)
                      </h3>
                      <ul className="space-y-2 text-xs">
                        {p.lint_flags.map((f, i) => (
                          <LintFlagRow key={`${p.post_id}-flag-${i}`} flag={f} />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              ))
            : null}
        </div>
      </main>
    </div>
  );
}
