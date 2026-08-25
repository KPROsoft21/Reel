import { useAlgorithmInsight } from "@/hooks/use-insight";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(3)}`;

/** A full, numeric read of what the recommender currently believes about you. */
export function AlgorithmInfo() {
  const { data, isLoading } = useAlgorithmInsight();

  if (isLoading) return <p className="text-sm text-muted-foreground">Crunching your numbers…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">No data yet — rate a few films first.</p>;

  const a = data.activity;

  return (
    <div className="space-y-8 text-sm">
      <section>
        <Head>Model maturity</Head>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Evidence points" value={String(data.maturity.evidence)} />
          <Stat label="Traits tracked" value={String(data.maturity.features)} />
          <Stat label="Profile maturity" value={pct(data.maturity.maturity)} />
          <Stat label="Avg confidence" value={pct(data.maturity.avgConfidence)} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Maturity caps at 30 evidence points. Below that the engine deliberately explores more.
        </p>
      </section>

      <section>
        <Head>What you've done</Head>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Stat label="Liked" value={String(a.liked)} />
          <Stat label="Disliked" value={String(a.disliked)} />
          <Stat label="Watched" value={String(a.watched)} />
          <Stat label="Saved" value={String(a.saved)} />
          <Stat label="Passed (X)" value={String(a.dismissed)} />
          <Stat label="Opened" value={String(a.opened)} />
        </div>
      </section>

      {data.evidenceMix.length > 0 && (
        <section>
          <Head>Where the model's belief comes from</Head>
          <div className="mt-3 space-y-2">
            {data.evidenceMix.map((e) => (
              <Row key={e.type} label={e.type.replace(/_/g, " ")} right={`${e.count} × weight ${e.weight.toFixed(2)}`} />
            ))}
          </div>
        </section>
      )}

      {data.top.length > 0 && (
        <section>
          <Head>Traits it thinks you want</Head>
          <div className="mt-3 space-y-2">
            {data.top.map((f) => (
              <Bar key={f.key} f={f} />
            ))}
          </div>
        </section>
      )}

      {data.bottom.length > 0 && (
        <section>
          <Head>Traits it thinks you avoid</Head>
          <div className="mt-3 space-y-2">
            {data.bottom.map((f) => (
              <Bar key={f.key} f={f} negative />
            ))}
          </div>
        </section>
      )}

      <section>
        <Head>How signals are weighted</Head>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          {data.weights.map((w) => (
            <div key={w.context}>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{w.context}</p>
              <div className="mt-2 space-y-1.5">
                {w.rows.map((r) => (
                  <Row key={r.label} label={r.label} right={r.weight.toFixed(2)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Head>Era bias</Head>
        <p className="mt-2 text-xs text-muted-foreground">
          Your appetite for older cinema reads {pct(data.era.oldTaste)}. The nudge applied to each decade right now:
        </p>
        <div className="mt-3 space-y-1.5">
          {data.era.decades.map((d) => (
            <Row key={d.label} label={d.label} right={signed(d.nudge)} tone={d.nudge >= 0 ? "up" : "down"} />
          ))}
        </div>
        {data.era.yourDecades.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Decades you filter for most: {data.era.yourDecades.map((d) => `${d.label} (${d.count})`).join(", ")}
          </p>
        )}
      </section>

      <section>
        <Head>Learned filtering habits</Head>
        {data.affinity.uses === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">You haven't used the filters yet, so no habits learned.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            <Row label="Filter sessions" right={String(data.affinity.uses)} />
            {data.affinity.genres.map((g) => (
              <Row key={g.label} label={`Genre — ${g.label}`} right={`${g.count}×`} />
            ))}
            {data.affinity.ratingMin !== null && (
              <Row label="Typical minimum rating" right={data.affinity.ratingMin.toFixed(1)} />
            )}
            {data.affinity.runtimeMax !== null && (
              <Row label="Typical maximum runtime" right={`${Math.round(data.affinity.runtimeMax)} min`} />
            )}
          </div>
        )}
      </section>

      <section>
        <Head>Your written rules</Head>
        <div className="mt-3 space-y-1.5">
          <Row label="Knowledge entries" right={String(data.knowledge.rules)} />
          <Row label="Treated as hard rules" right={String(data.knowledge.strict)} />
        </div>
        {data.knowledge.loves.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Boosts: {data.knowledge.loves.join(", ")}</p>
        )}
        {data.knowledge.avoids.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">Penalties: {data.knowledge.avoids.join(", ")}</p>
        )}
      </section>
    </div>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">{children}</p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="chamfer-sm hairline bg-background p-3">
      <p className="font-display text-2xl leading-none">{value}</p>
      <p className="mt-1 text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ label, right, tone }: { label: string; right: string; tone?: "up" | "down" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs capitalize text-foreground/85">{label}</span>
      <span
        className={`shrink-0 text-[0.7rem] tabular-nums ${
          tone === "up" ? "text-primary" : tone === "down" ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {right}
      </span>
    </div>
  );
}

function Bar({
  f,
  negative,
}: {
  f: { label: string; value: number; confidence: number; evidence: number; pull: number };
  negative?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-foreground/90">{f.label}</span>
        <span className="shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
          {f.value.toFixed(2)} × conf {f.confidence.toFixed(2)} = {signed(f.pull)} · {f.evidence} signals
        </span>
      </div>
      <div className="mt-1 h-1 w-full bg-surface">
        <div
          className={negative ? "h-1 bg-destructive" : "h-1 bg-primary"}
          style={{ width: `${Math.max(3, Math.min(100, Math.abs(f.pull) * 100))}%` }}
        />
      </div>
    </div>
  );
}
