import type { Movie } from "@/data/catalog";
import { usePoster } from "@/hooks/use-posters";
import { cn } from "@/lib/utils";

/**
 * Poster: real TMDB artwork when available, with a deterministic typographic
 * composition as the fallback so the grid never shows an empty tile.
 */
export function MoviePoster({ movie, className }: { movie: Movie; className?: string }) {
  const art = usePoster(movie.id);
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
      {art?.poster ? (
        <>
          <img
            src={art.poster}
            alt={`${movie.title} poster`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-transparent" />
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
