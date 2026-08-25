import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getTasteSummary } from "@/lib/taste.functions";
import { useSession } from "./use-session";

export function useTasteSummary() {
  const { userId } = useSession();
  const fetchSummary = useServerFn(getTasteSummary);
  return useQuery({
    queryKey: ["taste-summary", userId],
    queryFn: () => fetchSummary(),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}
