import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { addKnowledge, deleteKnowledge, listKnowledge, setKnowledgeActive } from "@/lib/knowledge.functions";
import { useSession } from "./use-session";

export function useKnowledge() {
  const { userId } = useSession();
  const list = useServerFn(listKnowledge);
  return useQuery({
    queryKey: ["knowledge", userId],
    queryFn: () => list(),
    enabled: !!userId,
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["knowledge"] });
    qc.invalidateQueries({ queryKey: ["recommendations"] });
  };
}

export function useAddKnowledge() {
  const refresh = useRefresh();
  const add = useServerFn(addKnowledge);
  return useMutation({
    mutationFn: (text: string) => add({ data: { text } }),
    onSuccess: (res) => {
      refresh();
      toast.success(`Learned: ${res.summary}`);
    },
    onError: () => toast.error("Couldn't save that note."),
  });
}

export function useToggleKnowledge() {
  const refresh = useRefresh();
  const toggle = useServerFn(setKnowledgeActive);
  return useMutation({
    mutationFn: (input: { id: string; active: boolean }) => toggle({ data: input }),
    onSuccess: refresh,
  });
}

export function useDeleteKnowledge() {
  const refresh = useRefresh();
  const remove = useServerFn(deleteKnowledge);
  return useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: refresh,
  });
}
