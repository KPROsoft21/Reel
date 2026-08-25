import { MOVIES_BY_ID, type Movie } from "@/data/catalog";

/**
 * Films that came from live TMDB rather than the bundled catalog. The server
 * ships them alongside recommendations; the UI resolves any id through here.
 */
const external = new Map<number, Movie>();

export function registerMovies(list?: Movie[] | null) {
  for (const m of list ?? []) if (m?.id) external.set(m.id, m);
}

export function getMovie(id: number): Movie | undefined {
  return MOVIES_BY_ID.get(id) ?? external.get(id);
}
