export type BlockContext = {
  hookClarityScore: number;
  maxCorpusSimilarity: number;
  postType?: string;
};

const BANNED_STARTS = [
  "in today's world",
  "excited to share",
  "hot take:",
  "game changer",
  "let that sink in",
  "i'm humbled",
  "im humbled",
];

const MIN_CHARS = 600;
const SIM_BLOCK = 0.4;

function firstLineLower(body: string): string {
  const line = body.trim().split(/\n/)[0]?.trim().toLowerCase() ?? "";
  return line;
}

export function hasCredibilitySignal(body: string): boolean {
  if (/\d{1,3}%/.test(body)) return true;
  if (/\b\d{1,3}\s*(x|×)\b/i.test(body)) return true;
  if (/\$\d[\d,]*/.test(body)) return true;
  if (/\b20\d{2}\b/.test(body)) return true;
  if (/\b\d+\s*(hours?|days?|weeks?|minutes?|months?)\b/i.test(body)) return true;
  const tools =
    /\b(Claude|Anthropic|OpenAI|GPT-4|GPT-5|Gemini|Excel|Sheets|Notion|Slack|Python|JavaScript|TypeScript|MCP|SaaS|API|AWS|Azure|Vercel)\b/i;
  if (tools.test(body)) return true;
  return false;
}

export function runBlockRules(body: string, ctx: BlockContext): string[] {
  const reasons: string[] = [];
  const first = firstLineLower(body);

  for (const banned of BANNED_STARTS) {
    if (first.startsWith(banned)) {
      reasons.push(`BLOCK: banned_opener (${banned})`);
      break;
    }
  }

  if (first.startsWith("unpopular opinion:") && ctx.postType !== "contrarian") {
    reasons.push("BLOCK: unpopular_opener_without_contrarian_type");
  }

  if (body.trim().length < MIN_CHARS) {
    reasons.push(`BLOCK: below_min_length (${body.trim().length} < ${MIN_CHARS})`);
  }

  if (!hasCredibilitySignal(body)) {
    reasons.push("BLOCK: no_credibility_signal");
  }

  if (ctx.hookClarityScore < 7) {
    reasons.push("BLOCK: hook_score_below_7");
  }

  if (ctx.maxCorpusSimilarity > SIM_BLOCK) {
    reasons.push(`BLOCK: high_corpus_similarity (${ctx.maxCorpusSimilarity.toFixed(2)} > ${SIM_BLOCK})`);
  }

  return reasons;
}
