<div align="center">
  <img src="src/assets/reel-logo.png" alt="Reel logo" width="150" />
  <h1>Reel</h1>
  <p><strong>An explainable, taste-learning movie recommender built with TanStack Start, Supabase, TMDB, and AI-assisted intent parsing.</strong></p>
  <p>
    <a href="#product-overview">Overview</a> |
    <a href="#features">Features</a> |
    <a href="https://reel-xi-eight.vercel.app/">Site</a>|
    <a href="#recommendation-engine">Algorithm</a> |
    <a href="#development">Development</a> |
    <a href="#deployment">Deployment</a>
  </p>
</div>

---

## Product Overview

Reel is a full-stack film discovery app that learns what a viewer actually likes. Users can describe a mood, search for a title or film-world entity, swipe through one movie at a time, save titles to a watchlist, mark films as watched, and build a personal taste profile through explicit feedback.

The app combines a curated, recommender-ready catalog with live TMDB hydration so the experience is not limited to bundled data. Its ranking system is deterministic and explainable: AI helps translate language into structured signals, while `src/lib/recommender.ts` owns the scoring, learning, exclusions, diversification, and fit-percentage math.

## Features

| Area | What it does |
| --- | --- |
| Home feed | Accepts natural-language prompts, filters, and search context, then returns ranked movie cards with fit scores and explanations. |
| Search | Handles direct title matches, remote TMDB title lookup, and entity-based discovery for actors, directors, franchises, studios, keywords, and ambiguous queries. |
| Movie detail | Shows synopsis, metadata, poster art, user actions, score breakdowns, and similar recommendations anchored to the selected film. |
| Swipe mode | Provides a focused, one-card-at-a-time recommendation flow with like, save, pass, and watched actions. |
| My List | Stores films the viewer wants to watch and separates them from future recommendations. |
| Favorites | Tracks liked films and uses them as strong evidence for the taste model. |
| Watched | Keeps viewing history visible while preventing repeat recommendations. |
| Profile | Displays account details, AI-generated taste summaries, learned taste tags, numeric algorithm insights, and a personal knowledge base. |
| Knowledge base | Lets users write durable preference notes, which are parsed into structured genre, person, keyword, and feature rules. |
| Explainability | Surfaces the weighted signals behind a recommendation instead of hiding the score behind a black box. |

## Recommendation Engine

Reel uses a hybrid content-based ranking engine. It blends user history, explicit feedback, temporary search intent, written taste rules, filters, popularity, rating, novelty, and exploration into one calibrated ranking.

The algorithm is intentionally not "just genre matching." Each movie is represented as a normalized feature vector, and each viewer accumulates a learned preference model over time.

### Movie Representation

Every movie starts with 15 core semantic dimensions:

| Core feature | Meaning |
| --- | --- |
| `character_driven` | Character focus and interpersonal storytelling |
| `atmosphere` | Mood, texture, and immersive tone |
| `philosophical` | Thematic or conceptual depth |
| `humor` | Comic energy |
| `tension` | Suspense, danger, and pressure |
| `romance` | Romantic focus |
| `visual_style` | Visual ambition and cinematic style |
| `slow_burn` | Deliberate pacing |
| `complexity` | Narrative or conceptual intricacy |
| `emotional_intensity` | Strength of emotional experience |
| `realism` | Groundedness |
| `violence` | Action or violent intensity |
| `world_building` | Scope, lore, and setting depth |
| `dark_tone` | Bleakness, menace, or cynicism |
| `optimism` | Warmth, hope, and uplift |

The app then derives an extended semantic layer in `src/lib/extended-features.ts`. That layer adds more than 100 deterministic metrics across pacing, structure, subject matter, mood, craft, character perspective, emotional payoff, era, audience, scale, and reception. Examples include `structure_heist`, `subject_space`, `tone_unsettling`, `craft_cinematography`, `emo_comfort`, `era_modern`, and `origin_international`.

Together, the core and extended vectors let Reel compare movies by feel, structure, subject, and taste fit, not only by genre labels.

### Taste Learning

User taste is stored as feature-level preferences in Supabase. Each learned preference tracks:

| Field | Purpose |
| --- | --- |
| `feature_key` | The semantic feature being learned |
| `preference_value` | Direction and strength, from dislike to like |
| `confidence` | How much evidence supports the preference |
| `importance` | How strongly the feature should affect ranking |
| `evidence_count` | Number of signals that have shaped the value |

The recommender updates only the most expressive features from each movie, capped at 30 features per evidence event. This keeps learning focused and avoids diluting the profile with neutral traits.

Evidence weights are defined in `EVIDENCE_WEIGHT`:

| Evidence type | Weight |
| --- | ---: |
| Explicit correction | `1.00` |
| Explicit feedback | `0.90` |
| Liked movie | `0.75` |
| Disliked movie | `0.75` |
| Watched | `0.40` |
| Added to list | `0.35` |
| Opened | `0.12` |
| Not interested | `0.08` |
| Shown | `0.03` |

The model uses a diminishing learning rate so early interactions teach quickly while mature profiles become more stable.

```ts
learningRate = 0.35 / sqrt(evidence_count)
preference_value += learningRate * evidence_weight * feature_signal
confidence += abs(evidence_weight) * 0.12 * abs(feature_signal)
importance = 0.4 + evidence_count * 0.04 + abs(preference_value) * 0.3
```

### Ranking Signals

For each candidate, `rankMovies` computes a set of weighted score lines:

| Signal | Role |
| --- | --- |
| Taste model match | Measures alignment between the viewer's learned preferences and the movie's semantic vector. |
| Similarity to liked films | Uses cosine similarity against the viewer's liked movies. |
| Theme overlap | Rewards features the viewer repeatedly responds to positively. |
| Request match | Scores fit against the current prompt, title anchor, similar-film request, or selected entity. |
| Written rules | Applies durable knowledge-base preferences, including strict avoids. |
| Critical standing | Adds a small normalized rating signal. |
| Novelty | Rewards less obvious candidates so the feed does not become purely popularity-driven. |
| Learning value | Favors movies that can clarify uncertain parts of the taste profile. |
| Broad appeal | Adds a small popularity signal. |
| Exploration shuffle | Adds deterministic variety based on seed and movie id. |

Searches and normal feeds use different weights. When the viewer asks for something specific, request match dominates. When there is no active query, long-term taste, knowledge rules, semantic similarity, discovery, and controlled exploration matter more.

### Filters And Affinity

User-selected filters are hard constraints:

- Release year range
- Minimum rating
- Maximum runtime
- Genre inclusion

Reel also learns filter affinity. If a viewer repeatedly filters for a decade, genre, rating floor, or runtime ceiling, future unfiltered feeds receive a small soft nudge in that direction. This is intentionally a bonus, not a hidden exclusion.

### Exclusions

The feed removes films the viewer has already clearly handled:

- Liked
- Disliked
- Watched
- Saved to the watchlist
- Explicitly excluded by the current request
- The anchor movie currently being viewed

The `not_interested` action is different. It applies a large decaying penalty instead of a permanent ban. The default penalty fades over roughly 120 days and grows when the same title is dismissed repeatedly.

### Diversification

After scoring, Reel applies a lightweight diversification pass. The first pass limits repeated primary genres and directors so the page does not become nine variations of the same recommendation. If the strict pass cannot fill the requested limit, a second pass backfills from the remaining ranked candidates.

### Fit Percentage

The displayed fit percentage is calibrated from the blended score rather than copied from any one component.

```ts
quality = clamp01((score - jitterContribution) / (weightBudget * 0.82))
fit = round(28 + 66 * pow(quality, 0.85))
```

Direct title matches can reach `99%`, but ordinary recommendations are designed to live in a meaningful range instead of clustering at 100%.

## Algorithm Review

The current algorithm is a strong pragmatic fit for this product. It is explainable, fast, and tunable without retraining a model. The separation between AI parsing and deterministic ranking is especially valuable: the app can use natural language while still showing users why a movie ranked where it did.

**Strengths**

- The feature-vector design captures tone, pacing, structure, and emotional shape better than genre-only recommendation.
- Evidence weights make user actions semantically different: a like, save, opened detail page, and not-interested tap do not all mean the same thing.
- Knowledge-base rules give users direct control over persistent taste constraints.
- Decaying not-interested penalties avoid both bad repetition and overly permanent suppression.
- Filter affinity learns from browsing behavior without quietly turning preferences into hard rules.
- Score breakdowns make the recommender auditable in the UI.

**Tradeoffs**

- Hand-authored and deterministic feature derivation is transparent, but it depends on metadata quality and lexicon coverage.
- The house era bias toward modern, mainstream films is product-driven. It improves casual discovery but can under-rank older or international cinema until the viewer shows clear interest.
- The recommender is primarily content-based. It does not yet use collaborative filtering across similar users.
- AI-parsed prompts and knowledge notes improve expressiveness, but their outputs should remain bounded by schemas and visible user controls.

**Future improvements**

- Add offline evaluation fixtures with known user profiles and expected ranking behavior.
- Track precision metrics such as save rate, like rate, and not-interested rate by recommendation source.
- Add per-user calibration for era and popularity bias instead of using one global house lean.
- Add collaborative signals once there is enough interaction volume to avoid noisy crowd behavior.
- Add admin tooling for inspecting feature vectors and correcting catalog-level metadata.

## Architecture

```txt
src/
  assets/
    reel-logo.png              # Project logo used by the app and README
  components/
    algorithm-info.tsx         # User-facing explanation of model behavior
    movie-card.tsx             # Recommendation card UI
    movie-grid.tsx             # Feed/grid rendering
    score-breakdown.tsx        # Explains weighted ranking signals
    filter-bar.tsx             # User-facing filter controls
    ui/                        # shadcn/ui primitives
  data/
    catalog.ts                 # Curated TMDB-derived movie catalog and core feature vectors
  hooks/
    use-app-data.ts            # Snapshot, recommendation, and action data hooks
    use-insight.ts             # Algorithm insight hook
    use-knowledge.ts           # Knowledge-base hook
    use-session.ts             # Auth/session hook
    use-taste-summary.ts       # Taste summary hook
  integrations/
    lovable/                   # Lovable integration
    supabase/                  # Supabase clients, auth middleware, generated types
  lib/
    app.functions.ts           # Main server functions for recommendations and actions
    recommender.ts             # Ranking, learning, scoring, explanations, diversification
    extended-features.ts       # 100+ deterministic semantic metrics
    filters.ts                 # Filter schema and affinity learning
    tmdb.server.ts             # Live TMDB search and movie hydration
    intent.server.ts           # AI intent and feedback parsing
    knowledge.server.ts        # AI knowledge note parsing
    taste-summary.server.ts    # AI-generated taste profile narrative
    insight.server.ts          # Numeric algorithm insight builder
    movie-registry.ts          # Runtime registry for live TMDB movies
  routes/
    __root.tsx                 # Root layout and app shell
    index.tsx                  # Home feed
    auth.tsx                   # Authentication
    movie.$movieId.tsx         # Movie detail
    swipe.tsx                  # Swipe experience
    my-list.tsx                # Watchlist
    favorites.tsx              # Liked films
    watched.tsx                # Watched films
    profile.tsx                # Profile, taste model, knowledge base
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Home recommendations, natural-language search, filters, and disambiguation |
| `/auth` | Email/password and Google authentication |
| `/movie/$movieId` | Detail page, actions, score breakdown, and similar movies |
| `/swipe` | Swipe-based discovery |
| `/my-list` | Saved watchlist |
| `/favorites` | Liked films |
| `/watched` | Viewing history |
| `/profile` | Profile settings, taste summary, learned traits, algorithm insight, and knowledge base |

## Data Model

The application relies on Supabase tables for user state and recommendation telemetry:

| Table | Stores |
| --- | --- |
| `profiles` | Display name, bio, avatar, and account-level profile data |
| `user_movie_interactions` | Watched state, likes/dislikes, ratings, not-interested timestamps |
| `watchlists` | Saved, watched, removed, and want-to-watch list state |
| `user_preferences` | Learned feature preferences used by the ranking engine |
| `user_preference_evidence` | Evidence trail behind preference updates |
| `user_knowledge` | User-authored preference notes and parsed structured signals |
| `user_filter_affinity` | Learned soft preferences from repeated filter usage |
| `searches` | Query history and parsed temporary intent |
| `recommendations` | Recommendation impressions, scores, ranks, and explanations |
| `movie_interaction_events` | Event stream for shown/opened/action telemetry |
| `user_feedback` | Structured and free-form recommendation feedback |

## Tech Stack

| Layer | Technology |
| --- | --- |
| App framework | TanStack Start, React 19, TanStack Router, Vite |
| UI | Tailwind CSS v4, shadcn/ui, Radix UI, Lucide React, Sonner |
| Data fetching | TanStack Query and server functions |
| Backend | Supabase via Lovable Cloud |
| Auth | Supabase auth with Lovable Cloud auth helpers |
| Movie data | Curated TMDB-derived catalog plus live TMDB search/hydration |
| AI | Lovable AI Gateway through the AI SDK |
| Validation | Zod |
| Charts | Recharts |
| Tooling | TypeScript, ESLint, Prettier |

## Environment Variables

The app expects the following environment variables. Supabase values are commonly managed by Lovable Cloud, while TMDB and AI keys should be stored as server-side secrets.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client | Supabase project URL for browser code |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client | Supabase publishable key for browser code |
| `VITE_SUPABASE_PROJECT_ID` | Client | Supabase project id |
| `SUPABASE_URL` | Server | Supabase project URL for server functions |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Publishable key for authenticated server requests |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service role key for privileged server operations |
| `TMDB_API_KEY` | Server | TMDB API key or read-access token |
| `LOVABLE_API_KEY` | Server | Lovable AI Gateway key |
| `LOVABLE_CRON_SECRET` | Server | Optional cron authentication secret |
| `LOVABLE_CRON_SECRET_PREVIOUS` | Server | Optional rotated cron secret |

Do not commit server secrets. `TMDB_API_KEY`, `LOVABLE_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to browser code.

## Development

Install dependencies and start the Vite development server:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

```txt
http://localhost:8080
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run build:dev` | Create a development-mode build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm run format` | Format files with Prettier |

## Deployment

Reel is configured for Lovable Cloud and Supabase-backed deployment.

1. Set the required Supabase, TMDB, and Lovable AI secrets.
2. Run `npm run build` locally before publishing.
3. Publish from Lovable or push to the connected repository branch.

This repository is connected to Lovable. Avoid force pushes, rebases, amend commits, or squash operations on published history because those actions can break Lovable's project history.

## Key Implementation Files

| File | Why it matters |
| --- | --- |
| `src/lib/recommender.ts` | Core recommendation scoring, learning, explanations, penalties, and diversification |
| `src/lib/app.functions.ts` | Server-side recommendation, action recording, feedback, and profile workflows |
| `src/lib/extended-features.ts` | Deterministic semantic expansion from 15 core features to a richer movie vector |
| `src/lib/filters.ts` | Hard filter matching and learned filter affinity |
| `src/lib/tmdb.server.ts` | Remote movie search, entity discovery, and live movie hydration |
| `src/lib/intent.server.ts` | AI-backed prompt and feedback parsing |
| `src/lib/knowledge.server.ts` | AI-backed knowledge-base signal extraction |
| `src/components/score-breakdown.tsx` | UI for explaining why a recommendation received its score |
| `src/routes/profile.tsx` | User-facing taste profile, insight, and knowledge-base management |

## References

- [TanStack Start](https://tanstack.com/start)
- [Supabase](https://supabase.com/docs)
- [TMDB API](https://developer.themoviedb.org/reference)
- [Lovable](https://lovable.dev)
