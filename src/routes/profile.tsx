import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { CollapsibleSection } from "@/components/collapsible-section";
import { KnowledgeBase } from "@/components/knowledge-base";
import { RequireAuth } from "@/components/require-auth";

import { useProfileUpdate, useSnapshot, useTagCorrection } from "@/hooks/use-app-data";
import { FEATURE_LABELS } from "@/lib/recommender";
import { useTasteSummary } from "@/hooks/use-taste-summary";



export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your taste profile — Reel" },
      { name: "description", content: "See the taste signals Reel has learned about you, and correct anything it got wrong." },
      { property: "og:title", content: "Your taste profile — Reel" },
      { property: "og:description", content: "See what Reel learned about your taste — and correct it." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  ),
});

function Profile() {
  const { data } = useSnapshot();
  const update = useProfileUpdate();
  const correct = useTagCorrection();
  const summary = useTasteSummary();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (data?.profile) {
      setName(data.profile.display_name ?? "");
      setBio(data.profile.bio ?? "");
    }
  }, [data?.profile]);

  const prefs = data?.preferences ?? [];
  const loves = prefs
    .filter((p) => p.preference_value > 0.1 && p.confidence > 0.05)
    .sort((a, b) => b.preference_value * b.confidence - a.preference_value * a.confidence);
  const avoids = prefs
    .filter((p) => p.preference_value < -0.1 && p.confidence > 0.05)
    .sort((a, b) => a.preference_value * a.confidence - b.preference_value * b.confidence);
  const evidence = prefs.reduce((n, p) => n + p.evidence_count, 0);
  const stats = {
    watched: (data?.interactions ?? []).filter((i) => i.watched).length,
    liked: (data?.interactions ?? []).filter((i) => i.liked === true).length,
    list: (data?.watchlist ?? []).filter((w) => w.status === "want_to_watch").length,
  };

  const Row = ({ p, kind }: { p: (typeof prefs)[number]; kind: "love" | "avoid" }) => {
    const strength = Math.min(1, Math.abs(p.preference_value) * (0.4 + 0.6 * p.confidence));
    return (
      <div className="chamfer-sm hairline flex items-center gap-3 bg-surface px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-foreground/90">{FEATURE_LABELS[p.feature_key] ?? p.feature_key}</span>
            <span className="shrink-0 text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
              {Math.round(strength * 100)}% · {p.evidence_count} signal{p.evidence_count === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full bg-background">
            <div
              className={kind === "love" ? "h-1 bg-primary" : "h-1 bg-destructive"}
              style={{ width: `${Math.max(6, strength * 100)}%` }}
            />
          </div>
        </div>
        <button
          aria-label={`Remove ${FEATURE_LABELS[p.feature_key] ?? p.feature_key}`}
          onClick={() => correct.mutate({ featureKey: p.feature_key, keep: false })}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-8 font-display text-3xl">Your profile</h1>

      <div className="chamfer hairline mb-10 bg-surface p-6">
        <label className="text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="chamfer-sm hairline mt-2 h-11 w-full bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <label className="mt-5 block text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="chamfer-sm hairline mt-2 w-full resize-none bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={() => update.mutate({ displayName: name, bio })}
          disabled={update.isPending}
          className="chamfer mt-5 h-11 bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          Save
        </button>
      </div>

      <section className="mb-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl">How the algorithm reads you</h2>
          <button
            onClick={() => summary.refetch()}
            disabled={summary.isFetching}
            className="chamfer-sm hairline px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {summary.isFetching ? "Thinking…" : "Refresh"}
          </button>
        </div>
        <div className="chamfer hairline mt-4 bg-surface p-6">
          {summary.isLoading ? (
            <p className="text-sm text-muted-foreground">Reading your taste model…</p>
          ) : summary.data ? (
            <>
              <p className="font-display text-xl text-primary">{summary.data.headline}</p>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">{summary.data.summary}</p>
              {summary.data.reasons.length > 0 && (
                <div className="mt-5 space-y-3">
                  <p className="text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">Why it thinks so</p>
                  {summary.data.reasons.map((r) => (
                    <div key={r.title} className="chamfer-sm hairline bg-background p-3">
                      <p className="text-sm font-medium text-foreground">{r.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.detail}</p>
                    </div>
                  ))}
                </div>
              )}
              {summary.data.blindspot && (
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                  <span className="uppercase tracking-[0.2em]">Still unsure — </span>
                  {summary.data.blindspot}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Couldn't generate a summary right now.</p>
          )}
        </div>
      </section>

      <CollapsibleSection
        title="What we've learned"
        description={`Live from your taste model — ${prefs.length} feature${prefs.length === 1 ? "" : "s"} learned from ${evidence} signal${evidence === 1 ? "" : "s"}. Remove anything that doesn't sound like you; the recommender adjusts immediately.`}
      >
        {loves.length === 0 && avoids.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet — rate a few films and your taste model appears here.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">Drawn to</p>
              <div className="space-y-2">
                {loves.length ? (
                  loves.map((p) => <Row key={p.feature_key} p={p} kind="love" />)
                ) : (
                  <p className="text-sm text-muted-foreground">No positive signals yet.</p>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[0.6rem] uppercase tracking-[0.25em] text-muted-foreground">Steering away from</p>
              <div className="space-y-2">
                {avoids.length ? (
                  avoids.map((p) => <Row key={p.feature_key} p={p} kind="avoid" />)
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing ruled out yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>


      <div className="mb-10">
        <KnowledgeBase />
      </div>



      <section className="grid grid-cols-3 gap-3">
        {[
          ["Watched", stats.watched],
          ["Liked", stats.liked],
          ["Saved", stats.list],
        ].map(([label, value]) => (
          <div key={label as string} className="chamfer hairline bg-surface p-5">
            <p className="font-display text-3xl text-primary">{value}</p>
            <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
