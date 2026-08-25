import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractKnowledge } from "./knowledge.server";
import { toSignals, type KnowledgeSignals } from "./recommender";

export type KnowledgeEntry = {
  id: string;
  raw_text: string;
  summary: string;
  signals: KnowledgeSignals;
  active: boolean;
  created_at: string;
};

export const listKnowledge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("user_knowledge")
      .select("id, raw_text, summary, signals, active, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((row) => ({
      id: String(row.id),
      raw_text: String(row.raw_text),
      summary: String(row.summary),
      signals: toSignals(row.signals),
      active: !!row.active,
      created_at: String(row.created_at),
    })) as KnowledgeEntry[];
  });

export const addKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ text: z.string().min(3).max(600) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const text = data.text.trim();
    const { summary, ...signals } = await extractKnowledge(text);

    const { data: row } = await supabase
      .from("user_knowledge")
      .insert({ user_id: userId, raw_text: text, summary, signals })
      .select("id, raw_text, summary, signals, active, created_at")
      .maybeSingle();

    return { summary, id: row?.id ? String(row.id) : null };
  });

export const setKnowledgeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string(), active: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("user_knowledge")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", data.id);
    return { ok: true };
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("user_knowledge").delete().eq("user_id", userId).eq("id", data.id);
    return { ok: true };
  });
