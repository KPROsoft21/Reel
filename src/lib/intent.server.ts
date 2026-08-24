import { generateText, Output } from "ai";
import { z } from "zod";

import { FEATURE_KEYS, ALL_GENRES, MOVIES } from "@/data/catalog";
import { createLovableAiGatewayProvider, gatewayErrorMessage } from "./ai-gateway.server";
import type { Intent } from "./recommender";

const MODEL = "google/gemini-3.7-flash";

const featureRecord = z.record(z.enum(FEATURE_KEYS as unknown as [string, ...string[]]), z.number());

const IntentSchema = z.object({
  exact_title: z.string().nullish().describe("Set only when the user is clearly searching for one specific film by name"),
  similar_to: z.array(z.string()).nullish().describe("Movie titles the user referenced as a comparison"),
  positive: featureRecord.nullish().describe("Desired feature levels, 0..1"),
  negative: featureRecord.nullish().describe("Features to avoid, 0..1 where 1 means strongly avoid"),
  genres_include: z.array(z.string()).nullish(),
  genres_exclude: z.array(z.string()).nullish(),
  runtime_max: z.number().nullish(),
  runtime_min: z.number().nullish(),
  summary: z.string().nullish().describe("One short clause describing the mood, e.g. 'a lighter space epic'"),
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

type LooseIntent = Record<string, any>;

const FEATURE_SET = new Set<string>(FEATURE_KEYS as unknown as string[]);
const GENRE_SET = new Set<string>(ALL_GENRES as unknown as string[]);

function cleanFeatures(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (FEATURE_SET.has(k) && Number.isFinite(n)) out[k] = Math.max(0, Math.min(1, n));
  }
  return out;
}

function cleanGenres(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => String(g))
    .map((g) => ALL_GENRES.find((x) => x.toLowerCase() === g.toLowerCase()) ?? g)
    .filter((g) => GENRE_SET.has(g));
}

/** The model's JSON shape varies; normalise whatever it returns into an Intent. */
function normalizeIntent(raw: LooseIntent, fallback: Intent, query: string): Intent {
  const sem = raw["semantic_features"] ?? raw["features"] ?? {};
  const positive = { ...cleanFeatures(raw["positive"]), ...cleanFeatures(sem?.positive) };
  const negative = { ...cleanFeatures(raw["negative"]), ...cleanFeatures(sem?.negative) };
  const include = cleanGenres(raw["genres_include"] ?? raw["genres"]);
  const runtimeMax = Number(raw["runtime_max"]);
  const runtimeMin = Number(raw["runtime_min"]);
  const similar = Array.isArray(raw["similar_to"]) ? raw["similar_to"].map(String) : [];
  const summary = typeof raw["summary"] === "string" ? raw["summary"] : "";

  return {
    exact_title: typeof raw["exact_title"] === "string" ? raw["exact_title"] : null,
    similar_to: similar.length ? similar : fallback.similar_to,
    positive: Object.keys(positive).length ? positive : fallback.positive,
    negative: Object.keys(negative).length ? negative : fallback.negative,
    genres_include: include.length ? include : fallback.genres_include,
    genres_exclude: cleanGenres(raw["genres_exclude"]),
    runtime_max: Number.isFinite(runtimeMax) && runtimeMax > 0 ? runtimeMax : fallback.runtime_max,
    runtime_min: Number.isFinite(runtimeMin) && runtimeMin > 0 ? runtimeMin : null,
    summary: summary || query.slice(0, 60),
  };
}

function extractJson(text: string): LooseIntent | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as LooseIntent;
  } catch {
    return null;
  }
}

export async function interpretIntent(query: string): Promise<{ intent: Intent; notice?: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  const fallback = heuristicIntent(query);
  if (!key) return { intent: fallback };

  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway(MODEL),
      system: `${SYSTEM}

Reply with ONLY a JSON object using exactly these keys:
{"exact_title": string|null, "similar_to": string[], "positive": {feature: 0..1}, "negative": {feature: 0..1}, "genres_include": string[], "genres_exclude": string[], "runtime_max": number|null, "runtime_min": number|null, "summary": string}`,
      prompt: query,
    });
    const raw = extractJson(text);
    if (!raw) return { intent: fallback };
    return { intent: normalizeIntent(raw, fallback, query) };


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
