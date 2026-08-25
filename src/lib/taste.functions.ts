import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MOVIES_BY_ID } from "@/data/catalog";
import { FEATURE_LABELS } from "./recommender";
import { summariseTaste, type TasteEvidence, type TasteSummary } from "./taste-summary.server";

export type { TasteSummary };

export const getTasteSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TasteSummary> => {
    const { supabase, userId } = context;
    const [prefsRes, interactionsRes, watchlistRes, knowledgeRes] = await Promise.all([
      supabase.from("user_preferences").select("feature_key, preference_value, confidence, evidence_count").eq("user_id", userId),
      supabase.from("user_movie_interactions").select("movie_id, watched, liked").eq("user_id", userId),
      supabase.from("watchlists").select("movie_id, status").eq("user_id", userId).eq("status", "want_to_watch"),
      supabase.from("user_knowledge").select("summary").eq("user_id", userId).eq("active", true),
    ]);

    const prefs = (prefsRes.data ?? []).map((p) => ({
      label: FEATURE_LABELS[String(p.feature_key)] ?? String(p.feature_key),
      value: Number(p.preference_value),
      confidence: Number(p.confidence),
      evidence: Number(p.evidence_count),
    }));
    const title = (id: number) => MOVIES_BY_ID.get(id)?.title ?? null;
    const rows = interactionsRes.data ?? [];

    const evidence: TasteEvidence = {
      loves: prefs.filter((p) => p.value > 0.1).sort((a, b) => b.value * b.confidence - a.value * a.confidence).slice(0, 8),
      avoids: prefs.filter((p) => p.value < -0.1).sort((a, b) => a.value * a.confidence - b.value * b.confidence).slice(0, 8),
      liked: rows.filter((r) => r.liked === true).map((r) => title(Number(r.movie_id))).filter((t): t is string => !!t),
      disliked: rows.filter((r) => r.liked === false).map((r) => title(Number(r.movie_id))).filter((t): t is string => !!t),
      watched: rows.filter((r) => r.watched).map((r) => title(Number(r.movie_id))).filter((t): t is string => !!t),
      saved: (watchlistRes.data ?? []).map((w) => title(Number(w.movie_id))).filter((t): t is string => !!t),
      notes: (knowledgeRes.data ?? []).map((k) => String(k.summary)).filter(Boolean),
    };

    return summariseTaste(evidence);
  });
