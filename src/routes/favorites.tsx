import { createFileRoute } from "@tanstack/react-router";

import { RequireAuth } from "@/components/require-auth";
import { MovieGrid } from "@/components/movie-grid";
import { useSnapshot } from "@/hooks/use-app-data";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Favorites — Reel" },
      { name: "description", content: "Every film you liked, and the taste signals they taught the recommender." },
      { property: "og:title", content: "Favorites — Reel" },
      { property: "og:description", content: "Every film you liked, and the signals they taught the recommender." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Favorites />
    </RequireAuth>
  ),
});

function Favorites() {
  const { data } = useSnapshot();
  const items = (data?.interactions ?? []).filter((i) => i.liked === true).map((i) => ({ movieId: i.movie_id }));

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl">Favorites</h1>
      <MovieGrid items={items} empty="Like a few films and they'll gather here." />
    </div>
  );
}
