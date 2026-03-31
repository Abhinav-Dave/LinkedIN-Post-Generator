-- LinkedIN Post Generator - Supabase schema
-- Run in Supabase SQL editor (or migration pipeline).

create table if not exists public.corpus_posts (
  post_id text primary key,
  creator_url text not null,
  raw_text text not null,
  hook_type text,
  hook_length_chars integer,
  post_length_chars integer,
  line_break_density double precision,
  uses_bullets integer default 0,
  credibility_signal text,
  cta_type text,
  engagement_tier text,
  scraped_at timestamptz not null
);

create table if not exists public.trend_items (
  trend_id text primary key,
  headline text not null,
  source_url text not null,
  source_name text not null,
  published_at timestamptz not null,
  relevance_score integer not null,
  content_angle text,
  cached_at timestamptz not null,
  expired integer default 0
);

create table if not exists public.generated_posts (
  post_id text primary key,
  industry text not null,
  topic_focus text not null,
  hook_archetype text,
  hook_clarity_score integer,
  body text not null,
  char_count integer,
  credibility_signals text,
  trend_source text,
  post_type text,
  cta_type text,
  lint_flags text,
  generated_at timestamptz not null
);

create index if not exists idx_trend_published on public.trend_items (published_at desc);
create index if not exists idx_trend_expired on public.trend_items (expired);
create index if not exists idx_generated_at on public.generated_posts (generated_at desc);
create index if not exists idx_corpus_scraped on public.corpus_posts (scraped_at desc);

alter table public.corpus_posts enable row level security;
alter table public.trend_items enable row level security;
alter table public.generated_posts enable row level security;

-- Allow public read-only access to trends (optional; useful for thin clients).
drop policy if exists trend_items_select_public on public.trend_items;
create policy trend_items_select_public
  on public.trend_items
  for select
  to anon, authenticated
  using (true);

-- No public writes; server uses service-role key and bypasses RLS.
