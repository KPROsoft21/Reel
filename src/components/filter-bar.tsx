import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import {
  DECADES,
  EMPTY_FILTERS,
  GENRE_OPTIONS,
  RATING_OPTIONS,
  RUNTIME_OPTIONS,
  hasActiveFilters,
  type MovieFilters,
} from "@/lib/filters";
import { cn } from "@/lib/utils";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "chamfer-sm hairline px-3 py-1.5 text-xs transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function FilterBar({
  value,
  onChange,
}: {
  value: MovieFilters;
  onChange: (next: MovieFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = hasActiveFilters(value);

  const setDecade = (min: number, max: number) => {
    const on = value.yearMin === min && value.yearMax === max;
    onChange({ ...value, yearMin: on ? null : min, yearMax: on ? null : max });
  };

  const toggleGenre = (g: string) =>
    onChange({
      ...value,
      genres: value.genres.includes(g) ? value.genres.filter((x) => x !== g) : [...value.genres, g],
    });

  return (
    <div className="mx-auto mt-4 max-w-2xl">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters{active ? " · on" : ""}
        </button>
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3" /> Clear
          </button>
        )}
      </div>

      {open && (
        <div className="chamfer hairline mt-4 space-y-4 bg-surface p-5 text-left">
          <div>
            <p className="mb-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Era</p>
            <div className="flex flex-wrap gap-2">
              {DECADES.map((d) => (
                <Chip
                  key={d.label}
                  active={value.yearMin === d.yearMin && value.yearMax === d.yearMax}
                  onClick={() => setDecade(d.yearMin, d.yearMax)}
                >
                  {d.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Minimum rating</p>
            <div className="flex flex-wrap gap-2">
              {RATING_OPTIONS.map((r) => (
                <Chip
                  key={r}
                  active={value.ratingMin === r}
                  onClick={() => onChange({ ...value, ratingMin: value.ratingMin === r ? null : r })}
                >
                  {r}+
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Max runtime</p>
            <div className="flex flex-wrap gap-2">
              {RUNTIME_OPTIONS.map((m) => (
                <Chip
                  key={m}
                  active={value.runtimeMax === m}
                  onClick={() => onChange({ ...value, runtimeMax: value.runtimeMax === m ? null : m })}
                >
                  Under {Math.floor(m / 60)}h{m % 60 ? ` ${m % 60}m` : ""}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Genres</p>
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map((g) => (
                <Chip key={g} active={value.genres.includes(g)} onClick={() => toggleGenre(g)}>
                  {g}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
