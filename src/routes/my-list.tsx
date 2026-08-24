import { createFileRoute } from "@tanstack/react-router";

import { RequireAuth } from "@/components/require-auth";
import { MovieGrid } from "@/components/movie-grid";
import { useSnapshot } from "@/hooks/use-app-data";

export const Route = createFileRoute("/my-list")({
  head: () => ({
    meta: [
      { title: "My List — Reel" },
      { name: "description", content: "Films you saved to watch later, kept in one quiet place." },
      { property: "og:title", content: "My List — Reel" },
      { property: "og:description", content: "Films you saved to watch later, kept in one quiet place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <MyList />
    </RequireAuth>
  ),
});

function MyList() {
  const { data } = useSnapshot();
  const items = (data?.watchlist ?? [])
    .filter((w) => w.status === "want_to_watch")
    .map((w) => ({ movieId: w.movie_id }));

  return (
    <div>
      <h1 className="mb-8 font-display text-3xl">My List</h1>
      <MovieGrid items={items} empty="Nothing saved yet. Add films from the home feed." />
    </div>
  );
}
