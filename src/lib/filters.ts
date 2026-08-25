import type { Movie } from "@/data/catalog";

/** Viewer-set constraints applied on top of the taste model. */
export type MovieFilters = {
  yearMin: number | null;
  yearMax: number | null;
  ratingMin: number | null;
  runtimeMax: number | null;
  genres: string[];
};

export const EMPTY_FILTERS: MovieFilters = {
  yearMin: null,
  yearMax: null,
  ratingMin: null,
  runtimeMax: null,
  genres: [],
};

export const DECADES = [
  { label: "2020s", yearMin: 2020, yearMax: 2029 },
  { label: "2010s", yearMin: 2010, yearMax: 2019 },
  { label: "2000s", yearMin: 2000, yearMax: 2009 },
  { label: "90s", yearMin: 1990, yearMax: 1999 },
  { label: "80s", yearMin: 1980, yearMax: 1989 },
  { label: "70s", yearMin: 1970, yearMax: 1979 },
  { label: "60s", yearMin: 1960, yearMax: 1969 },
  { label: "Classic", yearMin: 1900, yearMax: 1959 },
] as const;

export const GENRE_OPTIONS = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "War",
  "Western",
];

export const RATING_OPTIONS = [6, 7, 7.5, 8];
export const RUNTIME_OPTIONS = [90, 105, 120, 150];

export function hasActiveFilters(f: MovieFilters | null | undefined): boolean {
  if (!f) return false;
  return Boolean(f.yearMin || f.yearMax || f.ratingMin || f.runtimeMax || f.genres.length);
}

export function matchesFilters(movie: Movie, f: MovieFilters | null | undefined): boolean {
  if (!f) return true;
  if (f.yearMin && movie.year < f.yearMin) return false;
  if (f.yearMax && movie.year > f.yearMax) return false;
  if (f.ratingMin && movie.rating < f.ratingMin) return false;
  if (f.runtimeMax && movie.runtime && movie.runtime > f.runtimeMax) return false;
  if (f.genres.length && !f.genres.some((g) => movie.genres.includes(g))) return false;
  return true;
}

/** What the viewer's filtering habits say about their taste, learned over time. */
export type FilterAffinity = {
  decades: Record<string, number>;
  genres: Record<string, number>;
  ratingMin: number | null;
  runtimeMax: number | null;
  uses: number;
};

export const EMPTY_AFFINITY: FilterAffinity = { decades: {}, genres: {}, ratingMin: null, runtimeMax: null, uses: 0 };

export function decadeOf(year: number): string {
  if (year < 1960) return "Classic";
  const start = Math.floor(year / 10) * 10;
  return start >= 2000 ? `${start}s` : `${String(start).slice(2)}s`;
}

function share(counts: Record<string, number>, key: string): number {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (!total) return 0;
  return (counts[key] ?? 0) / total;
}

/**
 * A soft, decaying nudge (never a filter): if the viewer keeps asking for 70s
 * films or documentaries, unfiltered feeds lean that way too.
 */
export function affinityBonus(movie: Movie, a: FilterAffinity | null | undefined): number {
  if (!a || a.uses < 2) return 0;
  const strength = Math.min(1, a.uses / 8);
  let bonus = 0;
  bonus += 0.09 * strength * share(a.decades, decadeOf(movie.year));
  const genreShare = Math.max(0, ...movie.genres.map((g) => share(a.genres, g)));
  bonus += 0.07 * strength * genreShare;
  if (a.ratingMin && movie.rating < a.ratingMin) bonus -= 0.05 * strength;
  if (a.runtimeMax && movie.runtime > a.runtimeMax) bonus -= 0.03 * strength;
  return bonus;
}

export function affinityLabel(a: FilterAffinity | null | undefined): string | null {
  if (!a || a.uses < 2) return null;
  const topDecade = Object.entries(a.decades).sort((x, y) => y[1] - x[1])[0];
  const topGenre = Object.entries(a.genres).sort((x, y) => y[1] - x[1])[0];
  const parts: string[] = [];
  if (topDecade) parts.push(`${topDecade[0]} films`);
  if (topGenre) parts.push(topGenre[0].toLowerCase());
  if (!parts.length) return null;
  return `We've noticed you filter for ${parts.join(" and ")} — that now nudges your recommendations.`;
}
