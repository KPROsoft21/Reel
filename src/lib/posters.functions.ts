import { createServerFn } from "@tanstack/react-start";
import { MOVIES } from "@/data/catalog";

export type PosterEntry = { poster: string | null; backdrop: string | null };

const IMG = "https://image.tmdb.org/t/p";

async function searchTmdb(
  title: string,
  year: number,
  apiKey: string,
): Promise<PosterEntry> {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(
    title,
  )}&year=${year}&include_adult=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { poster: null, backdrop: null };
    const json = (await res.json()) as {
      results?: { poster_path?: string | null; backdrop_path?: string | null }[];
    };
    const hit = json.results?.[0];
    if (!hit) return { poster: null, backdrop: null };
    return {
      poster: hit.poster_path ? `${IMG}/w500${hit.poster_path}` : null,
      backdrop: hit.backdrop_path ? `${IMG}/w1280${hit.backdrop_path}` : null,
    };
  } catch {
    return { poster: null, backdrop: null };
  }
}

/** Returns poster/backdrop artwork for the whole catalog, cached in the database. */
export const getPosters = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const map: Record<number, PosterEntry> = {};

  const { data: cached } = await supabaseAdmin
    .from("movie_posters")
    .select("movie_id, poster_url, backdrop_url");

  for (const row of cached ?? []) {
    map[row.movie_id] = { poster: row.poster_url, backdrop: row.backdrop_url };
  }

  const apiKey = process.env["TMDB_API_KEY"];
  const missing = MOVIES.filter((m) => !(m.id in map));
  if (!apiKey || missing.length === 0) return map;

  const inserts: {
    movie_id: number;
    title: string;
    poster_url: string | null;
    backdrop_url: string | null;
  }[] = [];

  const batchSize = 8;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((m) => searchTmdb(m.title, m.year, apiKey)),
    );
    batch.forEach((m, idx) => {
      const entry = results[idx]!;
      map[m.id] = entry;
      inserts.push({
        movie_id: m.id,
        title: m.title,
        poster_url: entry.poster,
        backdrop_url: entry.backdrop,
      });
    });
  }

  if (inserts.length > 0) {
    await supabaseAdmin.from("movie_posters").upsert(inserts, { onConflict: "movie_id" });
  }

  return map;
});
