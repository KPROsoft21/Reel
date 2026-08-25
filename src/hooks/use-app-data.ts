import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getSnapshot, recordAction, updateProfile, correctTag, submitFeedback } from "@/lib/app.functions";
import { registerMovies } from "@/lib/movie-registry";
import { useSession } from "./use-session";

export type MovieAction =
  | "like"
  | "dislike"
  | "clear_rating"
  | "not_interested"
  | "watched"
  | "unwatched"
  | "add_list"
  | "remove_list"
  | "opened";

export function useSnapshot() {
  const { userId } = useSession();
  const fetchSnapshot = useServerFn(getSnapshot);
  return useQuery({
    queryKey: ["snapshot", userId],
    queryFn: async () => {
      const snapshot = await fetchSnapshot();
      registerMovies(snapshot.extras);
      return snapshot;
    },
    enabled: !!userId,
    staleTime: 10_000,
  });
}

type SnapshotData = Awaited<ReturnType<typeof getSnapshot>>;

/** Patch the cached snapshot right away so buttons respond instantly; the
 *  server write still runs and reconciles the cache when it lands. */
function optimistic(prev: SnapshotData, movieId: number, action: MovieAction): SnapshotData {
  const now = new Date().toISOString();
  const interactions = [...prev.interactions];
  const idx = interactions.findIndex((i) => i.movie_id === movieId);
  const base = interactions[idx] ?? {
    movie_id: movieId,
    watched: false,
    liked: null,
    not_interested_at: null,
    not_interested_count: 0,
  };
  const next = { ...base };

  if (action === "like") { next.liked = true; next.watched = true; }
  if (action === "dislike") next.liked = false;
  if (action === "clear_rating") next.liked = null;
  if (action === "watched") next.watched = true;
  if (action === "unwatched") next.watched = false;
  if (action === "not_interested") {
    next.not_interested_at = now;
    next.not_interested_count = (base.not_interested_count ?? 0) + 1;
  }
  if (idx >= 0) interactions[idx] = next;
  else interactions.push(next);

  let watchlist = prev.watchlist;
  if (action === "add_list" || action === "like" || action === "watched") {
    const status = action === "add_list" ? "want_to_watch" : "watched";
    watchlist = watchlist.some((w) => w.movie_id === movieId)
      ? watchlist.map((w) => (w.movie_id === movieId ? { ...w, status } : w))
      : [...watchlist, { movie_id: movieId, status, added_at: now }];
  }
  if (action === "remove_list") watchlist = watchlist.filter((w) => w.movie_id !== movieId);

  return { ...prev, interactions, watchlist };
}

export function useMovieAction() {
  const qc = useQueryClient();
  const act = useServerFn(recordAction);
  return useMutation({
    mutationFn: (input: { movieId: number; action: MovieAction }) => act({ data: input }),
    onMutate: async ({ movieId, action }) => {
      await qc.cancelQueries({ queryKey: ["snapshot"] });
      const snapshots = qc.getQueriesData<SnapshotData>({ queryKey: ["snapshot"] });
      for (const [key, data] of snapshots) {
        if (data) qc.setQueryData(key, optimistic(data, movieId, action));
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) qc.setQueryData(key, data);
      toast.error("Couldn't save that just now.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["snapshot"] }),
  });
}


export function useProfileUpdate() {
  const qc = useQueryClient();
  const update = useServerFn(updateProfile);
  return useMutation({
    mutationFn: (input: { displayName: string; bio: string }) => update({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast.success("Profile saved");
    },
  });
}

export function useTagCorrection() {
  const qc = useQueryClient();
  const correct = useServerFn(correctTag);
  return useMutation({
    mutationFn: (input: { featureKey: string; keep: boolean }) => correct({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }),
  });
}

export function useFeedback() {
  const qc = useQueryClient();
  const send = useServerFn(submitFeedback);
  return useMutation({
    mutationFn: (input: { movieId: number | null; reasons: string[]; text: string }) => send({ data: input }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["snapshot"] });
      toast.success(res.learned);
    },
    onError: () => toast.error("Couldn't send that feedback."),
  });
}
