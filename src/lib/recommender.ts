import { ALL_FEATURE_KEYS, MOVIES, type Movie } from "@/data/catalog";
import { EXTENDED_FEATURE_LABELS } from "@/lib/extended-features";
import { affinityBonus, matchesFilters, type FilterAffinity, type MovieFilters } from "@/lib/filters";

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
  /** When the viewer pressed "not interested" — a disinterest signal, not a dislike. */
  not_interested_at?: string | null;
  not_interested_count?: number;
};

/**
 * "Not interested" buries a film rather than banning it. The penalty is big
 * enough that it only resurfaces when little else fits, and it fades over
 * roughly four months (longer if dismissed repeatedly).
 */
export function notInterestedPenalty(state: InteractionState | undefined): number {
  if (!state?.not_interested_at) return 0;
  const days = (Date.now() - new Date(state.not_interested_at).getTime()) / 86_400_000;
  const window = 120 * Math.max(1, state.not_interested_count ?? 1);
  const freshness = Math.max(0, 1 - days / window);
  return 0.9 * freshness * Math.min(2, state.not_interested_count ?? 1);
}

/** One weighted signal that fed the final score. */
export type ScoreLine = {
  key: string;
  label: string;
  /** The raw 0..1 signal strength. */
  value: number;
  /** How much this signal was allowed to matter in this context. */
  weight: number;
  /** value × weight — the points it actually added. */
  contribution: number;
  hint: string;
};

/** Everything needed to show, honestly, how the fit % came about. */
export type ScoreBreakdown = {
  lines: ScoreLine[];
  /** Bonuses and penalties applied after the weighted blend. */
  adjustments: { label: string; value: number; hint: string }[];
  /** Sum of the weighted signals, before adjustments. */
  weighted: number;
  /** Maximum points the weighted signals could have scored. */
  budget: number;
  /** Final blended score. */
  total: number;
  /** Normalised 0..1 read of the score, the input to the fit %. */
  quality: number;
  fit: number;
  mode: "search" | "feed" | "direct";
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
  breakdown: ScoreBreakdown;
};


const CORE_FEATURE_LABELS: Record<string, string> = {
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

export const FEATURE_LABELS: Record<string, string> = { ...CORE_FEATURE_LABELS, ...EXTENDED_FEATURE_LABELS };

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

const vec = (m: Movie) => ALL_FEATURE_KEYS.map((k) => m.features[k] ?? 0);

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

/** Score a movie against the viewer's authored knowledge base. */
export function knowledgeMatch(
  movie: Movie,
  rules: KnowledgeSignals[],
): { score: number; hardFail: boolean; reasons: string[] } {
  if (!rules.length) return { score: 0.5, hardFail: false, reasons: [] };
  const haystack = `${movie.title} ${movie.overview} ${movie.director} ${movie.genres.join(" ")}`.toLowerCase();
  const people = `${movie.director} ${movie.overview}`.toLowerCase();
  let score = 0.5;
  let hardFail = false;
  const reasons: string[] = [];

  for (const r of rules) {
    for (const g of r.genres_love) {
      if (movie.genres.includes(g)) {
        score += 0.22;
        reasons.push(`You told us you like ${g.toLowerCase()} films`);
      }
    }
    for (const g of r.genres_avoid) {
      if (movie.genres.includes(g)) {
        score -= 0.35;
        if (r.strict) hardFail = true;
      }
    }
    for (const p of r.people_love) {
      if (p.length > 2 && people.includes(p.toLowerCase())) {
        score += 0.25;
        reasons.push(`Features ${p}, who you said you like`);
      }
    }
    for (const p of r.people_avoid) {
      if (p.length > 2 && people.includes(p.toLowerCase())) {
        score -= 0.35;
        if (r.strict) hardFail = true;
      }
    }
    for (const k of r.keywords_love) {
      if (k.length > 2 && haystack.includes(k)) {
        score += 0.14;
        reasons.push(`Matches your note about ${k}`);
      }
    }
    for (const k of r.keywords_avoid) {
      if (k.length > 2 && haystack.includes(k)) {
        score -= 0.2;
        if (r.strict) hardFail = true;
      }
    }
    for (const [key, w] of Object.entries(r.positive)) {
      const f = movie.features[key];
      if (f === undefined) continue;
      score += 0.2 * w * (f - 0.5) * 2;
      if (f > 0.7 && w > 0.4) reasons.push(`${FEATURE_LABELS[key] ?? key}, which you asked for`);
    }
    for (const [key, w] of Object.entries(r.negative)) {
      const f = movie.features[key];
      if (f === undefined) continue;
      score -= 0.2 * w * (f - 0.5) * 2;
    }
  }

  return { score: clamp01(score), hardFail, reasons: [...new Set(reasons)].slice(0, 2) };
}

/** Normalize a stored jsonb signal blob into a full rule. */
export const toSignals = (value: unknown): KnowledgeSignals => ({
  ...EMPTY_SIGNALS,
  ...((value as Partial<KnowledgeSignals> | null) ?? {}),
});

export type RankInput = {
  intent: Intent;
  prefs: Preference[];
  interactions: InteractionState[];
  excludeIds?: number[];
  limit?: number;
  /** Durable rules the viewer wrote into their knowledge base. */
  knowledge?: KnowledgeSignals[];
  /** Changes the exploration jitter so repeat asks surface different films. */
  seed?: number;
  /** Hard constraints the viewer set with the filter bar. */
  filters?: MovieFilters | null;
  /** Learned filtering habits: a soft lean, applied even when no filter is set. */
  affinity?: FilterAffinity | null;
  /** Score exactly these films, bypassing exclusions — used to explain a single pick. */
  only?: Movie[];
};


/** Deterministic 0..1 pseudo-random from two integers. */
function jitter(seed: number, id: number): number {
  const x = Math.sin(seed * 374761393 + id * 668265263) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How much this viewer actually reaches for older cinema, 0..1. Built from the
 * films they liked/watched and the decades they filter for. At 0 the feed is
 * pushed hard toward modern Hollywood; near 1 the era bias all but disappears.
 */
export function oldSchoolTaste(
  likedMovies: Movie[],
  interactions: InteractionState[],
  affinity?: FilterAffinity | null,
): number {
  const engagedIds = new Set(
    interactions.filter((i) => i.watched || i.liked === true).map((i) => i.movie_id),
  );
  const engaged = MOVIES.filter((m) => engagedIds.has(m.id) || likedMovies.includes(m));
  let signal = 0;
  if (engaged.length >= 3) {
    const oldShare = engaged.filter((m) => m.year < 1990).length / engaged.length;
    signal = Math.max(signal, clamp01(oldShare * 2));
  }
  if (affinity && affinity.uses >= 2) {
    const counts = affinity.decades ?? {};
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (total) {
      const oldKeys = ["Classic", "60s", "70s", "80s"];
      const oldHits = oldKeys.reduce((s, k) => s + (counts[k] ?? 0), 0);
      signal = Math.max(signal, clamp01((oldHits / total) * 1.5));
    }
  }
  return signal;
}

/**
 * The house lean: modern, mostly-Hollywood films unless the viewer has shown
 * real appetite for older or international cinema. Older films aren't blocked —
 * a strong enough fit still gets through.
 */
export function eraBias(movie: Movie, oldTaste: number): number {
  const damp = 1 - clamp01(oldTaste);
  const y = movie.year;
  let b: number;
  if (y >= 2015) b = 0.1;
  else if (y >= 2000) b = 0.07;
  else if (y >= 1990) b = -0.02;
  else if (y >= 1980) b = -0.09;
  else if (y >= 1970) b = -0.22;
  else b = -0.32;
  // Positive nudges stay; the penalties soften for viewers who like old films.
  const era = b >= 0 ? b : b * damp;
  const international = (movie.features["origin_international"] ?? 0) > 0.6 ? -0.05 * damp : 0;
  return era + international;
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
  knowledge = [],
  seed = 0,
  filters = null,
  affinity = null,
  only,
}: RankInput): ScoredMovie[] {
  const forced = only && only.length ? only : null;

  const seen = new Map(interactions.map((i) => [i.movie_id, i]));
  const likedMovies = MOVIES.filter((m) => seen.get(m.id)?.liked === true);
  const dislikedMovies = MOVIES.filter((m) => seen.get(m.id)?.liked === false);
  const evidence = prefs.reduce((s, p) => s + p.evidence_count, 0);
  const profileMaturity = clamp01(evidence / 30);
  const oldTaste = oldSchoolTaste(likedMovies, interactions, affinity);


  const exactTitle = intent.exact_title?.toLowerCase().trim();
  const searching = hasIntentSignal(intent);
  const hasKnowledge = knowledge.length > 0;

  // When the viewer states a mood, that request dominates; otherwise the
  // learned taste model, their written rules and exploration drive the feed.
  const W = searching
    ? { preference: 0.12, semantic: 0.07, theme: 0.04, context: 0.46, rating: 0.06, novelty: 0.03, discovery: 0.04, popularity: 0.03, knowledge: hasKnowledge ? 0.12 : 0, jitter: 0.03 }
    : { preference: 0.26, semantic: 0.15, theme: 0.09, context: 0.02, rating: 0.06, novelty: 0.05, discovery: 0.08, popularity: 0.04, knowledge: hasKnowledge ? 0.24 : 0, jitter: hasKnowledge ? 0.11 : 0.14 };


  const scored: ScoredMovie[] = [];
  for (const movie of MOVIES) {
    if (excludeIds.includes(movie.id)) continue;
    if (!matchesFilters(movie, filters)) continue;
    const state = seen.get(movie.id);
    // Already engaged with (watched, liked or disliked) — never recommend again.
    if (state?.watched || state?.liked !== null && state?.liked !== undefined) continue;


    const ctx = intentMatch(movie, intent);
    if (ctx.hardFail) continue;

    const kb = knowledgeMatch(movie, knowledge);
    if (kb.hardFail) continue;

    const preference = preferenceMatch(movie, prefs);
    const semantic = semanticSimilarity(movie, likedMovies);
    const theme = themeMatch(movie, prefs);
    const novelty = clamp01(1 - movie.popularity * 0.7);
    const discovery = discoveryValue(movie, prefs, profileMaturity);
    const popularity = clamp01(movie.popularity);

    const ratingSignal = clamp01((movie.rating - 6) / 3);
    const jit = jitter(seed, movie.id);

    const lines: ScoreLine[] = [
      { key: "preference", label: "Taste model match", value: preference, weight: W.preference, contribution: W.preference * preference, hint: "How well the film's traits line up with the features you've shown you value." },
      { key: "semantic", label: "Similar to films you liked", value: semantic, weight: W.semantic, contribution: W.semantic * semantic, hint: "Cosine similarity against your three closest liked films." },
      { key: "theme", label: "Theme overlap", value: theme, weight: W.theme, contribution: W.theme * theme, hint: "Strength of the themes you consistently gravitate toward." },
      { key: "context", label: "Matches your request", value: ctx.score, weight: W.context, contribution: W.context * ctx.score, hint: "Fit with the mood, search or anchor film for this feed." },
      { key: "knowledge", label: "Your written rules", value: kb.score, weight: W.knowledge, contribution: W.knowledge * kb.score, hint: "Your knowledge-base notes about genres, people and keywords." },
      { key: "rating", label: "Critical standing", value: ratingSignal, weight: W.rating, contribution: (W.rating * (movie.rating - 6)) / 3, hint: `Audience rating ${movie.rating.toFixed(1)}/10, centred on 6.0.` },
      { key: "novelty", label: "Off the beaten path", value: novelty, weight: W.novelty, contribution: W.novelty * novelty, hint: "Rewards films you're less likely to have already seen everywhere." },
      { key: "discovery", label: "Learning value", value: discovery, weight: W.discovery, contribution: W.discovery * discovery, hint: "How much your reaction would teach the model something it's unsure about." },
      { key: "popularity", label: "Broad appeal", value: popularity, weight: W.popularity, contribution: W.popularity * popularity, hint: "A small pull toward films most people enjoy." },
      { key: "jitter", label: "Exploration shuffle", value: jit, weight: W.jitter, contribution: W.jitter * jit, hint: "Deterministic randomness so repeat asks surface different films." },
    ].filter((l) => l.weight > 0);

    let score = lines.reduce((s, l) => s + l.contribution, 0);
    const weighted = score;
    const adjustments: { label: string; value: number; hint: string }[] = [];

    // Penalty: too close to something the user explicitly disliked.
    if (dislikedMovies.length) {
      const closeness = semanticSimilarity(movie, dislikedMovies);
      const pen = -0.12 * Math.max(0, closeness - 0.75);
      score += pen;
      if (pen) adjustments.push({ label: "Close to something you disliked", value: pen, hint: `Similarity ${Math.round(closeness * 100)}% to a film you rated down.` });
    }
    // Learned filtering habits lean the feed without excluding anything.
    const aff = affinityBonus(movie, affinity);
    score += aff;
    if (aff) adjustments.push({ label: "Your filtering habits", value: aff, hint: "Learned from the eras, genres and ratings you keep filtering for." });
    // House lean toward recent, mainstream-Hollywood cinema.
    const era = eraBias(movie, oldTaste);
    score += era;
    if (era) adjustments.push({ label: `Era lean (${movie.year})`, value: era, hint: `House bias toward modern, mostly-Hollywood cinema. Your old-film appetite reads ${Math.round(oldTaste * 100)}%.` });

    // Dismissed with the X: sink it to the bottom of the pile instead of removing it.
    const dismissPen = notInterestedPenalty(state);
    score -= dismissPen;
    if (dismissPen) adjustments.push({ label: "You passed on this before", value: -dismissPen, hint: "A decaying penalty from pressing X — it fades over about four months." });

    const isExact = Boolean(exactTitle && movie.title.toLowerCase().includes(exactTitle));
    if (isExact) {
      score += 1;
      adjustments.push({ label: "Exact title match", value: 1, hint: "You searched for this film by name." });
    }

    // Fit is a calibrated read of the blended score, not of any single signal.
    // Normalising against the weight budget keeps the displayed range honest
    // (an entity search alone no longer pins everything at 100%).
    const budget =
      W.preference + W.semantic + W.theme + W.context + W.knowledge + W.novelty + W.discovery + W.popularity;
    const quality = clamp01((score - W.jitter * jit) / (budget * 0.82));
    const fit = isExact ? 99 : Math.round(28 + 66 * Math.pow(quality, 0.85));

    scored.push({
      movie,
      score,
      components: { preference, semantic, theme, novelty, discovery, context: ctx.score, popularity },
      reasons: [...kb.reasons, ...explain(movie, prefs, intent, ctx.score)].slice(0, 3),
      fit,
      breakdown: {
        lines,
        adjustments,
        weighted,
        budget,
        total: score,
        quality,
        fit,
        mode: searching ? "search" : "feed",
      },
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
  not_interested: 0.08,
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

  // With 120+ metrics per film, only the most expressive ones carry usable
  // signal — learning from everything would blur the model and bloat writes.
  const candidates = ALL_FEATURE_KEYS.map((key) => ({ key, f: movie.features[key] }))
    .filter((c): c is { key: string; f: number } => c.f !== undefined && Math.abs(c.f - 0.5) * 2 >= 0.3)
    .sort((a, b) => Math.abs(b.f - 0.5) - Math.abs(a.f - 0.5))
    .slice(0, 30);

  for (const { key, f } of candidates) {
    const signal = (f - 0.5) * 2; // -1..1, how much the movie expresses this feature
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
