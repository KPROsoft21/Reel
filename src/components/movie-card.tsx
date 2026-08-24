import { Link } from "@tanstack/react-router";
import { Check, Heart, Plus } from "lucide-react";

import type { Movie } from "@/data/catalog";
import { cn } from "@/lib/utils";
import { MoviePoster } from "./movie-poster";
import { useMovieAction } from "@/hooks/use-app-data";

export type CardState = { liked: boolean | null; watched: boolean; inList: boolean };

export function MovieCard({
  movie,
  state,
  fit,
  reasons,
}: {
  movie: Movie;
  state: CardState;
  fit?: number;
  reasons?: string[];
}) {
  const action = useMovieAction();

  const fire = (e: React.MouseEvent, next: Parameters<typeof action.mutate>[0]["action"]) => {
    e.preventDefault();
    e.stopPropagation();
    action.mutate({ movieId: movie.id, action: next });
  };

  return (
    <Link
      to="/movie/$movieId"
      params={{ movieId: String(movie.id) }}
      className="group block focus-visible:outline-none"
    >
      <div className="relative">
        <MoviePoster movie={movie} className="transition-transform duration-300 group-hover:-translate-y-1" />
        {typeof fit === "number" && (
          <span className="chamfer-sm absolute right-2 top-2 bg-background/80 px-2 py-1 text-[0.65rem] uppercase tracking-[0.15em] text-primary">
            {fit}% fit
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{movie.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {movie.year} · {movie.genres.slice(0, 2).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconToggle
            active={state.liked === true}
            label="Like"
            onClick={(e) => fire(e, state.liked === true ? "clear_rating" : "like")}
          >
            <Heart className={cn("size-4", state.liked === true && "fill-current")} />
          </IconToggle>
          <IconToggle
            active={state.inList}
            label="My List"
            onClick={(e) => fire(e, state.inList ? "remove_list" : "add_list")}
          >
            <Plus className="size-4" />
          </IconToggle>
          <IconToggle
            active={state.watched}
            label="Watched"
            onClick={(e) => fire(e, state.watched ? "unwatched" : "watched")}
          >
            <Check className="size-4" />
          </IconToggle>
        </div>
      </div>

      {reasons?.length ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">{reasons[0]}</p>
      ) : null}
    </Link>
  );
}

function IconToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "chamfer-sm hairline flex size-8 items-center justify-center transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
