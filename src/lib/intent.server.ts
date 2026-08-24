import { generateText, Output } from "ai";
import { z } from "zod";

import { FEATURE_KEYS, ALL_GENRES, MOVIES } from "@/data/catalog";
import { createLovableAiGatewayProvider, gatewayErrorMessage } from "./ai-gateway.server";
import type { Intent } from "./recommender";

const MODEL = "google/gemini-3.7-flash";

const featureRecord = z.record(z.enum(FEATURE_KEYS as unknown as [string, ...string[]]), z.number());

const IntentSchema = z.object({
  exact_title: z.string().nullable().describe("Set only when the user is clearly searching for one specific film by name"),
  similar_to: z.array(z.string()).describe("Movie titles the user referenced as a comparison"),
  positive: featureRecord.describe("Desired feature levels, 0..1"),
  negative: featureRecord.describe("Features to avoid, 0..1 where 1 means strongly avoid"),
  genres_include: z.array(z.string()),
  genres_exclude: z.array(z.string()),
  runtime_max: z.number().nullable(),
  runtime_min: z.number().nullable(),
  summary: z.string().describe("One short clause describing the mood, e.g. 'a lighter space epic'"),
});

const SYSTEM = `You translate a movie viewer's natural language mood request into structured retrieval signals.
Available semantic features (values 0..1): ${FEATURE_KEYS.join(", ")}.
Available genres: ${ALL_GENRES.join(", ")}.
Rules:
- Only use feature keys and genres from those lists.
- "positive" holds the level the user wants (0.85 = strongly wants it). "negative" holds strength of avoidance.
- Use similar_to for referenced titles ("like Interstellar").
- Use runtime_max for constraints like "under two hours" (minutes).
- Set exact_title only when the user is looking up one named film rather than asking for a recommendation.
- Keep summary under 10 words.`;

/** Keyword fallback so mood search still works if the AI gateway is unavailable. */
export function heuristicIntent(query: string): Intent {
  const q = query.toLowerCase();
  const positive: Record<string, number> = {};
  const negative: Record<string, number> = {};
  const map: [RegExp, string, number][] = [
    [/funny|comed|laugh|light/, "humor", 0.85],
    [/tense|thrill|edge/, "tension", 0.85],
    [/scary|horror/, "dark_tone", 0.85],
    [/romantic|romance|love/, "romance", 0.9],
    [/weird|strange|surreal/, "complexity", 0.85],
    [/beautiful|stunning|visual/, "visual_style", 0.9],
    [/smart|think|philosoph|mind/, "philosophical", 0.9],
    [/emotional|cry|moving/, "emotional_intensity", 0.9],
    [/slow|quiet|calm|rainy/, "slow_burn", 0.8],
    [/character|people/, "character_driven", 0.9],
    [/hopeful|feel.?good|uplift|warm/, "optimism", 0.9],
    [/dark|bleak|grim/, "dark_tone", 0.85],
  ];
  for (const [re, key, v] of map) if (re.test(q)) positive[key] = v;
  if (/not scary|less serious|not depressing|nothing heavy|less dark/.test(q)) {
    negative["dark_tone"] = 0.8;
    delete positive["dark_tone"];
  }
  if (/no violence|not violent/.test(q)) negative["violence"] = 0.9;

  const runtimeMatch = q.match(/(\d{2,3})\s*(minutes|min|hours|hrs|hour)/);
  let runtime_max: number | null = null;
  if (/under two hours|less than two hours|under 2 hours/.test(q)) runtime_max = 120;
  if (runtimeMatch) {
    const n = Number(runtimeMatch[1]);
    runtime_max = /hour|hr/.test(runtimeMatch[2] ?? "") ? n * 60 : n;
  }

  const similar_to = MOVIES.filter((m) => q.includes(m.title.toLowerCase())).map((m) => m.title);
  const genres_include = ALL_GENRES.filter((g) => q.includes(g.toLowerCase()));

  return {
    positive,
    negative,
    similar_to,
    genres_include,
    genres_exclude: [],
    runtime_max,
    runtime_min: null,
    exact_title: null,
    summary: query.slice(0, 60),
  };
}

export async function interpretIntent(query: string): Promise<{ intent: Intent; notice?: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { intent: heuristicIntent(query) };

  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { output } = await generateText({
      model: gateway(MODEL),
      system: SYSTEM,
      prompt: query,
      output: Output.object({ schema: IntentSchema }),
    });
    const fallback = heuristicIntent(query);
    return {
      intent: {
        ...output,
        similar_to: output.similar_to?.length ? output.similar_to : fallback.similar_to,
        summary: output.summary || fallback.summary,
      } as Intent,
    };
  } catch (error) {
    console.error("intent interpretation failed", error);
    return { intent: heuristicIntent(query), notice: gatewayErrorMessage(error) };
  }
}

const FeedbackSchema = z.object({
  sentiment: z.number().describe("-1 (hated it) to 1 (loved it)"),
  feature_signals: z
    .array(
      z.object({
        feature_key: z.enum(FEATURE_KEYS as unknown as [string, ...string[]]),
        direction: z.number().describe("-1 to 1: negative means the user disliked this quality here"),
        confidence: z.number(),
      }),
    )
    .describe("What the text reveals about the viewer's taste"),
  note: z.string().describe("One sentence restating what the system learned"),
});

export type ExtractedFeedback = z.infer<typeof FeedbackSchema>;

export async function extractFeedback(
  rawText: string,
  movieTitle: string,
): Promise<ExtractedFeedback | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || !rawText.trim()) return null;
  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { output } = await generateText({
      model: gateway(MODEL),
      system: `You extract taste signals from a viewer's comment about a film. Only use these feature keys: ${FEATURE_KEYS.join(", ")}. Never invent facts; if the text is vague, return few signals with low confidence.`,
      prompt: `Film: ${movieTitle}\nComment: ${rawText}`,
      output: Output.object({ schema: FeedbackSchema }),
    });
    return output as ExtractedFeedback;
  } catch (error) {
    console.error("feedback extraction failed", error);
    return null;
  }
}
