CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.user_movie_interactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  movie_id BIGINT NOT NULL,
  watched BOOLEAN NOT NULL DEFAULT false,
  liked BOOLEAN,
  rating NUMERIC,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  watched_at TIMESTAMPTZ,
  rated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT DEFAULT 'app',
  UNIQUE (user_id, movie_id)
);
CREATE INDEX idx_umi_user ON public.user_movie_interactions(user_id, movie_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_movie_interactions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.user_movie_interactions_id_seq TO authenticated;
GRANT ALL ON public.user_movie_interactions TO service_role;
ALTER TABLE public.user_movie_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own interactions" ON public.user_movie_interactions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.movie_interaction_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  movie_id BIGINT,
  event_type TEXT NOT NULL,
  event_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mie_user ON public.movie_interaction_events(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.movie_interaction_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.movie_interaction_events_id_seq TO authenticated;
GRANT ALL ON public.movie_interaction_events TO service_role;
ALTER TABLE public.movie_interaction_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own events" ON public.movie_interaction_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own events" ON public.movie_interaction_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_preferences (
  user_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  preference_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  importance DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  decay_class TEXT NOT NULL DEFAULT 'LONG_TERM',
  user_locked BOOLEAN NOT NULL DEFAULT false,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_key)
);
CREATE INDEX idx_prefs_user ON public.user_preferences(user_id, feature_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own preferences" ON public.user_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_preference_evidence (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  movie_id BIGINT,
  evidence_type TEXT NOT NULL,
  evidence_value DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_evidence_user ON public.user_preference_evidence(user_id, feature_key);
GRANT SELECT, INSERT ON public.user_preference_evidence TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.user_preference_evidence_id_seq TO authenticated;
GRANT ALL ON public.user_preference_evidence TO service_role;
ALTER TABLE public.user_preference_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own evidence" ON public.user_preference_evidence FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own evidence" ON public.user_preference_evidence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.watchlists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  movie_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'want_to_watch',
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  watched_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  UNIQUE (user_id, movie_id)
);
CREATE INDEX idx_watchlists_user ON public.watchlists(user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.watchlists_id_seq TO authenticated;
GRANT ALL ON public.watchlists TO service_role;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own watchlist" ON public.watchlists FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.searches (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  query_text TEXT NOT NULL,
  intent_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  temporary_intent BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_searches_user ON public.searches(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.searches TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.searches_id_seq TO authenticated;
GRANT ALL ON public.searches TO service_role;
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own searches" ON public.searches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own searches" ON public.searches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.recommendations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  movie_id BIGINT NOT NULL,
  search_id BIGINT REFERENCES public.searches(id) ON DELETE SET NULL,
  algorithm_version TEXT NOT NULL DEFAULT 'v1',
  model_version TEXT NOT NULL DEFAULT 'v1',
  score DOUBLE PRECISION NOT NULL,
  rank_position INTEGER NOT NULL,
  preference_score DOUBLE PRECISION,
  semantic_score DOUBLE PRECISION,
  theme_score DOUBLE PRECISION,
  novelty_score DOUBLE PRECISION,
  discovery_score DOUBLE PRECISION,
  context_score DOUBLE PRECISION,
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recs_user ON public.recommendations(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.recommendations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.recommendations_id_seq TO authenticated;
GRANT ALL ON public.recommendations TO service_role;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own recommendations" ON public.recommendations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own recommendations" ON public.recommendations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  movie_id BIGINT,
  recommendation_id BIGINT REFERENCES public.recommendations(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL DEFAULT 'freeform',
  raw_text TEXT,
  sentiment DOUBLE PRECISION,
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_model TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_user ON public.user_feedback(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.user_feedback TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.user_feedback_id_seq TO authenticated;
GRANT ALL ON public.user_feedback TO service_role;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own feedback" ON public.user_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own feedback" ON public.user_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);