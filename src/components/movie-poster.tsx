import type { Movie } from "@/data/catalog";
import { cn } from "@/lib/utils";

/**
 * Typographic poster: deterministic per-title composition so the grid stays
 * poster-centric without depending on external artwork.
 */
export function MoviePoster({ movie, className }: { movie: Movie; className?: string }) {
  const hue = (movie.id * 47) % 360;
  const dark = movie.features['dark_tone'] ?? 0.5;
  const style = {
    backgroundImage: `radial-gradient(120% 90% at 20% 0%, oklch(${0.42 - dark * 0.16} 0.11 ${hue}) 0%, oklch(0.16 0.03 ${(hue + 40) % 360}) 62%, oklch(0.12 0.02 70) 100%)`,
  };

  return (
    <div
      style={style}
      className={cn(
        "chamfer relative flex aspect-[2/3] w-full flex-col justify-between overflow-hidden p-4",
        className,
      )}
    >
      <div className="grain pointer-events-none absolute inset-0 opacity-60" />
      <span className="relative text-[0.65rem] uppercase tracking-[0.22em] text-foreground/60">
        {movie.genres[0]}
      </span>
      <div className="relative">
        <h3 className="font-display text-2xl leading-[1.05] text-foreground">{movie.title}</h3>
        <p className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-foreground/55">
          {movie.year} · {movie.runtime}m
        </p>
      </div>
    </div>
  );
}
