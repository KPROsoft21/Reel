import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildInsight } from "./insight.server";

/** Every number the recommender used to reach its opinion of you. */
export const getAlgorithmInsight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [prefs, interactions, watchlist, evidence, affinity, knowledge, opened] = await Promise.all([
      supabase.from("user_preferences").select("*").eq("user_id", userId),
      supabase
        .from("user_movie_interactions")
        .select("movie_id, watched, liked, not_interested_at, not_interested_count")
        .eq("user_id", userId),
      supabase.from("watchlists").select("movie_id, status").eq("user_id", userId).eq("status", "want_to_watch"),
      supabase.from("user_preference_evidence").select("evidence_type").eq("user_id", userId).limit(2000),
      supabase.from("user_filter_affinity").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_knowledge").select("signals").eq("user_id", userId).eq("active", true),
      supabase
        .from("movie_interaction_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("event_type", "opened"),
    ]);

    const row = affinity.data as
      | { decade_counts: unknown; genre_counts: unknown; rating_min_avg: number | null; runtime_max_avg: number | null; uses: number }
      | null;
    const numberMap = (v: unknown): Record<string, number> =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, n]) => [k, Number(n) || 0]))
        : {};

    return buildInsight({
      prefs: (prefs.data ?? []).map((p: Record<string, unknown>) => ({
        feature_key: String(p['feature_key']),
        preference_value: Number(p['preference_value']),
        confidence: Number(p['confidence']),
        importance: Number(p['importance']),
        evidence_count: Number(p['evidence_count']),
      })),
      interactions: (interactions.data ?? []).map((i: Record<string, unknown>) => ({
        movie_id: Number(i['movie_id']),
        watched: !!i['watched'],
        liked: (i['liked'] as boolean | null) ?? null,
        not_interested_at: (i['not_interested_at'] as string | null) ?? null,
        not_interested_count: Number(i['not_interested_count'] ?? 0),
      })),
      watchlistCount: (watchlist.data ?? []).length,
      evidenceRows: (evidence.data ?? []).map((e: Record<string, unknown>) => ({ evidence_type: String(e['evidence_type']) })),
      affinity: row
        ? {
            decades: numberMap(row.decade_counts),
            genres: numberMap(row.genre_counts),
            ratingMin: row.rating_min_avg === null ? null : Number(row.rating_min_avg),
            runtimeMax: row.runtime_max_avg === null ? null : Number(row.runtime_max_avg),
            uses: Number(row.uses ?? 0),
          }
        : null,
      knowledgeRows: (knowledge.data ?? []) as { signals: unknown }[],
      openedCount: opened.count ?? 0,
    });
  });
