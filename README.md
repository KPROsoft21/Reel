<div align="center">
  <img src="src/assets/reel-logo.png" alt="Reel logo" width="160" />
</div>

<div align="center">
# Reel
</div>
> A personalized film recommender. Ask for what you're in the mood for, swipe through picks, or dive into a single film — every like, save, watch and skip feeds a taste model that gets sharper the more you use it.

## What it does

Reel is a full-stack recommendation app for movies. It combines a curated catalog of ~1,000 popular films with live data from TMDB, so virtually any film is reachable. The recommender blends your explicit feedback with AI-parsed mood queries, natural-language taste rules, and filtering habits to produce a ranked feed with explainable fit scores.

Key user flows:

- **Home** — describe a mood in plain language, apply filters, and get nine ranked picks. Each card shows a fit % and a short reason. Remove a card and it is instantly replaced.
- **Search / disambiguation** — searching a person, franchise, studio, or ambiguous term (e.g. “marvel”) surfaces “Did you mean…” chips instead of guessing.
- **Movie detail** — view synopsis, metadata, action buttons, a “Why this pick” score breakdown, and a “More like this” feed anchored to that film.
- **Swipe** — a one-at-a-time Tinder-style picker. Swipe left to pass, right to save, up (or the heart button) to like. Buttons sit under the title inside the card.
- **My List / Favorites / Watched** — saved lists built from your interactions.
- **Profile** — edit your display name and bio, read an AI-generated taste summary, inspect live learned traits, explore the algorithm’s numeric read of you, and manage a personal knowledge base.

## Algorithm overview

Reel’s recommender is a hybrid, explainable scoring engine. It does not rank movies by popularity or by a single tag. Instead, every candidate gets a fit score built from dozens of signals: your explicit feedback, the words you typed, the filters you use, the movies you have already engaged with, and the semantic shape of each film.

### 1. Feature space — how a movie is represented

Every movie is converted into a numeric feature vector so the algorithm can compare films and compare them to your taste.

#### Core features (15 dimensions)

Each film receives a score from 0 to 1 on:

1. Character-driven
2. Atmosphere / mood
3. Philosophical / thematic depth
4. Humor
5. Tension / suspense
6. Romance
7. Visual style
8. Slow burn
9. Complexity
10. Emotional intensity
11. Realism
12. Violence / action intensity
13. World-building
14. Dark tone
15. Optimism

These are derived from a combination of the curated catalog, TMDB genres and keywords, and the film’s overview text. They form the primary language the taste model speaks.

#### Extended metric layer (100+ dimensions)

On top of the core 15, the engine derives more than 100 additional metrics from runtime, release year, genres, cast/crew, overview sentiment, and inferred pacing. Examples include:

- Pacing: fast-paced, deliberate, episodic, tightly plotted
- Structure: twist-heavy, franchise film, ensemble cast, single-location
- Subject matter: based on true events, crime, family, sci-fi concepts
- Tone: gritty, whimsical, melancholic, uplifting
- Craft: blockbuster scale, indie sensibility, high rewatchability
- Era & audience: classic Hollywood, 2000s studio film, modern streaming

The extended layer is used for similarity calculations and for fine-grained learning, but it does not overwhelm the core taste model. Core features drive the headline preference; extended features refine the match.

### 2. Taste model — how the algorithm learns you

Your taste is stored in `user_preferences` as a set of learned feature records. Each record contains:

- `feature` — the dimension name (e.g. “humor”, “dark tone”)
- `preference` — a value from -1 (strongly dislike) to +1 (strongly like)
- `confidence` — how sure the model is about that preference (0 to 1)
- `importance` — how much that feature should influence ranking (0 to 1)
- `evidence_count` — how many interactions support the learned value
- `positive_evidence` / `negative_evidence` — counts of likes vs passes/dislikes

#### Where evidence comes from

Every interaction updates the model:

| Action | Signal sent |
|--------|-------------|
| Like | Strong positive for the film’s features; also marks the film as watched |
| Save / add to list | Moderate positive; the film is treated as a future watch |
| Watched | Mild positive for features; used to avoid re-recommending |
| Dislike | Strong negative for the film’s features |
| Pass / X / Not interested | Mild-to-moderate negative; the film is buried for ~4 months with a decaying penalty |
| Knowledge-base note | Parsed by AI into structured signals and merged into the taste model |

#### Learning math

When an interaction arrives, the engine:

1. Looks up the movie’s feature vector.
2. Computes a signed weight for the action (like = +1.0, dislike = -1.0, save = +0.5, watched = +0.3, pass = -0.4, etc.).
3. Updates each feature with a weighted moving average:
   - `new_preference = (old_preference * old_evidence + feature_value * action_weight) / total_evidence`
   - `confidence` grows as evidence accumulates but is capped.
   - `importance` rises when a feature repeatedly distinguishes likes from passes.
4. Stores the updated row so future recommendations use it immediately.

This means the algorithm does not just count genres. If you like three dark, slow-burn thrillers and pass on a dark comedy, it learns that “dark tone” is good but “humor” may not be the reason.

### 3. Scoring a recommendation

For every candidate movie, the engine computes a final fit score from several blended components.

#### Base preference match

The candidate’s core feature vector is compared against your taste model:

```
preference_score = Σ (user_preference[i] * candidate_value[i] * importance[i] * confidence[i])
```

Features where you have strong, confident preferences contribute more. If your model is still empty, this term is neutral and the engine relies more on discovery and query signals.

#### Semantic similarity

If the request has an anchor — a search result, a selected film, a person, a franchise, or a studio — the candidate is compared to that anchor using cosine similarity over the extended feature vector. This powers “More like this” and entity searches.

```
similarity_score = cosine(candidate_vector, anchor_vector)
```

#### Intent alignment

When you type a mood query (“something tense and atmospheric”), the AI parses it into a structured intent with boosted features and optional filters. The candidate gets extra points for matching those requested features.

```
intent_score = Σ (intent_boost[i] * candidate_value[i])
```

#### Filter affinity

Filters (release decade, genre, minimum rating, runtime, certification) are applied in two ways:

- **Hard filters**: if a candidate fails a filter you explicitly set, it is excluded.
- **Soft affinity**: the algorithm tracks which decades, genres, and runtime ranges you tend to engage with and quietly nudges matching candidates upward.

Filter affinity is learned from your behavior, not just your explicit choices.

#### Era bias

The app is intentionally biased toward films from the 2000s through the 2020s and toward Hollywood studio productions, unless your history clearly shows a love for older or non-Hollywood cinema. The engine detects an `oldSchoolTaste` signal from your likes and saves; if it is absent, recent releases receive a small but persistent boost.

#### Discovery / novelty nudge

To prevent the feed from collapsing into one narrow type, a small random jitter and a novelty bonus are added. This ensures variety without overriding your clear preferences.

#### Not-interested penalty

Pressing X on a card records a “not interested” interaction. The film receives a large, decaying penalty that drops over roughly 120 days. It is not treated as a dislike — the algorithm understands it as “the user did not show interest right now” — so the penalty fades and the film can reappear later if other signals strongly support it.

#### Final score

```
raw_score = w_pref * preference_score
        + w_sim * similarity_score
        + w_intent * intent_score
        + w_filter * filter_affinity
        + w_era * era_bias
        + w_discovery * discovery_nudge
        - w_not_interested * decaying_penalty

fit_percent = clamp( normalize(raw_score), 30%, 95% )
```

The normalization is calibrated so that 100% is rare. Most recommendations fall between 60% and 92%, giving the score meaning and room to improve as the model learns.

### 4. Exclusions — what never gets recommended

A candidate is removed from the feed if any of the following are true:

- You liked it
- You disliked it
- You saved it
- You marked it as watched
- You passed on it and the decaying penalty is still strong
- It is the currently viewed movie (on the detail page)

This keeps the feed fresh and respects your explicit decisions.

### 5. Search and disambiguation

The search bar is not a simple title lookup.

1. **Title match**: if your query closely matches a film title, that film is boosted to the top with a 100% fit score and treated as an anchor.
2. **Entity resolution**: the query is also sent to TMDB to find people (actors, directors), franchises, studios, and collections.
3. **Disambiguation**: if the query is ambiguous (e.g. “marvel”), the UI shows ranked “Did you mean…” chips — person, studio, franchise — instead of guessing.
4. **Result blending**: once an entity is selected, the engine fetches up to 80 related films, scores them with the full recommender, and blends them with title matches and personalized picks.

### 6. Explainability — why this pick?

Every recommendation can produce a `ScoreBreakdown` that lists:

- Which features helped the score (e.g. “matches your preference for dark tone”)
- Which features hurt it (e.g. “lower than your usual optimism score”)
- The intent match contribution
- The similarity contribution if anchored to another film
- The filter and era adjustments
- The not-interested penalty if present

This breakdown is shown on movie cards, in the detail page, and in the profile’s “Info” section.

### 7. AI’s role in the algorithm

AI is used for understanding language, not for replacing the scoring math. There are three AI-powered parsers:

1. **Intent parser** (`src/lib/intent.server.ts`) — turns mood queries into structured feature boosts and filter hints.
2. **Knowledge-base parser** (`src/lib/knowledge.server.ts`) — turns free-form notes like “I love Christopher Nolan but I’m tired of superhero movies” into structured taste signals.
3. **Taste narrative generator** (`src/lib/taste-summary.server.ts`) — reads your learned preferences and produces a human-readable summary of what the algorithm thinks about your taste and why.

The actual ranking, learning, and scoring are deterministic and run in `src/lib/recommender.ts`.

## Tech stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19 + Vite 7, file-based routing, SSR/SSG, server functions)
- **Styling:** Tailwind CSS v4 with shadcn/ui components and custom “Reel” dark theme tokens
- **State / data:** TanStack Query, React hooks
- **Backend / auth:** Lovable Cloud (Supabase) — profiles, interactions, watchlists, preferences, searches, recommendations, knowledge, filter affinity
- **External data:** TMDB API for posters, metadata, cast/crew, and live film hydration
- **AI:** Lovable AI Gateway via the AI SDK (`@ai-sdk/openai-compatible`)
- **Icons:** Lucide React
- **Notifications:** Sonner

## Project structure

```
src/
  components/           # UI components (movie cards, grids, filters, score breakdown, etc.)
  components/ui/        # shadcn/ui primitives
  data/catalog.ts       # ~1,000 curated films with 15 core feature vectors
  hooks/                # Data hooks wrapping server functions and snapshot state
  integrations/         # Lovable Cloud / Supabase clients and auth middleware
  lib/                  # Core logic
    recommender.ts      # Ranking, scoring, evidence, taste model math
    extended-features.ts# 100+ derived semantic metrics
    app.functions.ts    # Main server functions (snapshot, recommendations, actions)
    filters.ts          # Filter schema, matching, and affinity learning
    tmdb.server.ts      # Live TMDB fetching and on-the-fly feature derivation
    intent.server.ts    # AI mood-query parser
    knowledge.server.ts # AI knowledge-base summarizer
    taste-summary.server.ts # AI taste narrative generator
    insight.server.ts   # Numeric algorithm insight builder
    movie-registry.ts   # In-memory registry for live-loaded TMDB films
  routes/               # TanStack file routes
    __root.tsx          # Root layout with app shell
    index.tsx           # Home feed
    auth.tsx            # Sign in / sign up
    movie.$movieId.tsx  # Film detail page
    swipe.tsx           # One-at-a-time swipe picker
    my-list.tsx         # Saved watchlist
    favorites.tsx       # Liked films
    watched.tsx         # Watched films
    profile.tsx         # Taste profile and settings
```

## Routes

| Route | Description |
|-------|-------------|
| `/` | Home recommendations with search, filters, and disambiguation |
| `/auth` | Email/password and Google sign-in |
| `/movie/$movieId` | Film detail, actions, score breakdown, similar films |
| `/swipe` | One-card-at-a-time swipe interface |
| `/my-list` | Films saved to your watchlist |
| `/favorites` | Films you liked |
| `/watched` | Films marked as watched |
| `/profile` | Taste summary, learned traits, algorithm info, knowledge base |

## Key files

- `src/lib/recommender.ts` — the scoring and learning engine
- `src/lib/app.functions.ts` — server functions for recommendations and user actions
- `src/lib/filters.ts` — filter constraints and affinity learning
- `src/lib/tmdb.server.ts` — live TMDB integration
- `src/lib/intent.server.ts`, `knowledge.server.ts`, `taste-summary.server.ts` — AI-backed parsers
- `src/routes/index.tsx` — home UI and disambiguation flow
- `src/routes/profile.tsx` — taste profile UI
- `src/routes/swipe.tsx` — swipe UI
- `src/hooks/use-app-data.ts` — optimistic action mutations and snapshot hook

## Environment variables

The app expects these variables. On Lovable Cloud, Supabase values are generated automatically; TMDB and Lovable AI keys are managed as secrets.

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (client) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (client) |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID (client) |
| `TMDB_API_KEY` | TMDB API key or read-access token (server only) |
| `LOVABLE_API_KEY` | Lovable AI Gateway key (server only) |

Never expose `TMDB_API_KEY` or `LOVABLE_API_KEY` to the browser or commit them.

## Development

Prefer working locally? You need Node.js and a package manager — the project uses `npm`/`bun`.

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Open `http://localhost:8080`.

## Scripts

```sh
npm run dev        # Start the Vite dev server
npm run build      # Production build
npm run build:dev  # Development build
npm run preview    # Preview the production build
npm run lint       # ESLint
npm run format     # Prettier
```

## Deployment

The app is configured for Lovable Cloud / Supabase and deploys through Lovable. To publish:

1. Make sure all required secrets are set in Lovable Cloud.
2. Run `npm run build` to verify the build.
3. Publish from the Lovable editor or push to the connected repository.

## Learn more

- [Lovable docs](https://docs.lovable.dev)
- [TanStack Start docs](https://tanstack.com/start)
- [TMDB API docs](https://developer.themoviedb.org/reference)
