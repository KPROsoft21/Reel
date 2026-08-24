import { createFileRoute } from "@tanstack/react-router";

import { RequireAuth } from "@/components/require-auth";
import { MovieGrid } from "@/components/movie-grid";
import { useSnapshot } from "@/hooks/use-app-data";

export const Route = createFileRoute("/watched")({
  head: () => ({
    meta: [
      { title: "Watched — Reel" },
      { name: "description", content: "A running record of what you've seen, so recommendations never repeat themselves." },
      { property: "og:title", content: "Watched — Reel" },
      { property: "og:description", content: "A running record of what you've seen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Watched />
    </RequireAuth>
  ),
});

function Watched() {
  const { data } = useSnapshot();
  const items = (data?.interactions ?? []).filter((i) => i.watched).map((i) => ({ movieId: i.movie_id }));

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl">Watched</h1>
      <MovieGrid items={items} empty="Mark films as watched and they'll be logged here." />
    </div>
  );
}
