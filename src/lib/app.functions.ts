import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MOVIES_BY_ID } from "@/data/catalog";
import { interpretIntent, extractFeedback } from "./intent.server";

import {
  ALGORITHM_VERSION,
  applyEvidence,
  rankMovies,
  tasteTags,
  toSignals,
  type Intent,
  type Preference,
  type InteractionState,
} from "./recommender";

const asPrefs = (rows: unknown[]): Preference[] =>
  (rows as Preference[]).map((r) => ({
    feature_key: r.feature_key,
    preference_value: Number(r.preference_value),
    confidence: Number(r.confidence),
    importance: Number(r.importance),
    evidence_count: Number(r.evidence_count),
  }));

const asInteractions = (rows: unknown[]): InteractionState[] =>
  (rows as InteractionState[]).map((r) => ({
    movie_id: Number(r.movie_id),
    watched: !!r.watched,
    liked: r.liked ?? null,
  }));

/** Everything the shell needs: profile, lists, taste model. */
export const getSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, interactions, watchlist, prefs] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_movie_interactions").select("movie_id, watched, liked, rating, updated_at").eq("user_id", userId),
      supabase.from("watchlists").select("movie_id, status, added_at, watched_at").eq("user_id", userId).neq("status", "removed"),
      supabase.from("user_preferences").select("*").eq("user_id", userId),
    ]);

    const preferences = asPrefs(prefs.data ?? []);
    return {
      profile: profile.data ?? { user_id: userId, display_name: null, bio: null, avatar_url: null },
      interactions: asInteractions(interactions.data ?? []),
      watchlist: (watchlist.data ?? []).map((w) => ({
        movie_id: Number(w.movie_id),
        status: w.status as string,
        added_at: w.added_at as string,
      })),
      preferences,
      tags: tasteTags(preferences),
    };
  });

export const getRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        query: z.string().max(400).default(""),
        excludeIds: z.array(z.number()).default([]),
        seed: z.number().default(0),
        limit: z.number().min(1).max(24).default(9),
        similarToMovieId: z.number().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [prefsRes, interactionsRes, knowledgeRes] = await Promise.all([
      supabase.from("user_preferences").select("*").eq("user_id", userId),
      supabase.from("user_movie_interactions").select("movie_id, watched, liked").eq("user_id", userId),
      supabase.from("user_knowledge").select("signals").eq("user_id", userId).eq("active", true),
    ]);
    const prefs = asPrefs(prefsRes.data ?? []);
    const interactions = asInteractions(interactionsRes.data ?? []);
    const knowledge = (knowledgeRes.data ?? []).map((row) => toSignals(row.signals));

    let intent: Intent = { positive: {}, negative: {}, summary: "" };
    let notice: string | undefined;
    const anchor = data.similarToMovieId ? MOVIES_BY_ID.get(data.similarToMovieId) : undefined;
    if (anchor) {
      intent = {
        positive: {},
        negative: {},
        similar_to: [anchor.title],
        genres_include: anchor.genres.slice(0, 2),
        summary: `something like ${anchor.title}`,
      };
    } else if (data.query.trim()) {
      const parsed = await interpretIntent(data.query.trim());
      intent = parsed.intent;
      notice = parsed.notice;
    }

    const ranked = rankMovies({ intent, prefs, interactions, knowledge, excludeIds: anchor ? [...data.excludeIds, anchor.id] : data.excludeIds, limit: data.limit, seed: data.seed });


    let searchId: number | null = null;
    if (data.query.trim()) {
      const { data: search } = await supabase
        .from("searches")
        .insert({ user_id: userId, query_text: data.query.trim(), intent_json: intent, temporary_intent: true })
        .select("id")
        .maybeSingle();
      searchId = search?.id ?? null;
    }

    if (ranked.length) {
      await supabase.from("recommendations").insert(
        ranked.map((r, i) => ({
          user_id: userId,
          movie_id: r.movie.id,
          search_id: searchId,
          algorithm_version: ALGORITHM_VERSION,
          score: r.score,
          rank_position: i + 1,
          preference_score: r.components.preference,
          semantic_score: r.components.semantic,
          theme_score: r.components.theme,
          novelty_score: r.components.novelty,
          discovery_score: r.components.discovery,
          context_score: r.components.context,
          explanation: { reasons: r.reasons, fit: r.fit },
        })),
      );
      await supabase.from("movie_interaction_events").insert(
        ranked.map((r) => ({ user_id: userId, movie_id: r.movie.id, event_type: "shown", event_value: { query: data.query } })),
      );
    }

    return {
      notice,
      intentSummary: intent.summary ?? "",
      exactTitle: intent.exact_title ?? null,
      items: ranked.map((r) => ({
        movieId: r.movie.id,
        score: r.score,
        fit: r.fit,
        reasons: r.reasons,
        components: r.components,
      })),
    };
  });

async function learnFrom(
  supabase: { from: (t: string) => any },
  userId: string,
  movieId: number,
  direction: number,
  evidenceType: Parameters<typeof applyEvidence>[3],
) {
  const movie = MOVIES_BY_ID.get(movieId);
  if (!movie) return;
  const { data } = await supabase.from("user_preferences").select("*").eq("user_id", userId);
  const deltas = applyEvidence(asPrefs(data ?? []), movie, direction, evidenceType);
  if (!deltas.length) return;
  await supabase.from("user_preferences").upsert(
    deltas.map((d) => ({ user_id: userId, ...d, last_updated: new Date().toISOString() })),
    { onConflict: "user_id,feature_key" },
  );
  await supabase.from("user_preference_evidence").insert(
    deltas.slice(0, 6).map((d) => ({
      user_id: userId,
      feature_key: d.feature_key,
      movie_id: movieId,
      evidence_type: evidenceType,
      evidence_value: direction,
      confidence: d.confidence,
    })),
  );
}

const ActionSchema = z.object({
  movieId: z.number(),
  action: z.enum(["like", "dislike", "clear_rating", "watched", "unwatched", "add_list", "remove_list", "opened"]),
});

export const recordAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ActionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { movieId, action } = data;
    const now = new Date().toISOString();

    await supabase.from("movie_interaction_events").insert({ user_id: userId, movie_id: movieId, event_type: action });

    if (action === "like") {
      await supabase
        .from("user_movie_interactions")
        .upsert({
          user_id: userId,
          movie_id: movieId,
          liked: true,
          watched: true,
          rated_at: now,
          watched_at: now,
          updated_at: now,
        }, { onConflict: "user_id,movie_id" });
      await supabase
        .from("watchlists")
        .upsert({ user_id: userId, movie_id: movieId, status: "watched", watched_at: now, removed_at: null }, { onConflict: "user_id,movie_id" });
      await learnFrom(supabase, userId, movieId, 1, "liked_movie");
      await learnFrom(supabase, userId, movieId, 1, "watched");
    }

    if (action === "dislike" || action === "clear_rating") {
      const liked = action === "clear_rating" ? null : false;
      await supabase
        .from("user_movie_interactions")
        .upsert({ user_id: userId, movie_id: movieId, liked, rated_at: now, updated_at: now }, { onConflict: "user_id,movie_id" });
      if (action === "dislike") {
        await learnFrom(supabase, userId, movieId, -1, "disliked_movie");
      }
    }

    if (action === "watched" || action === "unwatched") {
      const watched = action === "watched";
      await supabase
        .from("user_movie_interactions")
        .upsert(
          { user_id: userId, movie_id: movieId, watched, watched_at: watched ? now : null, updated_at: now },
          { onConflict: "user_id,movie_id" },
        );
      if (watched) {
        await supabase
          .from("watchlists")
          .update({ status: "watched", watched_at: now })
          .eq("user_id", userId)
          .eq("movie_id", movieId);
        await learnFrom(supabase, userId, movieId, 1, "watched");
      }
    }

    if (action === "add_list") {
      await supabase
        .from("watchlists")
        .upsert({ user_id: userId, movie_id: movieId, status: "want_to_watch", removed_at: null }, { onConflict: "user_id,movie_id" });
      await learnFrom(supabase, userId, movieId, 1, "added_to_list");
    }

    if (action === "remove_list") {
      await supabase
        .from("watchlists")
        .update({ status: "removed", removed_at: now })
        .eq("user_id", userId)
        .eq("movie_id", movieId);
    }

    if (action === "opened") {
      await learnFrom(supabase, userId, movieId, 1, "opened");
    }

    return { ok: true };
  });

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        movieId: z.number().nullable().default(null),
        reasons: z.array(z.string()).default([]),
        text: z.string().max(1000).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const movie = data.movieId ? MOVIES_BY_ID.get(data.movieId) : null;

    // Structured chips map straight onto feature adjustments.
    const REASON_MAP: Record<string, [string, number]> = {
      "Too similar": ["complexity", 0.4],
      "Too slow": ["slow_burn", -0.9],
      "Too long": ["slow_burn", -0.5],
      "Too serious": ["humor", 0.8],
      "Too depressing": ["dark_tone", -0.9],
      "Too mainstream": ["visual_style", 0.4],
      "Too obscure": ["realism", 0.3],
      "Not enough character focus": ["character_driven", 0.9],
      "Wrong genre": ["world_building", -0.2],
    };

    const extracted = movie ? await extractFeedback(data.text, movie.title) : null;

    await supabase.from("user_feedback").insert({
      user_id: userId,
      movie_id: data.movieId,
      feedback_type: data.reasons.length ? "structured" : "freeform",
      raw_text: data.text || null,
      sentiment: extracted?.sentiment ?? null,
      structured_data: { reasons: data.reasons, signals: extracted?.feature_signals ?? [] },
      llm_model: extracted ? "google/gemini-3.7-flash" : null,
      prompt_version: "v1",
    });

    const { data: prefRows } = await supabase.from("user_preferences").select("*").eq("user_id", userId);
    const byKey = new Map(asPrefs(prefRows ?? []).map((p) => [p.feature_key, p]));

    const adjustments: [string, number, number][] = [];
    for (const reason of data.reasons) {
      const mapped = REASON_MAP[reason];
      if (mapped) adjustments.push([mapped[0], mapped[1], 0.85]);
    }
    for (const signal of extracted?.feature_signals ?? []) {
      adjustments.push([signal.feature_key, signal.direction, Math.min(1, signal.confidence)]);
    }

    if (adjustments.length) {
      const rows = adjustments.map(([key, dir, conf]) => {
        const prev = byKey.get(key);
        const count = (prev?.evidence_count ?? 0) + 1;
        const value = Math.max(-1, Math.min(1, (prev?.preference_value ?? 0) + dir * 0.3));
        return {
          user_id: userId,
          feature_key: key,
          preference_value: value,
          confidence: Math.min(1, (prev?.confidence ?? 0) + conf * 0.2),
          importance: Math.min(1, 0.5 + count * 0.05),
          evidence_count: count,
          decay_class: "LONG_TERM",
          last_updated: new Date().toISOString(),
        };
      });
      await supabase.from("user_preferences").upsert(rows, { onConflict: "user_id,feature_key" });
      await supabase.from("user_preference_evidence").insert(
        rows.map((r) => ({
          user_id: userId,
          feature_key: r.feature_key,
          movie_id: data.movieId,
          evidence_type: "explicit_feedback",
          evidence_value: r.preference_value,
          confidence: r.confidence,
        })),
      );
    }

    return { learned: extracted?.note ?? (adjustments.length ? "Noted — future picks will shift." : "Thanks, noted.") };
  });

export const correctTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ featureKey: z.string(), keep: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .eq("feature_key", data.featureKey)
      .maybeSingle();

    const value = data.keep ? Math.min(1, (existing?.preference_value ?? 0.3) + 0.3) : -0.4;
    await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        feature_key: data.featureKey,
        preference_value: value,
        confidence: 1,
        importance: 1,
        evidence_count: (existing?.evidence_count ?? 0) + 1,
        user_locked: true,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "user_id,feature_key" },
    );
    await supabase.from("user_preference_evidence").insert({
      user_id: userId,
      feature_key: data.featureKey,
      evidence_type: "user_correction",
      evidence_value: value,
      confidence: 1,
    });
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ displayName: z.string().max(80), bio: z.string().max(280) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("profiles").upsert(
      {
        user_id: userId,
        display_name: data.displayName || null,
        bio: data.bio || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    return { ok: true };
  });
