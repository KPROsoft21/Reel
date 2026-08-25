import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import { RequireAuth } from "@/components/require-auth";
import { MovieGrid } from "@/components/movie-grid";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { getRecommendations, getSearchOptions } from "@/lib/app.functions";
import { registerMovies } from "@/lib/movie-registry";
import { useSnapshot } from "@/hooks/use-app-data";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reel — Movie recommendations that learn your taste" },
      {
        name: "description",
        content:
          "Ask for what you're in the mood for and get nine films chosen from a taste model that learns from every like, watch and note.",
      },
      { property: "og:title", content: "Reel — Movie recommendations that learn your taste" },
      {
        property: "og:description",
        content: "Describe a mood in plain language and get nine films picked for you, with the reasoning shown.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Home />
    </RequireAuth>
  ),
});

const PROMPTS = [
  "What are you in the mood for?",
  "Something like Dune but less serious…",
  "Find me something for a rainy night.",
  "I want a funny thriller under two hours.",
  "Surprise me.",
];

function Home() {
  const [query, setQuery] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const [heading, setHeading] = useState("Best matches");
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [feed, setFeed] = useState<{ movieId: number; fit?: number; reasons?: string[] }[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [lastEntity, setLastEntity] = useState<Option | null>(null);
  const recommend = useServerFn(getRecommendations);
  const searchOptions = useServerFn(getSearchOptions);
  type Option = { kind: "actor" | "director" | "franchise" | "studio" | "keyword" | "title"; id: string; label: string; subtitle: string };
  const [options, setOptions] = useState<Option[] | null>(null);
  const [pendingQuery, setPendingQuery] = useState("");
  const { data: snapshot } = useSnapshot();

  useEffect(() => {
    const t = setInterval(() => setPromptIndex((i) => (i + 1) % PROMPTS.length), 4200);
    return () => clearInterval(t);
  }, []);

  const mutation = useMutation({
    mutationFn: (input: { q: string; seed: number; entity?: Option | null }) =>
      recommend({
        data: {
          query: input.q,
          excludeIds: dismissed,
          seed: input.seed,
          limit: 9,
          entity: input.entity ? { kind: input.entity.kind, id: input.entity.id, label: input.entity.label } : null,
        },
      }),
    onSuccess: (res, input) => {
      registerMovies(res.extras);
      if (res.notice) toast.message(res.notice);
      setLastQuery(input.q);
      setLastEntity(input.entity ?? null);
      setFeed(res.items.map((i) => ({ movieId: i.movieId, fit: i.fit, reasons: i.reasons })));
      setHeading(res.exactTitle ? `Results for “${res.exactTitle}”` : res.intentSummary ? `Because you asked for ${res.intentSummary}` : "Best matches");
    },
    onError: () => toast.error("Recommendation failed. Try again."),
  });

  const replace = useMutation({
    mutationFn: (input: { exclude: number[] }) =>
      recommend({
        data: {
          query: lastQuery,
          excludeIds: input.exclude,
          seed: Math.floor(Math.random() * 100000),
          limit: 1,
          entity: lastEntity ? { kind: lastEntity.kind, id: lastEntity.id, label: lastEntity.label } : null,
        },
      }),
  });

  const run = (q: string, entity?: Option | null) =>
    mutation.mutate({ q, entity: entity ?? null, seed: Math.floor(Math.random() * 100000) });

  // Ambiguous queries ("marvel") get confirmed by the viewer instead of guessed.
  const disambiguate = useMutation({
    mutationFn: (q: string) => searchOptions({ data: { query: q } }),
    onSuccess: (res, q) => {
      const all = [...res.titles, ...res.candidates] as Option[];
      if (all.length <= 1) {
        run(q, all[0] ?? null);
        setOptions(null);
        return;
      }
      setPendingQuery(q);
      setOptions(all);
    },
    onError: (_e, q) => run(q),
  });

  const submit = (q: string) => {
    const trimmed = q.trim();
    setOptions(null);
    if (!trimmed) return run("");
    disambiguate.mutate(trimmed);
  };

  const choose = (option: Option | null) => {
    setOptions(null);
    run(pendingQuery, option);
  };

  useEffect(() => {
    run("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRemove = (id: number) => {
    const nextDismissed = dismissed.includes(id) ? dismissed : [...dismissed, id];
    setDismissed(nextDismissed);
    const index = feed.findIndex((i) => i.movieId === id);
    const remaining = feed.filter((i) => i.movieId !== id);
    setFeed(remaining);
    replace.mutate(
      { exclude: [...nextDismissed, ...remaining.map((i) => i.movieId)] },
      {
        onSuccess: (res) => {
          registerMovies(res.extras);
          const pick = res.items[0];
          if (!pick) return;
          setFeed((current) => {
            if (current.some((i) => i.movieId === pick.movieId)) return current;
            const next = [...current];
            next.splice(Math.max(0, index), 0, { movieId: pick.movieId, fit: pick.fit, reasons: pick.reasons });
            return next;
          });
        },
      },
    );
  };

  const items = feed;



  const observation = useMemo(() => {
    const tags = snapshot?.tags ?? [];
    if (tags.length < 3) return null;
    const [a, b] = tags;
    if (!a || !b) return null;
    return `You seem to care more about ${a.label.toLowerCase()} and ${b.label.toLowerCase()} than genre, so we've started recommending outside your usual corners.`;
  }, [snapshot?.tags]);

  return (
    <div>
      <section className="pb-14 pt-10 text-center">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">What are you in the mood for?</h1>
        <form
          className="mx-auto mt-8 flex max-w-2xl items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PROMPTS[promptIndex]}
            aria-label="Describe what you feel like watching"
            className="chamfer hairline h-14 w-full bg-surface px-5 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={mutation.isPending || disambiguate.isPending}
            aria-label="Get recommendations"
            className="chamfer flex h-14 w-14 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-opacity disabled:opacity-60"
          >
            <ArrowRight className="size-5" />
          </button>
        </form>
      </section>


      {options && (
        <div className="chamfer hairline mb-10 bg-surface p-5">
          <p className="text-sm font-medium">Which “{pendingQuery}” did you mean?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={`${o.kind}-${o.id}`}
                type="button"
                onClick={() => choose(o)}
                className="chamfer hairline bg-background px-4 py-2 text-left transition-colors hover:border-primary"
              >
                <span className="block text-sm">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.subtitle}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => choose(null)}
              className="chamfer hairline bg-background px-4 py-2 text-left transition-colors hover:border-primary"
            >
              <span className="block text-sm">None of these</span>
              <span className="block text-xs text-muted-foreground">Treat it as a mood</span>
            </button>
          </div>
        </div>
      )}

      {observation && (
        <div className="chamfer hairline mb-10 flex gap-3 bg-surface p-5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">We noticed something about your taste.</p>
            <p className="mt-1 text-sm text-muted-foreground">{observation}</p>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl">{mutation.isPending || disambiguate.isPending ? "Thinking…" : heading}</h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => submit(query)}
            disabled={mutation.isPending}
            className="text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Show different picks
          </button>
          <FeedbackDialog trigger="These aren't right" />
        </div>
      </div>

      {mutation.isPending || disambiguate.isPending ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="chamfer aspect-[2/3] w-full animate-pulse bg-surface" />
          ))}
        </div>
      ) : (
        <MovieGrid
          items={items}
          onRemove={onRemove}
          empty="No matches for that. Try loosening the constraints."
        />
      )}
    </div>
  );
}
