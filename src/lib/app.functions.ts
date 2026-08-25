import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  EMPTY_AFFINITY,
  decadeOf,
  hasActiveFilters,
  matchesFilters,
  type FilterAffinity,
  type MovieFilters,
} from "@/lib/filters";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MOVIES_BY_ID } from "@/data/catalog";
import { interpretIntent, extractFeedback } from "./intent.server";
import { searchTitles, titleMatchScore } from "./title-search";
import { tmdbCandidates, tmdbEntityMovies, tmdbMovie, tmdbSearch, type EntityKind } from "./tmdb.server";

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
    not_interested_at: r.not_interested_at ?? null,
    not_interested_count: r.not_interested_count ?? 0,
  }));

/** Everything the shell needs: profile, lists, taste model. */
export const getSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, interactions, watchlist, prefs] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_movie_interactions").select("movie_id, watched, liked, rating, updated_at, not_interested_at, not_interested_count").eq("user_id", userId),
      supabase.from("watchlists").select("movie_id, status, added_at, watched_at").eq("user_id", userId).neq("status", "removed"),
      supabase.from("user_preferences").select("*").eq("user_id", userId),
    ]);

    const preferences = asPrefs(prefs.data ?? []);
    // Films saved from live TMDB aren't in the bundled catalog: ship them along.
    const referenced = new Set<number>([
      ...(interactions.data ?? []).map((i) => Number(i.movie_id)),
      ...(watchlist.data ?? []).map((w) => Number(w.movie_id)),
    ]);
    const extras = (
      await Promise.all(
        [...referenced].filter((id) => !MOVIES_BY_ID.has(id)).slice(0, 40).map((id) => tmdbMovie(id)),
      )
    ).filter((m): m is NonNullable<typeof m> => !!m);

    return {
      extras,
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
        filters: z
          .object({
            yearMin: z.number().nullish(),
            yearMax: z.number().nullish(),
            ratingMin: z.number().nullish(),
            runtimeMax: z.number().nullish(),
            genres: z.array(z.string()).default([]),
          })
          .nullish(),
        entity: z
          .object({
            kind: z.enum(["actor", "director", "franchise", "studio", "keyword", "title"]),
            id: z.string(),
            label: z.string(),
          })
          .nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const filters: MovieFilters = {
      yearMin: data.filters?.yearMin ?? null,
      yearMax: data.filters?.yearMax ?? null,
      ratingMin: data.filters?.ratingMin ?? null,
      runtimeMax: data.filters?.runtimeMax ?? null,
      genres: data.filters?.genres ?? [],
    };

    const [prefsRes, interactionsRes, knowledgeRes, affinityRes, watchlistRes] = await Promise.all([
      supabase.from("user_preferences").select("*").eq("user_id", userId),
      supabase.from("user_movie_interactions").select("movie_id, watched, liked, not_interested_at, not_interested_count").eq("user_id", userId),
      supabase.from("user_knowledge").select("signals").eq("user_id", userId).eq("active", true),
      supabase.from("user_filter_affinity").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("watchlists").select("movie_id, status").eq("user_id", userId).neq("status", "removed"),
    ]);
    // Anything the viewer has already engaged with — liked, disliked, marked
    // watched, or saved to their list — never comes back as a recommendation.
    const engagedIds = new Set<number>([
      ...(interactionsRes.data ?? [])
        .filter((i) => i.liked !== null || i.watched)
        .map((i) => Number(i.movie_id)),
      ...(watchlistRes.data ?? []).map((w) => Number(w.movie_id)),
    ]);

    const affinityRow = affinityRes.data as
      | { decade_counts: unknown; genre_counts: unknown; rating_min_avg: number | null; runtime_max_avg: number | null; uses: number }
      | null;
    const numberMap = (v: unknown): Record<string, number> =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, n]) => [k, Number(n) || 0]))
        : {};
    const affinity: FilterAffinity = affinityRow
      ? {
          decades: numberMap(affinityRow.decade_counts),
          genres: numberMap(affinityRow.genre_counts),
          ratingMin: affinityRow.rating_min_avg === null ? null : Number(affinityRow.rating_min_avg),
          runtimeMax: affinityRow.runtime_max_avg === null ? null : Number(affinityRow.runtime_max_avg),
          uses: Number(affinityRow.uses ?? 0),
        }
      : EMPTY_AFFINITY;

    // Filtering is itself a taste signal: remember the eras and genres the
    // viewer keeps asking for so unfiltered feeds lean the same way.
    if (hasActiveFilters(filters)) {
      const decades = { ...affinity.decades };
      const genres = { ...affinity.genres };
      if (filters.yearMin || filters.yearMax) {
        const key = decadeOf(filters.yearMin ?? filters.yearMax ?? 0);
        decades[key] = (decades[key] ?? 0) + 1;
      }
      for (const g of filters.genres) genres[g] = (genres[g] ?? 0) + 1;
      const uses = affinity.uses + 1;
      const blend = (prev: number | null, next: number | null) =>
        next === null ? prev : prev === null ? next : prev * 0.7 + next * 0.3;
      const next = {
        user_id: userId,
        decade_counts: decades,
        genre_counts: genres,
        rating_min_avg: blend(affinity.ratingMin, filters.ratingMin),
        runtime_max_avg: blend(affinity.runtimeMax, filters.runtimeMax),
        uses,
        updated_at: new Date().toISOString(),
      };
      await supabase.from("user_filter_affinity").upsert(next, { onConflict: "user_id" });
      affinity.decades = decades;
      affinity.genres = genres;
      affinity.uses = uses;
    }
    const prefs = asPrefs(prefsRes.data ?? []);
    const interactions = asInteractions(interactionsRes.data ?? []);
    const knowledge = (knowledgeRes.data ?? []).map((row) => toSignals(row.signals));

    let intent: Intent = { positive: {}, negative: {}, summary: "" };
    let notice: string | undefined;
    const anchor = data.similarToMovieId
      ? MOVIES_BY_ID.get(data.similarToMovieId) ?? (await tmdbMovie(data.similarToMovieId)) ?? undefined
      : undefined;

    // A typed title is a direct lookup: show the film itself, then films like it.
    // Local catalog first, then all of TMDB so every film is reachable.
    const q = data.query.trim();
    let titleHits = anchor || !q || data.entity ? [] : searchTitles(q).filter((m) => !data.excludeIds.includes(m.id));
    if (!anchor && !data.entity && q.length >= 2) {
      const remote = await tmdbSearch(q, 6);
      const known = new Set([...titleHits.map((m) => m.id), ...data.excludeIds]);
      const extraHits = remote
        .filter((m) => !known.has(m.id) && titleMatchScore(q, m.title) >= 0.6)
        .slice(0, titleHits.length ? 2 : 4);
      titleHits = [...titleHits, ...extraHits];
    }
    // The viewer explicitly picked what they meant (actor, director, franchise,
    // studio or theme) — no guessing.
    const entity = data.entity ?? null;
    if (entity?.kind === "title") {
      const picked = MOVIES_BY_ID.get(Number(entity.id)) ?? (await tmdbMovie(Number(entity.id)));
      if (picked) titleHits = [picked];
    } else if (entity) {
      const entityMovies = await tmdbEntityMovies(entity.kind, entity.id, 8);
      titleHits = entityMovies.filter((m) => !data.excludeIds.includes(m.id)).slice(0, 6);
    }
    titleHits = titleHits.filter((m) => matchesFilters(m, filters));
    const topHit = titleHits[0];

    const entityReason: Record<string, string> = {
      actor: "Stars",
      director: "Directed by",
      franchise: "Part of",
      studio: "From",
      keyword: "Matches",
      title: "Matches",
    };

    if (anchor) {
      intent = {
        positive: {},
        negative: {},
        similar_to: [anchor.title],
        genres_include: anchor.genres.slice(0, 2),
        summary: `something like ${anchor.title}`,
      };
    } else if (entity?.kind === "title" && topHit) {
      intent = {
        positive: {},
        negative: {},
        similar_to: [topHit.title],
        genres_include: topHit.genres.slice(0, 2),
        summary: `${topHit.title} and films like it`,
        exact_title: topHit.title,
      };
    } else if (entity && topHit) {
      intent = {
        positive: {},
        negative: {},
        similar_to: titleHits.slice(0, 3).map((m) => m.title),
        genres_include: topHit.genres.slice(0, 2),
        summary: `${entity.label} films`,
        exact_title: entity.label,
      };
    } else if (topHit) {
      intent = {
        positive: {},
        negative: {},
        similar_to: [topHit.title],
        genres_include: topHit.genres.slice(0, 2),
        summary: `${topHit.title} and films like it`,
        exact_title: topHit.title,
      };
    } else if (q) {
      const parsed = await interpretIntent(q);
      intent = parsed.intent;
      notice = parsed.notice;
    }

    const hitIds = titleHits.map((m) => m.id);

    const fillLimit = Math.max(1, data.limit - hitIds.length);
    const filler = rankMovies({
      intent,
      prefs,
      interactions,
      knowledge,
      excludeIds: [...data.excludeIds, ...hitIds, ...(anchor ? [anchor.id] : [])],
      limit: fillLimit,
      seed: data.seed,
      filters,
      affinity,
    });

    const hitScored = titleHits.map((movie, i) => ({
      movie,
      score: 2 - i * 0.01,
      components: { preference: 0, semantic: 1, theme: 0, novelty: 0, discovery: 0, context: 1, popularity: movie.popularity },
      reasons: [entity ? `${entityReason[entity.kind]} ${entity.label}` : "Matches the title you searched"],
      // Direct matches rank first, but the % still reflects how strong the
      // match is (rank in the result set + the film's own standing).
      fit: Math.max(
        62,
        Math.min(99, Math.round(97 - i * 3 + (movie.rating - 7) * 2)),
      ),
    }));


    const ranked = [...hitScored, ...filler].slice(0, data.limit);
    const extras = ranked.map((r) => r.movie).filter((m) => !MOVIES_BY_ID.has(m.id));



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
      extras,
    };
  });

async function learnFrom(
  supabase: { from: (t: string) => any },
  userId: string,
  movieId: number,
  direction: number,
  evidenceType: Parameters<typeof applyEvidence>[3],
) {
  const movie = MOVIES_BY_ID.get(movieId) ?? (await tmdbMovie(movieId));
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
  action: z.enum(["like", "dislike", "clear_rating", "watched", "unwatched", "add_list", "remove_list", "opened", "not_interested"]),
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

    if (action === "not_interested") {
      const { data: existing } = await supabase
        .from("user_movie_interactions")
        .select("not_interested_count")
        .eq("user_id", userId)
        .eq("movie_id", movieId)
        .maybeSingle();
      await supabase.from("user_movie_interactions").upsert(
        {
          user_id: userId,
          movie_id: movieId,
          not_interested_at: now,
          not_interested_count: (existing?.not_interested_count ?? 0) + 1,
          updated_at: now,
        },
        { onConflict: "user_id,movie_id" },
      );
      // Weak negative: no interest shown, not a dislike.
      await learnFrom(supabase, userId, movieId, -1, "not_interested");
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
  const movie = data.movieId ? MOVIES_BY_ID.get(data.movieId) ?? (await tmdbMovie(data.movieId)) : null;

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

/** Resolve any TMDB film id, whether or not it is in the bundled catalog. */
export const getMovieDetails = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ movieId: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const local = MOVIES_BY_ID.get(data.movieId);
    if (local) return { movie: local };
    const remote = await tmdbMovie(data.movieId);
    return { movie: remote };
  });

/**
 * What could this query mean? Returns the matching films plus people,
 * franchises, studios and themes so the viewer can confirm instead of the
 * app guessing.
 */
export const getSearchOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ query: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const q = data.query.trim();
    const [local, remote, candidates] = await Promise.all([
      Promise.resolve(searchTitles(q, 3)),
      tmdbSearch(q, 4),
      tmdbCandidates(q),
    ]);

    const seen = new Set<number>();
    const titles = [...local, ...remote]
      .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      .filter((m) => titleMatchScore(q, m.title) >= 0.5)
      .slice(0, 4)
      .map((m) => ({ kind: "title" as EntityKind, id: String(m.id), label: m.title, subtitle: `Film — ${m.year}` }));

    return { titles, candidates };
  });
