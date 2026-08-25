CREATE TABLE public.user_knowledge (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  raw_text text NOT NULL,
  summary text NOT NULL,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_knowledge TO authenticated;
GRANT ALL ON public.user_knowledge TO service_role;
ALTER TABLE public.user_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own knowledge" ON public.user_knowledge FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX user_knowledge_user_idx ON public.user_knowledge (user_id, created_at DESC);