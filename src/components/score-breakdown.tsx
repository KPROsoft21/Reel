import type { ScoreBreakdown } from "@/lib/recommender";

const pct = (n: number) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
const pts = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(3)}`;

const MODE_LABEL: Record<ScoreBreakdown["mode"], string> = {
  search: "Search mode — your request carries most of the weight",
  feed: "Feed mode — your learned taste carries most of the weight",
  direct: "Direct match — you searched for this specifically",
};

/** The honest arithmetic behind a card's fit %. */
export function ScoreBreakdownPanel({ breakdown }: { breakdown: ScoreBreakdown }) {
  const max = Math.max(0.0001, ...breakdown.lines.map((l) => Math.abs(l.contribution)));

  return (
    <div className="chamfer-sm hairline mt-3 bg-background p-4 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">How this {breakdown.fit}% was built</p>
        <span className="text-[0.6rem] uppercase tracking-[0.2em] text-primary">{pts(breakdown.total)} pts</span>
      </div>
      <p className="mt-1 text-[0.7rem] text-muted-foreground">{MODE_LABEL[breakdown.mode]}</p>

      <div className="mt-4 space-y-3">
        {breakdown.lines.map((l) => (
          <div key={l.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-foreground/90">{l.label}</span>
              <span className="shrink-0 text-[0.6rem] tabular-nums text-muted-foreground">
                {pct(l.value)} × {l.weight.toFixed(2)} = {pts(l.contribution)}
              </span>
            </div>
            <div className="mt-1 h-1 w-full bg-surface">
              <div
                className="h-1 bg-primary"
                style={{ width: `${Math.max(3, (Math.abs(l.contribution) / max) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[0.65rem] leading-relaxed text-muted-foreground/80">{l.hint}</p>
          </div>
        ))}
      </div>

      {breakdown.adjustments.length > 0 && (
        <div className="mt-4">
          <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">Adjustments</p>
          <div className="mt-2 space-y-2">
            {breakdown.adjustments.map((a) => (
              <div key={a.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-foreground/90">{a.label}</span>
                  <span
                    className={`shrink-0 text-[0.6rem] tabular-nums ${a.value >= 0 ? "text-primary" : "text-destructive"}`}
                  >
                    {pts(a.value)}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground/80">{a.hint}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hairline mt-4 border-t pt-3 text-[0.65rem] leading-relaxed text-muted-foreground">
        <p>
          Weighted signals {pts(breakdown.weighted)} of a possible {breakdown.budget.toFixed(2)} · after adjustments{" "}
          {pts(breakdown.total)}.
        </p>
        <p className="mt-1">
          Normalised strength {pct(breakdown.quality)} → fit = 28 + 66 × strength<sup>0.85</sup> ={" "}
          <span className="text-primary">{breakdown.fit}%</span>
        </p>
      </div>
    </div>
  );
}
