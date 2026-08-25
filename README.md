# Reel — Movie recommendations that learn your taste

> A personalized film recommender. Ask for what you're in the mood for, swipe through picks, or dive into a single film — every like, save, watch and skip feeds a taste model that gets sharper the more you use it.

This project was built with [Lovable](https://lovable.dev).

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

The engine is a hybrid scoring model, not a simple popularity list.

- **Core feature space** — 15 semantic dimensions per film (character-driven, atmosphere, philosophical, humor, tension, romance, visual style, slow burn, complexity, emotional intensity, realism, violence, world-building, dark tone, optimism).
- **Extended metric layer** — 100+ additional metrics derived from genres, overviews, credits, and runtime (pacing, structure, subject matter, tone, craft, era, audience). These sit alongside the core features for finer-grained learning.
- **Taste model** — `user_preferences` stores a learned preference value, confidence, importance, and evidence count per feature. Evidence comes from likes, dislikes, watches, saves, passes, and explicit knowledge-base notes.
- **Scoring** — each candidate is ranked by a weighted blend of:
  - preference matching against your learned model
  - semantic similarity to the current intent or anchor film
  - theme/intent alignment from your query
  - novelty / discovery nudges
  - filter affinity (decades, genres, rating, runtime habits)
  - era bias favoring 2000s–2020s Hollywood unless your history shows otherwise
  - a decaying “not interested” penalty that buries passed films for ~4 months
- **Exclusions** — anything already liked, disliked, watched, or saved is never recommended again.
- **Explainability** — every recommendation can return a `ScoreBreakdown` showing the signals, weights, and adjustments that produced the fit %.

AI is used in three places:

1. Parsing free-form mood queries into structured intent (`src/lib/intent.server.ts`).
2. Summarizing knowledge-base notes into structured taste signals (`src/lib/knowledge.server.ts`).
3. Generating the narrative “How the algorithm reads you” summary on the profile (`src/lib/taste-summary.server.ts`).

All model calls route through the Lovable AI Gateway.

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
