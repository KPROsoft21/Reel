CREATE TABLE public.user_filter_affinity (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  decade_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  genre_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  rating_min_avg NUMERIC,
  runtime_max_avg NUMERIC,
  uses INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_filter_affinity TO authenticated;
GRANT ALL ON public.user_filter_affinity TO service_role;
ALTER TABLE public.user_filter_affinity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own filter affinity" ON public.user_filter_affinity FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);