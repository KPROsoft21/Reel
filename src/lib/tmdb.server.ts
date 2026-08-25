// Live TMDB access: any film in TMDB can enter the app, with semantic feature
// vectors derived on the fly using the same rules as the bundled catalog.
import { FEATURE_KEYS, type Movie } from "@/data/catalog";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w500";

type Json = Record<string, any>;

function auth() {
  const key = process.env["TMDB_API_KEY"] ?? "";
  return { key, bearer: key.length > 40 };
}

function url(path: string, query: Record<string, string> = {}) {
  const { key, bearer } = auth();
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  if (!bearer) u.searchParams.set("api_key", key);
  return u.toString();
}

async function get(path: string, query?: Record<string, string>): Promise<Json | null> {
  const { key, bearer } = auth();
  if (!key) return null;
  try {
    const res = await fetch(url(path, query), bearer ? { headers: { Authorization: `Bearer ${key}` } } : undefined);
    if (!res.ok) return null;
    return (await res.json()) as Json;
  } catch {
    return null;
  }
}

const G: Record<string, Record<string, number>> = {
  Drama: { character_driven: 0.9, emotional_intensity: 0.8, realism: 0.8, humor: 0.2, tension: 0.45 },
  Comedy: { humor: 0.95, optimism: 0.8, dark_tone: 0.2, tension: 0.2, emotional_intensity: 0.4 },
  Thriller: { tension: 0.95, dark_tone: 0.7, slow_burn: 0.5, optimism: 0.25, complexity: 0.6 },
  Horror: { tension: 0.95, dark_tone: 0.95, atmosphere: 0.85, violence: 0.7, optimism: 0.1 },
  Action: { tension: 0.8, violence: 0.8, visual_style: 0.7, slow_burn: 0.1, complexity: 0.35 },
  Adventure: { world_building: 0.75, visual_style: 0.75, optimism: 0.7, slow_burn: 0.15 },
  "Sci-Fi": { world_building: 0.9, philosophical: 0.75, visual_style: 0.85, complexity: 0.7 },
  Fantasy: { world_building: 0.95, visual_style: 0.9, realism: 0.1, optimism: 0.65 },
  Romance: { romance: 0.95, character_driven: 0.85, emotional_intensity: 0.8, optimism: 0.65, violence: 0.1 },
  Mystery: { complexity: 0.8, tension: 0.75, slow_burn: 0.65, atmosphere: 0.7 },
  Crime: { tension: 0.8, violence: 0.7, dark_tone: 0.75, realism: 0.7 },
  Animation: { visual_style: 0.95, world_building: 0.8, optimism: 0.75, realism: 0.1 },
  Family: { optimism: 0.95, humor: 0.7, violence: 0.05, dark_tone: 0.1 },
  Documentary: { realism: 1, character_driven: 0.7, philosophical: 0.6, visual_style: 0.3 },
  History: { realism: 0.85, slow_burn: 0.6, emotional_intensity: 0.7 },
  War: { tension: 0.85, violence: 0.9, dark_tone: 0.8, emotional_intensity: 0.85, optimism: 0.2 },
  Western: { atmosphere: 0.8, violence: 0.7, slow_burn: 0.7, visual_style: 0.8 },
  Music: { emotional_intensity: 0.8, optimism: 0.7, character_driven: 0.8 },
};

const KW: [string[], Record<string, number>][] = [
  [["philosoph", "existential", "meaning of life", "time travel", "artificial intelligence", "consciousness"], { philosophical: 0.9, complexity: 0.75 }],
  [["dystopia", "post-apocalyptic", "cyberpunk", "space opera", "alien"], { world_building: 0.95, atmosphere: 0.8 }],
  [["based on a true story", "biography", "true crime"], { realism: 0.95 }],
  [["slow", "meditative", "minimal"], { slow_burn: 0.9 }],
  [["nonlinear timeline", "plot twist", "unreliable narrator", "mind bending"], { complexity: 0.95 }],
  [["friendship", "coming of age", "family", "father son", "mother daughter"], { character_driven: 0.9, emotional_intensity: 0.8 }],
  [["love", "romantic", "first love"], { romance: 0.9 }],
  [["gore", "brutality", "revenge", "serial killer", "blood"], { violence: 0.95, dark_tone: 0.9 }],
  [["satire", "parody", "slapstick", "buddy comedy"], { humor: 0.95 }],
  [["visually striking", "stop motion", "surrealism", "black and white"], { visual_style: 0.95, atmosphere: 0.85 }],
  [["depression", "grief", "loss", "trauma"], { emotional_intensity: 0.95, dark_tone: 0.8, optimism: 0.2 }],
  [["hope", "feel good", "heartwarming", "christmas"], { optimism: 0.95, dark_tone: 0.1 }],
  [["suspense", "cat and mouse", "conspiracy", "heist"], { tension: 0.9 }],
  [["atmospheric", "isolation", "haunting", "noir"], { atmosphere: 0.95, dark_tone: 0.8 }],
];

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

function derive(d: Json, genres: string[], keywords: string[]): Record<string, number> {
  const acc: Record<string, number> = {};
  const wsum: Record<string, number> = {};
  const add = (map: Record<string, number>, w: number) => {
    for (const [k, v] of Object.entries(map)) {
      acc[k] = (acc[k] ?? 0) + v * w;
      wsum[k] = (wsum[k] ?? 0) + w;
    }
  };
  genres.forEach((g, i) => G[g] && add(G[g], i === 0 ? 1 : 0.6));
  for (const [needles, map] of KW) {
    if (keywords.some((k) => needles.some((n) => k.includes(n)))) add(map, 0.8);
  }

  const runtime = Number(d["runtime"] ?? 100);
  const vote = Number(d["vote_average"] ?? 6.5);
  const out: Record<string, number> = {};
  for (const k of FEATURE_KEYS) {
    let v = wsum[k] ? acc[k]! / wsum[k]! : 0.35;
    if (k === "slow_burn") v = clamp(v + (runtime > 145 ? 0.18 : runtime < 100 ? -0.15 : 0));
    if (k === "complexity") v = clamp(v + (vote > 8 ? 0.12 : 0));
    if (k === "realism") v = clamp(v + (genres.some((g) => ["Fantasy", "Animation", "Sci-Fi"].includes(g)) ? -0.25 : 0));
    if (k === "visual_style") v = clamp(v + (vote > 7.8 ? 0.1 : 0));
    if (k === "emotional_intensity") v = clamp(v + (vote > 8 ? 0.1 : 0));
    const jit = (((Number(d["id"]) * (FEATURE_KEYS.indexOf(k) + 7)) % 17) / 17 - 0.5) * 0.08;
    out[k] = r2(clamp(v + jit));
  }
  return out;
}

function toMovie(d: Json): Movie | null {
  if (!d || !d["id"] || !d["title"] || !d["poster_path"]) return null;
  const genres = (d["genres"] ?? []).map((g: Json) => (g["name"] === "Science Fiction" ? "Sci-Fi" : String(g["name"])));
  const keywords = ((d["keywords"]?.keywords ?? []) as Json[]).map((k) => String(k["name"]).toLowerCase());
  const director = ((d["credits"]?.crew ?? []) as Json[]).find((c) => c["job"] === "Director")?.["name"];
  const release = String(d["release_date"] ?? "");
  return {
    id: Number(d["id"]),
    title: String(d["title"]),
    year: release ? Number(release.slice(0, 4)) : 0,
    runtime: Number(d["runtime"] ?? 0) || 100,
    director: director ? String(director) : "Unknown",
    genres,
    overview: String(d["overview"] ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    features: derive(d, genres, keywords),
    popularity: r2(clamp(Math.log10(Number(d["vote_count"] ?? 1) + 1) / 5)),
    rating: r2(Number(d["vote_average"] ?? 6.5)),
    poster: IMG + d["poster_path"],
  };
}

const cache = new Map<number, Movie>();

export async function tmdbMovie(id: number): Promise<Movie | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const d = await get(`/movie/${id}`, { append_to_response: "keywords,credits", language: "en-US" });
  const movie = d ? toMovie(d) : null;
  if (movie) cache.set(id, movie);
  return movie;
}

/** Title search across all of TMDB, hydrated into full recommender-ready movies. */
export async function tmdbSearch(query: string, limit = 4): Promise<Movie[]> {
  const res = await get("/search/movie", { query, include_adult: "false", language: "en-US", page: "1" });
  const results = ((res?.["results"] ?? []) as Json[])
    .filter((r) => r["poster_path"] && r["release_date"])
    .sort((a, b) => Number(b["vote_count"] ?? 0) - Number(a["vote_count"] ?? 0))
    .slice(0, limit);
  const movies = await Promise.all(results.map((r) => tmdbMovie(Number(r["id"]))));
  return movies.filter((m): m is Movie => !!m);
}

// ---------------------------------------------------------------------------
// Entity candidates: people (actors / directors), franchises, studios, keywords.
// The app asks the viewer which one they meant instead of guessing.
// ---------------------------------------------------------------------------

export type EntityKind = "actor" | "director" | "franchise" | "studio" | "keyword" | "title";
export type Candidate = { kind: EntityKind; id: string; label: string; subtitle: string };

const NOISE =
  /\b(movies?|films?|cinema|directed\s+by|director|starring|stars?|actor|actress|show\s+me|find|give\s+me|universe)\b/gi;

function cleanEntityQuery(q: string) {
  return q.replace(NOISE, " ").replace(/\s+/g, " ").trim();
}

async function hydrate(results: Json[], limit: number): Promise<Movie[]> {
  const picked = results
    .filter((r) => r["poster_path"] && r["release_date"])
    .sort((a, b) => Number(b["vote_count"] ?? 0) - Number(a["vote_count"] ?? 0))
    .slice(0, limit);
  const movies = await Promise.all(picked.map((r) => tmdbMovie(Number(r["id"]))));
  return movies.filter((m): m is Movie => !!m);
}

/** Ranked list of things the query could mean. Empty when nothing matches. */
export async function tmdbCandidates(rawQuery: string): Promise<Candidate[]> {
  const q = cleanEntityQuery(rawQuery);
  if (q.length < 2 || q.split(" ").length > 6) return [];

  const [people, collections, companies, keywords] = await Promise.all([
    get("/search/person", { query: q, include_adult: "false", language: "en-US" }),
    get("/search/collection", { query: q, language: "en-US" }),
    get("/search/company", { query: q }),
    get("/search/keyword", { query: q }),
  ]);

  const out: Candidate[] = [];

  for (const p of ((people?.["results"] ?? []) as Json[])
    .sort((a, b) => Number(b["popularity"] ?? 0) - Number(a["popularity"] ?? 0))
    .slice(0, 3)) {
    const known = ((p["known_for"] ?? []) as Json[]).map((k) => String(k["title"] ?? k["name"] ?? "")).filter(Boolean);
    const kind: EntityKind = String(p["known_for_department"]) === "Directing" ? "director" : "actor";
    out.push({
      kind,
      id: String(p["id"]),
      label: String(p["name"] ?? ""),
      subtitle: known.length ? `${kind === "director" ? "Director" : "Actor"} — ${known.slice(0, 2).join(", ")}` : kind === "director" ? "Director" : "Actor",
    });
  }

  for (const c of ((collections?.["results"] ?? []) as Json[]).slice(0, 2)) {
    out.push({ kind: "franchise", id: String(c["id"]), label: String(c["name"] ?? q), subtitle: "Film series" });
  }

  for (const c of ((companies?.["results"] ?? []) as Json[]).slice(0, 2)) {
    out.push({ kind: "studio", id: String(c["id"]), label: String(c["name"] ?? q), subtitle: "Studio" });
  }

  const kw = ((keywords?.["results"] ?? []) as Json[])[0];
  if (kw) out.push({ kind: "keyword", id: String(kw["id"]), label: String(kw["name"] ?? q), subtitle: "Theme" });

  return out.slice(0, 8);
}

/** Films for a chosen candidate. */
export async function tmdbEntityMovies(kind: EntityKind, id: string, limit = 6): Promise<Movie[]> {
  if (kind === "actor" || kind === "director") {
    const credits = await get(`/person/${id}/movie_credits`, { language: "en-US" });
    const pool =
      kind === "director"
        ? ((credits?.["crew"] ?? []) as Json[]).filter((c) => c["job"] === "Director")
        : ((credits?.["cast"] ?? []) as Json[]);
    return hydrate(pool, limit);
  }
  if (kind === "franchise") {
    const detail = await get(`/collection/${id}`, { language: "en-US" });
    return hydrate((detail?.["parts"] ?? []) as Json[], limit);
  }
  const query =
    kind === "studio"
      ? { with_companies: id, "vote_count.gte": "200" }
      : { with_keywords: id, "vote_count.gte": "150" };
  const disc = await get("/discover/movie", {
    ...query,
    sort_by: "vote_count.desc",
    include_adult: "false",
    language: "en-US",
  });
  return hydrate((disc?.["results"] ?? []) as Json[], limit);
}
