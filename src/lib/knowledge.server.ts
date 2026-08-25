import { generateText, Output } from "ai";
import { z } from "zod";

import { ALL_GENRES, FEATURE_KEYS } from "@/data/catalog";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import type { KnowledgeSignals } from "./recommender";

const MODEL = "google/gemini-3.7-flash";

const SignalSchema = z.object({
  summary: z.string().describe("One short sentence restating the rule, e.g. 'Loves westerns, avoids horror'"),
  positive: z
    .array(z.object({ feature_key: z.enum(FEATURE_KEYS as unknown as [string, ...string[]]), weight: z.number() }))
    .describe("Semantic qualities the viewer wants more of (weight 0..1)"),
  negative: z
    .array(z.object({ feature_key: z.enum(FEATURE_KEYS as unknown as [string, ...string[]]), weight: z.number() }))
    .describe("Semantic qualities the viewer wants less of (weight 0..1)"),
  genres_love: z.array(z.string()).describe(`Genres to favour, only from: ${ALL_GENRES.join(", ")}`),
  genres_avoid: z.array(z.string()).describe("Genres to avoid, same list"),
  people_love: z.array(z.string()).describe("Actors, directors or creators the viewer likes"),
  people_avoid: z.array(z.string()).describe("Actors, directors or creators the viewer dislikes"),
  keywords_love: z.array(z.string()).describe("Other topics/themes to favour, lowercase single words or short phrases"),
  keywords_avoid: z.array(z.string()).describe("Topics/themes to avoid"),
  strict: z.boolean().describe("True only when the viewer says never/absolutely no — makes avoidance a hard filter"),
});

const norm = (list: string[] | undefined, allowed?: readonly string[]) => {
  const out = (list ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (!allowed) return [...new Set(out)].slice(0, 8);
  const lower = new Map(allowed.map((a) => [a.toLowerCase(), a]));
  return [...new Set(out.map((s) => lower.get(s.toLowerCase())).filter(Boolean) as string[])].slice(0, 8);
};

const asRecord = (rows: { feature_key: string; weight: number }[] | undefined) => {
  const out: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (!FEATURE_KEYS.includes(r.feature_key as (typeof FEATURE_KEYS)[number])) continue;
    out[r.feature_key] = Math.max(0, Math.min(1, Number(r.weight) || 0.6));
  }
  return out;
};

/** Keyword fallback so notes still work without the AI gateway. */
export function heuristicSignals(text: string): KnowledgeSignals & { summary: string } {
  const t = text.toLowerCase();
  const negative = /(don'?t|do not|dislike|hate|avoid|no more|not into|never|less)\b/.test(t);
  const genres = ALL_GENRES.filter((g) => t.includes(g.toLowerCase()));
  return {
    summary: text.trim().slice(0, 120),
    positive: {},
    negative: {},
    genres_love: negative ? [] : genres,
    genres_avoid: negative ? genres : [],
    people_love: [],
    people_avoid: [],
    keywords_love: [],
    keywords_avoid: [],
    strict: /\bnever\b|\babsolutely no\b/.test(t),
  };
}

export async function extractKnowledge(
  text: string,
): Promise<KnowledgeSignals & { summary: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  const fallback = heuristicSignals(text);
  if (!key) return fallback;

  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { output } = await generateText({
      model: gateway(MODEL),
      system: `You turn a movie viewer's free-form note about their taste into durable retrieval signals for a recommender.
Only use these semantic feature keys: ${FEATURE_KEYS.join(", ")}.
Only use these genres: ${ALL_GENRES.join(", ")}.
Never invent preferences the note does not state. Leave arrays empty when unsure.`,
      prompt: text,
      output: Output.object({ schema: SignalSchema }),
    });
    const o = output as z.infer<typeof SignalSchema>;
    return {
      summary: (o.summary || fallback.summary).slice(0, 160),
      positive: asRecord(o.positive),
      negative: asRecord(o.negative),
      genres_love: norm(o.genres_love, ALL_GENRES),
      genres_avoid: norm(o.genres_avoid, ALL_GENRES),
      people_love: norm(o.people_love),
      people_avoid: norm(o.people_avoid),
      keywords_love: norm(o.keywords_love).map((s) => s.toLowerCase()),
      keywords_avoid: norm(o.keywords_avoid).map((s) => s.toLowerCase()),
      strict: !!o.strict,
    };
  } catch (error) {
    console.error("knowledge extraction failed", error);
    return fallback;
  }
}
