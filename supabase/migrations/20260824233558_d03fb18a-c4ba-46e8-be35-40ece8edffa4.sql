CREATE TABLE public.movie_posters (
  movie_id integer PRIMARY KEY,
  title text NOT NULL,
  poster_url text,
  backdrop_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.movie_posters TO anon;
GRANT SELECT ON public.movie_posters TO authenticated;
GRANT ALL ON public.movie_posters TO service_role;
ALTER TABLE public.movie_posters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Posters are viewable by everyone" ON public.movie_posters FOR SELECT TO anon, authenticated USING (true);