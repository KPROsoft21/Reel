import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPosters, type PosterEntry } from "@/lib/posters.functions";

export function usePosters() {
  const fetchPosters = useServerFn(getPosters);
  return useQuery({
    queryKey: ["posters"],
    queryFn: () => fetchPosters(),
    staleTime: 1000 * 60 * 60,
  });
}

export function usePoster(movieId: number): PosterEntry | undefined {
  const { data } = usePosters();
  return data?.[movieId];
}
