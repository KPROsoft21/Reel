import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { RequireAuth } from "@/components/require-auth";
import { useProfileUpdate, useSnapshot, useTagCorrection } from "@/hooks/use-app-data";

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
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (data?.profile) {
      setName(data.profile.display_name ?? "");
      setBio(data.profile.bio ?? "");
    }
  }, [data?.profile]);

  const tags = data?.tags ?? [];
  const stats = {
    watched: (data?.interactions ?? []).filter((i) => i.watched).length,
    liked: (data?.interactions ?? []).filter((i) => i.liked === true).length,
    list: (data?.watchlist ?? []).filter((w) => w.status === "want_to_watch").length,
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
        <h2 className="font-display text-2xl">What we've learned</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Remove anything that doesn't sound like you — the recommender adjusts immediately.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {tags.length ? (
            tags.map((tag) => (
              <span
                key={tag.key}
                className="chamfer-sm hairline flex items-center gap-2 bg-surface px-3 py-2 text-xs text-foreground/85"
              >
                {tag.label}
                <button
                  aria-label={`Remove ${tag.label}`}
                  onClick={() => correct.mutate({ featureKey: tag.key, keep: false })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nothing yet — rate a few films and your taste model appears here.</p>
          )}
        </div>
      </section>

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
