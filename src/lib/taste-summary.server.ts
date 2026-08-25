import { generateText, Output } from "ai";
import { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3.7-flash";

export type TasteSummary = {
  headline: string;
  summary: string;
  reasons: { title: string; detail: string }[];
  blindspot: string;
};

const Schema = z.object({
  headline: z.string().describe("A short, vivid label for this viewer's taste, max 6 words"),
  summary: z.string().describe("2-3 sentences describing what the algorithm believes about their taste"),
  reasons: z
    .array(
      z.object({
        title: z.string().describe("Short claim, max 6 words"),
        detail: z.string().describe("One sentence citing the concrete evidence (features, films, notes) behind it"),
      }),
    )
    .describe("3-5 evidence-backed reasons the algorithm holds this view"),
  blindspot: z.string().describe("One sentence on what the model is still unsure about and what would sharpen it"),
});

export type TasteEvidence = {
  loves: { label: string; value: number; confidence: number; evidence: number }[];
  avoids: { label: string; value: number; confidence: number; evidence: number }[];
  liked: string[];
  disliked: string[];
  watched: string[];
  saved: string[];
  notes: string[];
};

export function heuristicSummary(e: TasteEvidence): TasteSummary {
  const top = e.loves.slice(0, 3).map((l) => l.label.toLowerCase());
  return {
    headline: top.length ? top.slice(0, 2).join(" + ") : "Still forming",
    summary: top.length
      ? `Your model leans toward ${top.join(", ")} films, built from ${e.liked.length} likes and ${e.watched.length} watched titles.`
      : "Not enough signal yet — rate a few films and this summary sharpens quickly.",
    reasons: e.loves.slice(0, 3).map((l) => ({
      title: l.label,
      detail: `Learned from ${l.evidence} signal${l.evidence === 1 ? "" : "s"} at ${Math.round(l.confidence * 100)}% confidence.`,
    })),
    blindspot: "More ratings — especially dislikes — would let the model separate taste from habit.",
  };
}

export async function summariseTaste(e: TasteEvidence): Promise<TasteSummary> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return heuristicSummary(e);

  const fmt = (rows: TasteEvidence["loves"]) =>
    rows.map((r) => `${r.label} (strength ${r.value.toFixed(2)}, confidence ${r.confidence.toFixed(2)}, ${r.evidence} signals)`).join("; ") || "none";

  const prompt = [
    "You are the recommendation engine explaining its own model of this viewer's taste to them, in second person.",
    "Be specific and grounded: cite the learned features, the films, and the viewer's own notes. Never invent evidence.",
    "",
    `Positively weighted features: ${fmt(e.loves)}`,
    `Negatively weighted features: ${fmt(e.avoids)}`,
    `Liked films: ${e.liked.join(", ") || "none"}`,
    `Disliked films: ${e.disliked.join(", ") || "none"}`,
    `Watched films: ${e.watched.slice(0, 30).join(", ") || "none"}`,
    `Saved for later: ${e.saved.slice(0, 20).join(", ") || "none"}`,
    `Rules the viewer wrote: ${e.notes.join(" | ") || "none"}`,
    "",
    "Explain WHY the model thinks this — connect each claim to the evidence above.",
  ].join("\n");

  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { output } = await generateText({
      model: gateway(MODEL),
      output: Output.object({ schema: Schema }),
      prompt,
    });
    return {
      headline: output.headline?.trim() || heuristicSummary(e).headline,
      summary: output.summary?.trim() || "",
      reasons: (output.reasons ?? []).slice(0, 5).map((r) => ({ title: String(r.title), detail: String(r.detail) })),
      blindspot: output.blindspot?.trim() || "",
    };
  } catch {
    return heuristicSummary(e);
  }
}
