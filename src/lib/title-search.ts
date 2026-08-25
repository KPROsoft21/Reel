import { MOVIES, type Movie } from "@/data/catalog";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(["the", "a", "an", "of", "and", "part", "movie", "film", "watch"]);

/**
 * Find catalog entries whose *title* the viewer typed. Deliberately strict:
 * mood phrases like "funny thriller" must not register as a title lookup.
 */
export function searchTitles(rawQuery: string, limit = 4): Movie[] {
  const q = norm(rawQuery);
  if (q.length < 3) return [];
  const qWords = q.split(" ").filter((w) => !STOP.has(w));
  if (!qWords.length) return [];

  const scored: { movie: Movie; score: number }[] = [];
  for (const movie of MOVIES) {
    const t = norm(movie.title);
    const tWords = t.split(" ").filter((w) => !STOP.has(w));
    if (!tWords.length) continue;

    let score = 0;
    if (t === q) score = 1;
    else if (t.length >= 3 && q.length >= 3 && (t.startsWith(q) || q.startsWith(t))) score = 0.9;
    else if (q.length >= 4 && t.includes(q)) score = 0.8;
    else {
      const hits = qWords.filter((w) => tWords.some((tw) => tw === w || (w.length > 4 && tw.startsWith(w))));
      const coverage = hits.length / qWords.length;
      const titleCoverage = hits.length / tWords.length;
      // Require the query to be mostly title words, and to cover most of the title.
      if (coverage >= 0.8 && titleCoverage >= 0.6) score = 0.6 * coverage * titleCoverage;
    }
    if (score > 0) scored.push({ movie, score: score + movie.popularity * 0.05 });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.4) return [];
  return scored.slice(0, limit).map((s) => s.movie);
}
