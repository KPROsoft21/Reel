import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useFeedback } from "@/hooks/use-app-data";
import { cn } from "@/lib/utils";

const REASONS = [
  "Too similar",
  "Too slow",
  "Too long",
  "Too serious",
  "Too depressing",
  "Too mainstream",
  "Too obscure",
  "Not enough character focus",
  "Wrong genre",
];

export function FeedbackDialog({ trigger, movieId = null }: { trigger: string; movieId?: number | null }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const feedback = useFeedback();

  const toggle = (r: string) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {trigger}
      </DialogTrigger>
      <DialogContent className="chamfer border-border bg-popover">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">What was off?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              onClick={() => toggle(r)}
              className={cn(
                "chamfer-sm hairline px-3 py-1.5 text-xs transition-colors",
                picked.includes(r) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Or say it in your own words…"
          className="chamfer hairline mt-2 w-full resize-none bg-surface p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          disabled={feedback.isPending || (!picked.length && !text.trim())}
          onClick={() =>
            feedback.mutate(
              { movieId, reasons: picked, text },
              {
                onSuccess: () => {
                  setOpen(false);
                  setPicked([]);
                  setText("");
                },
              },
            )
          }
          className="chamfer mt-2 h-11 bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {feedback.isPending ? "Learning…" : "Send feedback"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
