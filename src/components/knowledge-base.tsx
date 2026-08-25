import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";

import { CollapsibleSection } from "@/components/collapsible-section";
import { useAddKnowledge, useDeleteKnowledge, useKnowledge, useToggleKnowledge } from "@/hooks/use-knowledge";
import { FEATURE_LABELS } from "@/lib/recommender";
import type { KnowledgeEntry } from "@/lib/knowledge.functions";

const EXAMPLES = [
  "I love westerns and slow character studies",
  "No horror, ever",
  "Anything with Denzel Washington is a yes",
  "I'm tired of superhero movies",
];

function chips(entry: KnowledgeEntry): string[] {
  const s = entry.signals;
  return [
    ...s.genres_love.map((g) => `+ ${g}`),
    ...s.genres_avoid.map((g) => `− ${g}`),
    ...s.people_love.map((p) => `+ ${p}`),
    ...s.people_avoid.map((p) => `− ${p}`),
    ...Object.keys(s.positive).map((k) => `+ ${FEATURE_LABELS[k] ?? k}`),
    ...Object.keys(s.negative).map((k) => `− ${FEATURE_LABELS[k] ?? k}`),
    ...s.keywords_love.map((k) => `+ ${k}`),
    ...s.keywords_avoid.map((k) => `− ${k}`),
  ].slice(0, 6);
}

export function KnowledgeBase() {
  const { data: entries = [], isLoading } = useKnowledge();
  const add = useAddKnowledge();
  const toggle = useToggleKnowledge();
  const remove = useDeleteKnowledge();
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (value.length < 3 || add.isPending) return;
    add.mutate(value, { onSuccess: () => setText("") });
  };

  return (
    <section>
      <h2 className="font-display text-2xl">Knowledge base</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell the recommender anything about your taste in plain language. It summarises each note and applies it to every
        future pick.
      </p>

      <div className="chamfer hairline mt-5 bg-surface p-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
          maxLength={600}
          placeholder="e.g. I love westerns, hate jump scares, and anything with Tilda Swinton is a yes"
          className="chamfer-sm hairline w-full resize-none bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={submit}
            disabled={add.isPending || text.trim().length < 3}
            className="chamfer flex h-10 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <Sparkles className="size-4" />
            {add.isPending ? "Learning…" : "Teach the algorithm"}
          </button>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="chamfer-sm hairline px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your notes…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing taught yet — add your first note above.</p>
        ) : (
          entries.map((entry) => (
            <article
              key={entry.id}
              className={`chamfer hairline bg-surface p-4 transition-opacity ${entry.active ? "" : "opacity-50"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{entry.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">"{entry.raw_text}"</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => toggle.mutate({ id: entry.id, active: !entry.active })}
                    className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
                  >
                    {entry.active ? "On" : "Off"}
                  </button>
                  <button
                    aria-label="Delete note"
                    onClick={() => remove.mutate(entry.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              {chips(entry).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {chips(entry).map((chip) => (
                    <span key={chip} className="chamfer-sm hairline bg-background px-2 py-1 text-[0.7rem] text-foreground/80">
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
