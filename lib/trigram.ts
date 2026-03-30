// Trigrams = three consecutive words (token trigrams), not character n-grams; text is lowercased and punctuation folded to spaces before tokenizing.
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

function trigrams(tokens: string[]): Set<string> {
  const out = new Set<string>();
  if (tokens.length < 3) {
    if (tokens.length > 0) out.add(tokens.join(" "));
    return out;
  }
  for (let i = 0; i <= tokens.length - 3; i++) {
    out.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  return out;
}

/** Jaccard index of overlapping word-trigram sets between two strings. */
export function trigramJaccard(a: string, b: string): number {
  const A = trigrams(norm(a));
  const B = trigrams(norm(b));
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const t of A) {
    if (B.has(t)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function maxCorpusSimilarity(generated: string, corpus: string[]): number {
  let max = 0;
  for (const c of corpus) {
    const j = trigramJaccard(generated, c);
    if (j > max) max = j;
  }
  return max;
}
