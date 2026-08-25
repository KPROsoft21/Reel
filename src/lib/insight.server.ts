import { MOVIES_BY_ID } from "@/data/catalog";
import { EMPTY_AFFINITY, type FilterAffinity } from "@/lib/filters";
import {
  FEATURE_LABELS,
  eraBias,
  oldSchoolTaste,
  toSignals,
  type InteractionState,
  type Preference,
} from "@/lib/recommender";

export type InsightFeature = {
  key: string;
  label: string;
  value: number;
  confidence: number;
  importance: number;
  evidence: number;
  /** value × confidence — the pull it actually exerts on a score. */
  pull: number;
};

export type AlgorithmInsight = {
  maturity: { evidence: number; features: number; maturity: number; avgConfidence: number };
  activity: { liked: number; disliked: number; watched: number; saved: number; dismissed: number; opened: number };
  evidenceMix: { type: string; count: number; weight: number }[];
  top: InsightFeature[];
  bottom: InsightFeature[];
  weights: { context: string; rows: { label: string; weight: number }[] }[];
  era: { oldTaste: number; decades: { label: string; nudge: number }[]; yourDecades: { label: string; count: number }[] };
  affinity: { uses: number; genres: { label: string; count: number }[]; ratingMin: number | null; runtimeMax: number | null };
  knowledge: { rules: number; strict: number; loves: string[]; avoids: string[] };
};

const round = (n: number, d = 3) => Number(n.toFixed(d));

export function buildInsight(input: {
  prefs: Preference[];
  interactions: InteractionState[];
  watchlistCount: number;
  evidenceRows: { evidence_type: string }[];
  affinity: FilterAffinity | null;
  knowledgeRows: { signals: unknown }[];
  openedCount: number;
}): AlgorithmInsight {
  const { prefs, interactions, watchlistCount, evidenceRows, knowledgeRows, openedCount } = input;
  const affinity = input.affinity ?? EMPTY_AFFINITY;

  const evidence = prefs.reduce((s, p) => s + p.evidence_count, 0);
  const avgConfidence = prefs.length ? prefs.reduce((s, p) => s + p.confidence, 0) / prefs.length : 0;

  const shaped: InsightFeature[] = prefs.map((p) => ({
    key: p.feature_key,
    label: FEATURE_LABELS[p.feature_key] ?? p.feature_key,
    value: round(p.preference_value),
    confidence: round(p.confidence),
    importance: round(p.importance),
    evidence: p.evidence_count,
    pull: round(p.preference_value * p.confidence),
  }));

  const byPull = [...shaped].sort((a, b) => b.pull - a.pull);

  const counts = new Map<string, number>();
  for (const r of evidenceRows) counts.set(r.evidence_type, (counts.get(r.evidence_type) ?? 0) + 1);
  const EVIDENCE_WEIGHTS: Record<string, number> = {
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

  const likedMovies = interactions
    .filter((i) => i.liked === true)
    .map((i) => MOVIES_BY_ID.get(i.movie_id))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const oldTaste = oldSchoolTaste(likedMovies, interactions, affinity);

  const eraSamples = [2020, 2010, 2000, 1990, 1980, 1970, 1960].map((y) => ({
    label: y >= 2020 ? "2020s" : `${String(y).slice(2)}s`,
    nudge: round(eraBias({ year: y, features: {} } as never, oldTaste)),
  }));

  const rules = knowledgeRows.map((r) => toSignals(r.signals));

  return {
    maturity: {
      evidence,
      features: prefs.length,
      maturity: round(Math.min(1, evidence / 30), 2),
      avgConfidence: round(avgConfidence, 2),
    },
    activity: {
      liked: interactions.filter((i) => i.liked === true).length,
      disliked: interactions.filter((i) => i.liked === false).length,
      watched: interactions.filter((i) => i.watched).length,
      saved: watchlistCount,
      dismissed: interactions.filter((i) => !!i.not_interested_at).length,
      opened: openedCount,
    },
    evidenceMix: [...counts.entries()]
      .map(([type, count]) => ({ type, count, weight: EVIDENCE_WEIGHTS[type] ?? 0.2 }))
      .sort((a, b) => b.count - a.count),
    top: byPull.filter((f) => f.pull > 0).slice(0, 10),
    bottom: byPull.filter((f) => f.pull < 0).reverse().slice(0, 10),
    weights: [
      {
        context: "No search — your feed",
        rows: [
          { label: "Taste model match", weight: 0.26 },
          { label: "Your written rules", weight: 0.24 },
          { label: "Similar to films you liked", weight: 0.15 },
          { label: "Exploration shuffle", weight: 0.14 },
          { label: "Theme overlap", weight: 0.09 },
          { label: "Learning value", weight: 0.08 },
          { label: "Critical standing", weight: 0.06 },
          { label: "Off the beaten path", weight: 0.05 },
          { label: "Broad appeal", weight: 0.04 },
          { label: "Matches your request", weight: 0.02 },
        ],
      },
      {
        context: "While searching",
        rows: [
          { label: "Matches your request", weight: 0.46 },
          { label: "Taste model match", weight: 0.12 },
          { label: "Your written rules", weight: 0.12 },
          { label: "Similar to films you liked", weight: 0.07 },
          { label: "Critical standing", weight: 0.06 },
          { label: "Theme overlap", weight: 0.04 },
          { label: "Learning value", weight: 0.04 },
          { label: "Broad appeal", weight: 0.03 },
          { label: "Off the beaten path", weight: 0.03 },
          { label: "Exploration shuffle", weight: 0.03 },
        ],
      },
    ],
    era: {
      oldTaste: round(oldTaste, 2),
      decades: eraSamples,
      yourDecades: Object.entries(affinity.decades ?? {})
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    },
    affinity: {
      uses: affinity.uses ?? 0,
      genres: Object.entries(affinity.genres ?? {})
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      ratingMin: affinity.ratingMin ?? null,
      runtimeMax: affinity.runtimeMax ?? null,
    },
    knowledge: {
      rules: rules.length,
      strict: rules.filter((r) => r.strict).length,
      loves: [...new Set(rules.flatMap((r) => [...r.genres_love, ...r.people_love, ...r.keywords_love]))].slice(0, 12),
      avoids: [...new Set(rules.flatMap((r) => [...r.genres_avoid, ...r.people_avoid, ...r.keywords_avoid]))].slice(0, 12),
    },
  };
}
