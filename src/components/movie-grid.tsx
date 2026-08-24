import { MOVIES_BY_ID } from "@/data/catalog";
import { MovieCard } from "./movie-card";
import { useSnapshot } from "@/hooks/use-app-data";

export type GridItem = { movieId: number; fit?: number; reasons?: string[] };

export function MovieGrid({ items, empty }: { items: GridItem[]; empty?: React.ReactNode }) {
  const { data } = useSnapshot();

  if (!items.length) {
    return <div className="py-16 text-center text-sm text-muted-foreground">{empty ?? "Nothing here yet."}</div>;
  }

  const interactions = new Map((data?.interactions ?? []).map((i) => [i.movie_id, i]));
  const list = new Set((data?.watchlist ?? []).filter((w) => w.status === "want_to_watch").map((w) => w.movie_id));

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-3">
      {items.map((item) => {
        const movie = MOVIES_BY_ID.get(item.movieId);
        if (!movie) return null;
        const state = interactions.get(item.movieId);
        return (
          <MovieCard
            key={item.movieId}
            movie={movie}
            {...(typeof item.fit === "number" ? { fit: item.fit } : {})}
            {...(item.reasons ? { reasons: item.reasons } : {})}
            state={{
              liked: state?.liked ?? null,
              watched: state?.watched ?? false,
              inList: list.has(item.movieId),
            }}
          />
        );
      })}
    </div>
  );
}
