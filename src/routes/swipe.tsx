import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Check, Heart, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { RequireAuth } from "@/components/require-auth";
import { MoviePoster } from "@/components/movie-poster";
import { getRecommendations } from "@/lib/app.functions";
import { getMovie, registerMovies } from "@/lib/movie-registry";
import { useMovieAction } from "@/hooks/use-app-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/swipe")({
  head: () => ({
    meta: [
      { title: "Swipe — quick picks on Reel" },
      {
        name: "description",
        content: "Swipe through films one at a time: left to pass, right to save to your list. Every swipe teaches your taste model.",
      },
      { property: "og:title", content: "Swipe — quick picks on Reel" },
      { property: "og:description", content: "One film at a time. Swipe left to pass, right to save it to your list." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Swipe />
    </RequireAuth>
  ),
});

type Card = { movieId: number; fit?: number; reasons?: string[] };

function Swipe() {
  const navigate = useNavigate();
  const action = useMovieAction();
  const recommend = useServerFn(getRecommendations);

  const [queue, setQueue] = useState<Card[]>([]);
  const [seen, setSeen] = useState<number[]>([]);
  const [drag, setDrag] = useState(0);
  const [flying, setFlying] = useState<"left" | "right" | "up" | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  const load = useMutation({
    mutationFn: (exclude: number[]) =>
      recommend({ data: { query: "", excludeIds: exclude, seed: Math.floor(Math.random() * 100000), limit: 9 } }),
    onSuccess: (res) => {
      registerMovies(res.extras);
      setQueue((current) => {
        const known = new Set(current.map((c) => c.movieId));
        return [...current, ...res.items.filter((i) => !known.has(i.movieId)).map((i) => ({ movieId: i.movieId, fit: i.fit, reasons: i.reasons }))];
      });
    },
    onError: () => toast.error("Couldn't load more picks."),
  });

  useEffect(() => {
    load.mutate([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const top = queue[0];
  const next = queue[1];
  const movie = top ? getMovie(top.movieId) : null;
  const nextMovie = next ? getMovie(next.movieId) : null;

  useEffect(() => {
    if (queue.length <= 3 && !load.isPending) load.mutate([...seen, ...queue.map((c) => c.movieId)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length]);

  const advance = (direction: "left" | "right" | "up", act: Parameters<typeof action.mutate>[0]["action"]) => {
    if (!top || flying) return;
    const id = top.movieId;
    action.mutate({ movieId: id, action: act });
    setFlying(direction);
    setTimeout(() => {
      setSeen((s) => [...s, id]);
      setQueue((q) => q.slice(1));
      setFlying(null);
      setDrag(0);
    }, 280);
  };

  const pass = () => advance("left", "not_interested");
  const save = () => advance("right", "add_list");
  const like = () => advance("up", "like");
  const watched = () => advance("up", "watched");

  const onDown = (e: React.PointerEvent) => {
    if (flying) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 6) moved.current = true;
    setDrag(dx);
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = drag;
    if (dx > 110) save();
    else if (dx < -110) pass();
    else setDrag(0);
  };

  const openDetail = () => {
    if (moved.current || !top) return;
    navigate({ to: "/movie/$movieId", params: { movieId: String(top.movieId) } });
  };

  const offset = flying === "left" ? -700 : flying === "right" ? 700 : drag;
  const rotate = flying === "up" ? 0 : offset / 22;
  const intent = drag > 60 ? "right" : drag < -60 ? "left" : null;

  return (
    <div className="mx-auto max-w-md">
      <header className="mb-6 text-center">
        <h1 className="font-display text-3xl">Swipe</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Swipe left to pass, right to save it to your list. Tap the card for the full page.
        </p>
      </header>

      <div className="relative h-[520px] select-none">
        {nextMovie && (
          <div className="absolute inset-x-6 top-3 -z-0 opacity-60 blur-[1px] transition-all duration-300">
            <MoviePoster movie={nextMovie} />
          </div>
        )}

        {movie ? (
          <div
            role="button"
            tabIndex={0}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onClick={openDetail}
            onKeyDown={(e) => {
              if (e.key === "Enter") openDetail();
              if (e.key === "ArrowLeft") pass();
              if (e.key === "ArrowRight") save();
            }}
            className={cn(
              "chamfer hairline absolute inset-x-0 top-0 cursor-grab touch-none overflow-hidden bg-surface active:cursor-grabbing",
              !dragging.current && "transition-transform duration-300 ease-out",
              flying && "opacity-0 transition-all duration-300",
            )}
            style={{
              transform: `translateX(${offset}px) translateY(${flying === "up" ? -700 : 0}px) rotate(${rotate}deg)`,
            }}
          >
            <div className="relative">
              <MoviePoster movie={movie} />
              {typeof top?.fit === "number" && (
                <span className="chamfer-sm absolute right-3 top-3 bg-background/85 px-2 py-1 text-[0.65rem] uppercase tracking-[0.15em] text-primary">
                  {top.fit}% fit
                </span>
              )}
              <span
                className={cn(
                  "chamfer-sm absolute left-3 top-3 border border-destructive px-3 py-1 text-xs uppercase tracking-[0.2em] text-destructive transition-opacity duration-150",
                  intent === "left" ? "opacity-100" : "opacity-0",
                )}
              >
                Pass
              </span>
              <span
                className={cn(
                  "chamfer-sm absolute right-3 bottom-3 border border-primary px-3 py-1 text-xs uppercase tracking-[0.2em] text-primary transition-opacity duration-150",
                  intent === "right" ? "opacity-100" : "opacity-0",
                )}
              >
                Save
              </span>
            </div>
            <div className="p-4">
              <p className="truncate font-display text-xl">{movie.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {movie.year} · {movie.genres.slice(0, 3).join(" · ")}
              </p>
              {top?.reasons?.[0] && (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">{top.reasons[0]}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="chamfer hairline flex h-full animate-pulse items-center justify-center bg-surface text-sm text-muted-foreground">
            {load.isPending ? "Finding your next pick…" : "No more picks right now."}
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-center gap-4">
        <SwipeButton label="Pass" onClick={pass} tone="danger">
          <X className="size-5" />
        </SwipeButton>
        <SwipeButton label="Like" onClick={like} tone="primary">
          <Heart className="size-5" />
        </SwipeButton>
        <SwipeButton label="Add to My List" onClick={save} tone="plain">
          <Plus className="size-5" />
        </SwipeButton>
        <SwipeButton label="Watched" onClick={watched} tone="plain">
          <Check className="size-5" />
        </SwipeButton>
      </div>
    </div>
  );
}

function SwipeButton({
  label,
  onClick,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  tone: "danger" | "primary" | "plain";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "chamfer-sm hairline flex size-12 items-center justify-center transition-all duration-200 hover:-translate-y-1 active:scale-90",
        tone === "danger" && "text-destructive hover:bg-destructive hover:text-destructive-foreground",
        tone === "primary" && "text-primary hover:bg-primary hover:text-primary-foreground",
        tone === "plain" && "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
