import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import { RequireAuth } from "@/components/require-auth";
import { MovieGrid } from "@/components/movie-grid";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { getRecommendations } from "@/lib/app.functions";
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
  const recommend = useServerFn(getRecommendations);
  const { data: snapshot } = useSnapshot();

  useEffect(() => {
    const t = setInterval(() => setPromptIndex((i) => (i + 1) % PROMPTS.length), 4200);
    return () => clearInterval(t);
  }, []);

  const mutation = useMutation({
    mutationFn: (input: { q: string; seed: number }) =>
      recommend({ data: { query: input.q, excludeIds: [], seed: input.seed } }),
    onSuccess: (res) => {
      if (res.notice) toast.message(res.notice);
      setHeading(res.exactTitle ? `Results for “${res.exactTitle}”` : res.intentSummary ? `Because you asked for ${res.intentSummary}` : "Best matches");
    },
    onError: () => toast.error("Recommendation failed. Try again."),
  });

  const run = (q: string) => mutation.mutate({ q, seed: Math.floor(Math.random() * 100000) });

  useEffect(() => {
    run("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(
    () => (mutation.data?.items ?? []).map((i) => ({ movieId: i.movieId, fit: i.fit, reasons: i.reasons })),
    [mutation.data],
  );


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
            mutation.mutate(query);
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
            disabled={mutation.isPending}
            aria-label="Get recommendations"
            className="chamfer flex h-14 w-14 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-opacity disabled:opacity-60"
          >
            <ArrowRight className="size-5" />
          </button>
        </form>
      </section>

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
        <h2 className="font-display text-2xl">{mutation.isPending ? "Thinking…" : heading}</h2>
        <FeedbackDialog trigger="These aren't right" />
      </div>

      {mutation.isPending ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="chamfer aspect-[2/3] w-full animate-pulse bg-surface" />
          ))}
        </div>
      ) : (
        <MovieGrid items={items} empty="No matches for that. Try loosening the constraints." />
      )}
    </div>
  );
}
