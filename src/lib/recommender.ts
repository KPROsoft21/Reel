import { FEATURE_KEYS, MOVIES, type Movie } from "@/data/catalog";

export const ALGORITHM_VERSION = "v1";

export type Intent = {
  similar_to?: string[];
  positive?: Record<string, number>;
  negative?: Record<string, number>;
  genres_include?: string[];
  genres_exclude?: string[];
  runtime_max?: number | null;
  runtime_min?: number | null;
  exact_title?: string | null;
  summary?: string;
};

export type Preference = {
  feature_key: string;
  preference_value: number;
  confidence: number;
  importance: number;
  evidence_count: number;
};

/** A durable, user-authored rule distilled from a knowledge-base note. */
export type KnowledgeSignals = {
  positive: Record<string, number>;
  negative: Record<string, number>;
  genres_love: string[];
  genres_avoid: string[];
  people_love: string[];
  people_avoid: string[];
  keywords_love: string[];
  keywords_avoid: string[];
  strict: boolean;
};

export const EMPTY_SIGNALS: KnowledgeSignals = {
  positive: {},
  negative: {},
  genres_love: [],
  genres_avoid: [],
  people_love: [],
  people_avoid: [],
  keywords_love: [],
  keywords_avoid: [],
  strict: false,
};


export type InteractionState = {
  movie_id: number;
  watched: boolean;
  liked: boolean | null;
};

export type ScoredMovie = {
  movie: Movie;
  score: number;
  components: {
    preference: number;
    semantic: number;
    theme: number;
    novelty: number;
    discovery: number;
    context: number;
    popularity: number;
  };
  reasons: string[];
  fit: number;
};

export const FEATURE_LABELS: Record<string, string> = {
  character_driven: "Character-driven",
  atmosphere: "Atmospheric",
  philosophical: "Philosophical",
  humor: "Funny",
  tension: "Tense",
  romance: "Romantic",
  visual_style: "Visually ambitious",
  slow_burn: "Slow-burn",
  complexity: "Intricate plotting",
  emotional_intensity: "Emotionally intense",
  realism: "Grounded and real",
  violence: "Violent",
  world_building: "Rich world-building",
  dark_tone: "Dark in tone",
  optimism: "Warm and hopeful",
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Preference match: Σ(importance × preference × centered feature) / Σ|importance| → 0..1 */
export function preferenceMatch(movie: Movie, prefs: Preference[]): number {
  if (prefs.length === 0) return 0.5;
  let num = 0;
  let den = 0;
  for (const p of prefs) {
    const f = movie.features[p.feature_key];
    if (f === undefined) continue;
    const centered = f * 2 - 1;
    const weight = p.importance * Math.max(0.15, p.confidence);
    num += weight * p.preference_value * centered;
    den += Math.abs(weight);
  }
  if (den === 0) return 0.5;
  return clamp01((num / den + 1) / 2);
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const vec = (m: Movie) => FEATURE_KEYS.map((k) => m.features[k] ?? 0);

/** Semantic similarity against liked movies (content-based retrieval signal). */
export function semanticSimilarity(movie: Movie, likedMovies: Movie[]): number {
  if (likedMovies.length === 0) return 0.5;
  const sims = likedMovies.map((l) => cosine(vec(movie), vec(l)));
  sims.sort((a, b) => b - a);
  const top = sims.slice(0, 3);
  return clamp01(top.reduce((s, n) => s + n, 0) / top.length);
}

/** How well the movie matches the temporary intent expressed in the search box. */
export function intentMatch(movie: Movie, intent: Intent): { score: number; hardFail: boolean } {
  let hardFail = false;
  if (intent.runtime_max && movie.runtime > intent.runtime_max) hardFail = true;
  if (intent.runtime_min && movie.runtime < intent.runtime_min) hardFail = true;
  if (intent.genres_exclude?.some((g) => movie.genres.includes(g))) hardFail = true;

  const parts: [number, number][] = []; // [score, weight]
  for (const [k, v] of Object.entries(intent.positive ?? {})) {
    const f = movie.features[k];
    if (f === undefined) continue;
    const want = clamp01(v);
    // Reward movies that reach the requested level; only penalise falling short.
    parts.push([clamp01(1 - Math.max(0, want - f) * 2.4), 2 * Math.max(0.3, want)]);
  }
  for (const [k, v] of Object.entries(intent.negative ?? {})) {
    const f = movie.features[k];
    if (f === undefined) continue;
    parts.push([clamp01(1 - clamp01(f) * clamp01(Math.abs(v))), 1.5]);
  }
  if (intent.genres_include?.length) {
    const hit = intent.genres_include.filter((g) => movie.genres.includes(g)).length;
    parts.push([clamp01(hit / intent.genres_include.length), 2]);
  }
  if (intent.similar_to?.length) {
    const refs = MOVIES.filter((m) =>
      intent.similar_to!.some((t) => m.title.toLowerCase() === t.toLowerCase()),
    );
    if (refs.length) parts.push([semanticSimilarity(movie, refs), 2.5]);
  }
  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  const score = totalW ? parts.reduce((s, [v, w]) => s + v * w, 0) / totalW : 0.5;
  return { score: clamp01(score), hardFail };
}


function themeMatch(movie: Movie, prefs: Preference[]): number {
  const themed = prefs.filter((p) => p.preference_value > 0.25 && p.confidence > 0.2);
  if (!themed.length) return 0.5;
  const hits = themed.map((p) => movie.features[p.feature_key] ?? 0.5);
  return clamp01(hits.reduce((s, n) => s + n, 0) / hits.length);
}

/** Uncertainty-driven exploration: reward movies that would teach us something. */
function discoveryValue(movie: Movie, prefs: Preference[], profileMaturity: number): number {
  const uncertain = prefs.filter((p) => p.confidence < 0.5);
  const informational = uncertain.length
    ? uncertain
        .map((p) => Math.abs((movie.features[p.feature_key] ?? 0.5) - 0.5) * 2)
        .reduce((s, n) => s + n, 0) / uncertain.length
    : 0.6;
  return clamp01(informational * (1 - profileMaturity * 0.6));
}

export type RankInput = {
  intent: Intent;
  prefs: Preference[];
  interactions: InteractionState[];
  excludeIds?: number[];
  limit?: number;
  /** Changes the exploration jitter so repeat asks surface different films. */
  seed?: number;
};

/** Deterministic 0..1 pseudo-random from two integers. */
function jitter(seed: number, id: number): number {
  const x = Math.sin(seed * 374761393 + id * 668265263) * 43758.5453;
  return x - Math.floor(x);
}

function hasIntentSignal(intent: Intent): boolean {
  return Boolean(
    Object.keys(intent.positive ?? {}).length ||
      Object.keys(intent.negative ?? {}).length ||
      intent.genres_include?.length ||
      intent.similar_to?.length ||
      intent.runtime_max ||
      intent.runtime_min ||
      intent.exact_title,
  );
}

export function rankMovies({
  intent,
  prefs,
  interactions,
  excludeIds = [],
  limit = 9,
  seed = 0,
}: RankInput): ScoredMovie[] {
  const seen = new Map(interactions.map((i) => [i.movie_id, i]));
  const likedMovies = MOVIES.filter((m) => seen.get(m.id)?.liked === true);
  const dislikedMovies = MOVIES.filter((m) => seen.get(m.id)?.liked === false);
  const evidence = prefs.reduce((s, p) => s + p.evidence_count, 0);
  const profileMaturity = clamp01(evidence / 30);

  const exactTitle = intent.exact_title?.toLowerCase().trim();
  const searching = hasIntentSignal(intent);

  // When the viewer states a mood, that request dominates; otherwise the
  // learned taste model and exploration drive the feed.
  const W = searching
    ? { preference: 0.14, semantic: 0.08, theme: 0.05, context: 0.5, rating: 0.06, novelty: 0.03, discovery: 0.04, popularity: 0.04, jitter: 0.03 }
    : { preference: 0.3, semantic: 0.18, theme: 0.11, context: 0.02, rating: 0.07, novelty: 0.06, discovery: 0.09, popularity: 0.05, jitter: 0.14 };

  const scored: ScoredMovie[] = [];
  for (const movie of MOVIES) {
    if (excludeIds.includes(movie.id)) continue;
    const state = seen.get(movie.id);
    if (state?.watched || state?.liked === false) continue;

    const ctx = intentMatch(movie, intent);
    if (ctx.hardFail) continue;

    const preference = preferenceMatch(movie, prefs);
    const semantic = semanticSimilarity(movie, likedMovies);
    const theme = themeMatch(movie, prefs);
    const novelty = clamp01(1 - movie.popularity * 0.7);
    const discovery = discoveryValue(movie, prefs, profileMaturity);
    const popularity = clamp01(movie.popularity);

    let score =
      W.preference * preference +
      W.semantic * semantic +
      W.theme * theme +
      W.context * ctx.score +
      (W.rating * (movie.rating - 6)) / 3 +
      W.novelty * novelty +
      W.discovery * discovery +
      W.popularity * popularity +
      W.jitter * jitter(seed, movie.id);

    // Penalty: too close to something the user explicitly disliked.
    if (dislikedMovies.length) {
      const closeness = semanticSimilarity(movie, dislikedMovies);
      score -= 0.12 * Math.max(0, closeness - 0.75);
    }
    if (exactTitle && movie.title.toLowerCase().includes(exactTitle)) score += 1;

    scored.push({
      movie,
      score,
      components: { preference, semantic, theme, novelty, discovery, context: ctx.score, popularity },
      reasons: explain(movie, prefs, intent, ctx.score),
      fit: Math.round(clamp01(0.3 + (searching ? ctx.score : score) * 0.75) * 100),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return diversify(scored, limit);
}


/** Avoid nine variations of the same movie: cap repeated dominant genres. */
function diversify(scored: ScoredMovie[], limit: number): ScoredMovie[] {
  const picked: ScoredMovie[] = [];
  const genreCount = new Map<string, number>();
  const directorCount = new Map<string, number>();

  for (const pass of [true, false]) {
    for (const cand of scored) {
      if (picked.length >= limit) break;
      if (picked.includes(cand)) continue;
      if (pass) {
        const primary = cand.movie.genres[0] ?? "";
        if ((genreCount.get(primary) ?? 0) >= 3) continue;
        if ((directorCount.get(cand.movie.director) ?? 0) >= 2) continue;
      }
      picked.push(cand);
      const primary = cand.movie.genres[0] ?? "";
      genreCount.set(primary, (genreCount.get(primary) ?? 0) + 1);
      directorCount.set(cand.movie.director, (directorCount.get(cand.movie.director) ?? 0) + 1);
    }
  }
  return picked.slice(0, limit);
}

export function explain(movie: Movie, prefs: Preference[], intent: Intent, ctx: number): string[] {
  const reasons: string[] = [];
  const strong = [...prefs]
    .filter((p) => p.preference_value > 0.2 && (movie.features[p.feature_key] ?? 0) > 0.65)
    .sort((a, b) => b.preference_value * b.confidence - a.preference_value * a.confidence)
    .slice(0, 2);
  for (const p of strong) {
    reasons.push(`${FEATURE_LABELS[p.feature_key] ?? p.feature_key}, which you tend to value`);
  }
  if (intent.summary && ctx > 0.55) reasons.push(`Fits what you asked for: ${intent.summary}`);
  if (reasons.length < 3) {
    const standout = Object.entries(movie.features)
      .filter(([k]) => FEATURE_LABELS[k])
      .sort((a, b) => b[1] - a[1])[0];
    if (standout) reasons.push(`Strongly ${(FEATURE_LABELS[standout[0]] ?? standout[0]).toLowerCase()}`);
  }
  if (reasons.length < 3) reasons.push(`${movie.genres.join(" · ")} directed by ${movie.director}`);
  return reasons.slice(0, 3);
}

/** Evidence weighting hierarchy from the spec. */
export const EVIDENCE_WEIGHT: Record<string, number> = {
  explicit_correction: 1.0,
  explicit_feedback: 0.9,
  liked_movie: 0.75,
  disliked_movie: 0.75,
  watched: 0.4,
  added_to_list: 0.35,
  opened: 0.12,
  shown: 0.03,
};

export type PrefDelta = {
  feature_key: string;
  preference_value: number;
  confidence: number;
  importance: number;
  evidence_count: number;
};

/**
 * Blend new evidence into the taste model. Positive direction means the user
 * responded well to a movie with these features.
 */
export function applyEvidence(
  current: Preference[],
  movie: Movie,
  direction: number,
  evidenceType: keyof typeof EVIDENCE_WEIGHT,
): PrefDelta[] {
  const weight = (EVIDENCE_WEIGHT[evidenceType] ?? 0.2) * direction;
  const byKey = new Map(current.map((p) => [p.feature_key, p]));
  const out: PrefDelta[] = [];

  for (const key of FEATURE_KEYS) {
    const f = movie.features[key];
    if (f === undefined) continue;
    const signal = (f - 0.5) * 2; // -1..1, how much the movie expresses this feature
    if (Math.abs(signal) < 0.3) continue; // uninformative
    const prev = byKey.get(key);
    const prevValue = prev?.preference_value ?? 0;
    const prevConf = prev?.confidence ?? 0;
    const count = (prev?.evidence_count ?? 0) + 1;
    const learningRate = 0.35 / Math.sqrt(count);
    const value = Math.max(-1, Math.min(1, prevValue + learningRate * weight * signal));
    const confidence = Math.min(1, prevConf + Math.abs(weight) * 0.12 * Math.abs(signal));
    const importance = Math.min(1, 0.4 + count * 0.04 + Math.abs(value) * 0.3);
    out.push({
      feature_key: key,
      preference_value: value,
      confidence,
      importance,
      evidence_count: count,
    });
  }
  return out;
}

export function tasteTags(prefs: Preference[], limit = 6): { key: string; label: string; value: number }[] {
  return [...prefs]
    .filter((p) => p.preference_value > 0.15 && p.confidence > 0.1)
    .sort((a, b) => b.preference_value * b.confidence - a.preference_value * a.confidence)
    .slice(0, limit)
    .map((p) => ({
      key: p.feature_key,
      label: FEATURE_LABELS[p.feature_key] ?? p.feature_key,
      value: p.preference_value,
    }));
}
