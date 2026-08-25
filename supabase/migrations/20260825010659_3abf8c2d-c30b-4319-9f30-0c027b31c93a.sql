ALTER TABLE public.user_movie_interactions
  ADD COLUMN IF NOT EXISTS not_interested_at timestamptz,
  ADD COLUMN IF NOT EXISTS not_interested_count integer NOT NULL DEFAULT 0;