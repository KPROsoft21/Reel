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

export function useMovieAction() {
  const qc = useQueryClient();
  const act = useServerFn(recordAction);
  return useMutation({
    mutationFn: (input: { movieId: number; action: MovieAction }) => act({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snapshot"] }),
    onError: () => toast.error("Couldn't save that just now."),
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
