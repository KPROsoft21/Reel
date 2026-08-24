import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo } from "react";
import { Check, Heart, Plus, ThumbsDown, ArrowLeft } from "lucide-react";

import { RequireAuth } from "@/components/require-auth";
import { MoviePoster } from "@/components/movie-poster";
import { MovieGrid } from "@/components/movie-grid";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { MOVIES, MOVIES_BY_ID } from "@/data/catalog";
import { getRecommendations } from "@/lib/app.functions";
import { FEATURE_LABELS, semanticSimilarity } from "@/lib/recommender";
import { useMovieAction, useSnapshot } from "@/hooks/use-app-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/movie/$movieId")({
  loader: ({ params }) => {
    const movie = MOVIES_BY_ID.get(Number(params.movieId));
    if (!movie) throw notFound();
    return { movie };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Film unavailable — Reel" }, { name: "robots", content: "noindex" }] };
    }
    const { movie } = loaderData;
    const description = movie.overview.slice(0, 155);
    return {
      meta: [
        { title: `${movie.title} (${movie.year}) — Reel` },
        { name: "description", content: description },
        { property: "og:title", content: `${movie.title} (${movie.year})` },
        { property: "og:description", content: description },
        { property: "og:type", content: "video.movie" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: () => (
    <RequireAuth>
      <MovieDetail />
    </RequireAuth>
  ),
});

function MovieDetail() {
  const { movie } = Route.useLoaderData();
  const { data } = useSnapshot();
  const action = useMovieAction();

  useEffect(() => {
    action.mutate({ movieId: movie.id, action: "opened" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);

  const state = data?.interactions.find((i) => i.movie_id === movie.id);
  const inList = !!data?.watchlist.some((w) => w.movie_id === movie.id && w.status === "want_to_watch");

  const highlights = useMemo(
    () =>
      Object.entries(movie.features)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([key]) => FEATURE_LABELS[key] ?? key),
    [movie],
  );

  const fallbackSimilar = useMemo(
    () =>
      MOVIES.filter((m) => m.id !== movie.id)
        .map((m) => ({ m, s: semanticSimilarity(m, [movie]) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 6)
        .map(({ m }) => ({ movieId: m.id })),
    [movie],
  );

  const recommend = useServerFn(getRecommendations);
  const similarQuery = useQuery({
    queryKey: ["similar", movie.id],
    queryFn: () => recommend({ data: { query: "", excludeIds: [], seed: 0, limit: 6, similarToMovieId: movie.id } }),
    staleTime: 60_000,
  });

  const similar = similarQuery.data?.items.length
    ? similarQuery.data.items.map((i) => ({ movieId: i.movieId, fit: i.fit, reasons: i.reasons }))
    : fallbackSimilar;

  return (
    <article>
      <Link to="/" className="mb-8 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back
      </Link>

      <div className="grid gap-8 sm:grid-cols-[minmax(0,240px)_1fr]">
        <MoviePoster movie={movie} />
        <div>
          <h1 className="font-display text-4xl leading-tight">{movie.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {movie.year} · {movie.runtime} min · {movie.genres.join(" · ")}
          </p>
          <p className="mt-5 max-w-prose leading-relaxed text-foreground/85">{movie.overview}</p>

          <div className="mt-7 flex flex-wrap gap-2">
            <Action
              active={state?.liked === true}
              onClick={() => action.mutate({ movieId: movie.id, action: state?.liked === true ? "clear_rating" : "like" })}
              icon={<Heart className={cn("size-4", state?.liked === true && "fill-current")} />}
              label="Like"
            />
            <Action
              active={state?.liked === false}
              onClick={() => action.mutate({ movieId: movie.id, action: state?.liked === false ? "clear_rating" : "dislike" })}
              icon={<ThumbsDown className="size-4" />}
              label="Not for me"
            />
            <Action
              active={inList}
              onClick={() => action.mutate({ movieId: movie.id, action: inList ? "remove_list" : "add_list" })}
              icon={<Plus className="size-4" />}
              label={inList ? "In My List" : "My List"}
            />
            <Action
              active={!!state?.watched}
              onClick={() => action.mutate({ movieId: movie.id, action: state?.watched ? "unwatched" : "watched" })}
              icon={<Check className="size-4" />}
              label="Watched"
            />
          </div>

          <div className="mt-8">
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Why this fits the mood</p>
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/80">
              {highlights.map((t) => (
                <li key={t}>— {t}</li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <FeedbackDialog trigger="Tell us what's off about this pick" movieId={movie.id} />
          </div>
        </div>
      </div>

      <section className="mt-16">
        <h2 className="mb-6 font-display text-2xl">More like {movie.title}</h2>
        <MovieGrid items={similar} />
      </section>
    </article>
  );
}

function Action({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "chamfer-sm hairline flex items-center gap-2 px-4 py-2.5 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
