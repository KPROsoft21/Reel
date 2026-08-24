import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

export class AiGatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function gatewayErrorMessage(error: unknown): string {
  const status = (error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status;
  if (status === 429) return "The AI service is busy right now. Try again in a moment.";
  if (status === 402) return "AI credits are exhausted for this workspace. Add credits in Lovable to keep using mood search.";
  if (status === 403) return "AI access is blocked by workspace policy.";
  return "Couldn't interpret that request with AI — falling back to keyword matching.";
}
