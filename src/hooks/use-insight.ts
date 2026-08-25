import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getAlgorithmInsight } from "@/lib/insight.functions";
import { useSession } from "./use-session";

export function useAlgorithmInsight() {
  const { userId } = useSession();
  const fetchInsight = useServerFn(getAlgorithmInsight);
  return useQuery({
    queryKey: ["algorithm-insight", userId],
    queryFn: () => fetchInsight(),
    enabled: !!userId,
    staleTime: 60_000,
  });
}
