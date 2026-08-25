// Extended metric layer: 100 additional semantic metrics derived deterministically
// from a film's genres, overview text, credits and production numbers. These sit
// alongside the 15 core features so the recommender can learn far finer-grained
// taste (pacing, structure, subject matter, tone, craft, era, audience).
import type { Movie } from "@/data/catalog";

type Ctx = {
  id: number;
  title: string;
  year: number;
  runtime: number;
  director: string;
  genres: string[];
  text: string; // lowercased title + overview + keywords
  rating: number;
  popularity: number;
  base: Record<string, number>; // the 15 core features
};

type Metric = {
  key: string;
  label: string;
  /** Genre → contribution (0..1). First genre counts full, others 0.6. */
  genres?: Record<string, number>;
  /** Lexicon hits in title/overview/keywords. */
  words?: string[];
  /** Weighted blend of core features, e.g. { tension: 0.6, dark_tone: 0.4 }. */
  from?: Record<string, number>;
  /** Free-form numeric adjustment applied after the blend. */
  adjust?: (c: Ctx) => number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

const METRICS: Metric[] = [
  // ---- Pacing & structure -------------------------------------------------
  { key: "pacing_relentless", label: "Relentless pacing", genres: { Action: 0.9, Thriller: 0.8, Horror: 0.7 }, from: { tension: 0.5 }, adjust: (c) => (c.runtime < 105 ? 0.1 : -0.05) },
  { key: "pacing_meditative", label: "Meditative pacing", from: { slow_burn: 0.8, atmosphere: 0.3 }, words: ["meditative", "contemplative", "quiet"], adjust: (c) => (c.runtime > 150 ? 0.12 : 0) },
  { key: "runtime_epic", label: "Epic length", adjust: (c) => clamp01((c.runtime - 120) / 90) },
  { key: "runtime_lean", label: "Lean and short", adjust: (c) => clamp01((115 - c.runtime) / 45) },
  { key: "structure_nonlinear", label: "Non-linear structure", words: ["nonlinear", "flashback", "time loop", "anthology", "chapters", "memory"], from: { complexity: 0.5 } },
  { key: "structure_twist", label: "Twist-driven", words: ["twist", "revelation", "unreliable", "secret identity", "conspiracy"], from: { complexity: 0.4, tension: 0.2 } },
  { key: "structure_ensemble", label: "Ensemble cast", words: ["ensemble", "group of", "team", "crew", "family gathering"], genres: { Adventure: 0.4, Comedy: 0.3 } },
  { key: "structure_single_location", label: "Confined setting", words: ["trapped", "one room", "bunker", "elevator", "island", "isolated", "cabin", "submarine"] },
  { key: "structure_road_trip", label: "Road movie", words: ["road trip", "journey across", "cross-country", "travels", "hitchhik"] },
  { key: "structure_heist", label: "Heist mechanics", words: ["heist", "robbery", "steal", "con artist", "bank job", "score"] },
  { key: "structure_courtroom", label: "Courtroom / legal", words: ["trial", "lawyer", "courtroom", "attorney", "jury", "verdict"] },
  { key: "structure_procedural", label: "Investigative procedural", words: ["detective", "investigation", "case", "clues", "police", "forensic"], genres: { Mystery: 0.7, Crime: 0.5 } },
  { key: "structure_origin", label: "Origin story", words: ["origin", "becomes", "rise of", "first mission", "learns he", "learns she"] },
  { key: "structure_sequel", label: "Franchise entry", adjust: (c) => (/(\b(ii|iii|iv|2|3|4|5)\b)|:/i.test(c.title) ? 0.85 : 0.15) },
  { key: "structure_open_ending", label: "Ambiguous ending", words: ["ambiguous", "open ending", "unresolved", "enigmatic"], from: { philosophical: 0.4 } },

  // ---- Narrative subject --------------------------------------------------
  { key: "subject_coming_of_age", label: "Coming of age", words: ["coming of age", "teenager", "high school", "adolescen", "growing up", "childhood"] },
  { key: "subject_family_drama", label: "Family drama", words: ["family", "father", "mother", "son", "daughter", "sibling", "marriage"], genres: { Drama: 0.4 } },
  { key: "subject_friendship", label: "Friendship", words: ["friend", "friendship", "buddy", "companions"] },
  { key: "subject_revenge", label: "Revenge", words: ["revenge", "vengeance", "avenge", "retribution"] },
  { key: "subject_survival", label: "Survival", words: ["survive", "survival", "stranded", "wilderness", "outbreak", "apocalyp"] },
  { key: "subject_war", label: "Warfare", genres: { War: 1 }, words: ["war", "soldier", "battle", "front line", "platoon", "resistance"] },
  { key: "subject_crime_underworld", label: "Criminal underworld", genres: { Crime: 0.9 }, words: ["mafia", "gang", "cartel", "mob", "smuggl", "underworld"] },
  { key: "subject_politics", label: "Political", words: ["president", "election", "politic", "government", "senator", "revolution", "propaganda"] },
  { key: "subject_religion", label: "Faith and religion", words: ["god", "priest", "faith", "church", "religio", "demon", "exorcis", "monk"] },
  { key: "subject_science", label: "Science and discovery", words: ["scientist", "experiment", "laborator", "research", "physic", "space program"] },
  { key: "subject_technology", label: "Technology and AI", words: ["artificial intelligence", "robot", "android", "hacker", "computer", "cyber", "virtual"] },
  { key: "subject_space", label: "Outer space", words: ["space", "planet", "astronaut", "galaxy", "orbit", "spacecraft", "alien"] },
  { key: "subject_supernatural", label: "Supernatural", words: ["ghost", "haunt", "spirit", "curse", "witch", "vampire", "possess", "undead"] },
  { key: "subject_superhero", label: "Superheroes", words: ["superhero", "superpower", "mutant", "marvel", "dc comics", "vigilante", "villain"] },
  { key: "subject_sports", label: "Sports", words: ["boxing", "football", "basketball", "racing", "olympic", "coach", "championship", "athlete"] },
  { key: "subject_music", label: "Music-driven", genres: { Music: 1 }, words: ["band", "singer", "musician", "concert", "album", "jazz", "orchestra"] },
  { key: "subject_art", label: "Art and creativity", words: ["painter", "artist", "novelist", "writer", "filmmaker", "theatre", "dancer"] },
  { key: "subject_medicine", label: "Medicine and illness", words: ["doctor", "hospital", "cancer", "illness", "surgeon", "patient", "disease"] },
  { key: "subject_school", label: "School and academia", words: ["school", "teacher", "student", "university", "professor", "class"] },
  { key: "subject_workplace", label: "Work and ambition", words: ["office", "corporate", "career", "boss", "wall street", "startup", "ambition"] },
  { key: "subject_travel", label: "Travel and place", words: ["paris", "tokyo", "new york", "island", "desert", "abroad", "village", "city of"] },
  { key: "subject_animals", label: "Animals and nature", words: ["dog", "horse", "wolf", "nature", "ocean", "jungle", "wildlife", "creature"] },
  { key: "subject_food", label: "Food and cooking", words: ["chef", "restaurant", "cook", "food", "kitchen", "recipe"] },
  { key: "subject_addiction", label: "Addiction and self-destruction", words: ["drug", "alcohol", "addict", "heroin", "gambl", "relapse"] },
  { key: "subject_identity", label: "Identity and belonging", words: ["identity", "immigrant", "outsider", "belong", "heritage", "race", "queer", "gender"] },
  { key: "subject_justice", label: "Justice and morality", words: ["justice", "corrupt", "innocent", "moral", "guilt", "sacrifice"] },
  { key: "subject_class", label: "Class and inequality", words: ["poverty", "rich", "working class", "wealth", "inequal", "slum", "landlord"] },

  // ---- Tone & mood --------------------------------------------------------
  { key: "tone_melancholy", label: "Melancholy", from: { dark_tone: 0.4, emotional_intensity: 0.4 }, words: ["grief", "loss", "loneliness", "regret", "mourning"] },
  { key: "tone_uplifting", label: "Uplifting", from: { optimism: 0.9 }, words: ["hope", "triumph", "inspir", "heartwarming"] },
  { key: "tone_bleak", label: "Bleak and unsparing", from: { dark_tone: 0.7, violence: 0.2 }, words: ["nihil", "despair", "brutal", "grim"] },
  { key: "tone_whimsical", label: "Whimsical", words: ["whimsic", "fairy tale", "magical", "quirky", "eccentric"], from: { humor: 0.3, visual_style: 0.2 } },
  { key: "tone_satirical", label: "Satirical", words: ["satire", "satiric", "parody", "mockumentary", "absurd"] },
  { key: "tone_deadpan", label: "Deadpan / dry humour", words: ["deadpan", "dry wit", "awkward", "understated"], from: { humor: 0.4 } },
  { key: "tone_camp", label: "Camp and excess", words: ["campy", "over-the-top", "outrageous", "flamboyant", "b-movie"] },
  { key: "tone_earnest", label: "Earnest and sincere", from: { optimism: 0.4, emotional_intensity: 0.3 }, words: ["sincere", "tender", "gentle", "kind"] },
  { key: "tone_cynical", label: "Cynical", words: ["cynic", "betray", "greed", "corrupt", "manipulat"], from: { dark_tone: 0.4 } },
  { key: "tone_dreamlike", label: "Dreamlike", words: ["dream", "surreal", "hallucin", "fever", "vision"], from: { atmosphere: 0.4 } },
  { key: "tone_playful", label: "Playful energy", from: { humor: 0.6, optimism: 0.3 } },
  { key: "tone_unsettling", label: "Unsettling", from: { tension: 0.5, dark_tone: 0.4 }, words: ["disturb", "eerie", "uncanny", "sinister"] },
  { key: "tone_romantic_longing", label: "Longing and yearning", from: { romance: 0.6, emotional_intensity: 0.3 }, words: ["yearn", "unrequited", "longing", "reunite"] },
  { key: "tone_wholesome", label: "Wholesome", genres: { Family: 0.9, Animation: 0.4 }, from: { optimism: 0.4 }, adjust: (c) => (c.base["violence"]! > 0.6 ? -0.3 : 0) },
  { key: "tone_gritty", label: "Gritty realism", from: { realism: 0.6, dark_tone: 0.4 }, words: ["gritty", "streets", "underbelly", "raw"] },

  // ---- Craft & style ------------------------------------------------------
  { key: "craft_cinematography", label: "Striking cinematography", from: { visual_style: 0.8, atmosphere: 0.2 }, adjust: (c) => (c.rating > 7.8 ? 0.08 : 0) },
  { key: "craft_score", label: "Memorable score", from: { atmosphere: 0.5, emotional_intensity: 0.3 }, words: ["score", "soundtrack", "composer"] },
  { key: "craft_dialogue", label: "Dialogue-forward", from: { character_driven: 0.6, humor: 0.2 }, words: ["conversation", "banter", "monologue", "interview"] },
  { key: "craft_practical_spectacle", label: "Large-scale spectacle", genres: { Action: 0.7, Adventure: 0.7, "Sci-Fi": 0.6 }, from: { visual_style: 0.4 } },
  { key: "craft_minimalist", label: "Minimalist craft", from: { slow_burn: 0.5, realism: 0.3 }, adjust: (c) => (c.popularity < 0.5 ? 0.1 : -0.05) },
  { key: "craft_stylized_violence", label: "Stylized violence", from: { violence: 0.6, visual_style: 0.4 } },
  { key: "craft_animation", label: "Animated", genres: { Animation: 1 } },
  { key: "craft_practical_horror", label: "Horror craft", genres: { Horror: 1 }, from: { tension: 0.3 } },
  { key: "craft_documentary", label: "Documentary form", genres: { Documentary: 1 }, words: ["documentary", "archival", "interviews"] },
  { key: "craft_period_design", label: "Period design", words: ["1800s", "19th century", "medieval", "victorian", "1920s", "1940s", "1960s", "ancient"], genres: { History: 0.7 } },
  { key: "craft_experimental", label: "Experimental", words: ["experimental", "avant-garde", "abstract", "no dialogue"], from: { complexity: 0.3 } },
  { key: "craft_practical_comedy", label: "Physical comedy", words: ["slapstick", "chase", "mishap", "prank"], from: { humor: 0.5 } },

  // ---- Character & perspective -------------------------------------------
  { key: "char_antihero", label: "Antihero lead", words: ["antihero", "criminal", "hitman", "assassin", "thief", "morally"], from: { dark_tone: 0.3 } },
  { key: "char_female_lead", label: "Female-led", words: ["she ", "her ", "woman", "girl", "mother", "daughter", "wife"] },
  { key: "char_child_lead", label: "Child or teen lead", words: ["boy", "girl", "child", "kid", "teenager", "orphan"] },
  { key: "char_underdog", label: "Underdog arc", words: ["underdog", "unlikely", "against all odds", "dream of becoming"] },
  { key: "char_duo", label: "Two-hander dynamic", words: ["two", "partners", "duo", "rivals", "pair"] },
  { key: "char_villain_focus", label: "Compelling antagonist", words: ["villain", "nemesis", "tyrant", "killer", "mastermind"], from: { tension: 0.3 } },
  { key: "char_redemption", label: "Redemption arc", words: ["redemption", "second chance", "atone", "forgive"] },
  { key: "char_isolation", label: "Isolated protagonist", words: ["alone", "solitude", "isolated", "recluse", "exile"], from: { slow_burn: 0.2 } },
  { key: "char_mentor", label: "Mentor relationship", words: ["mentor", "master", "trains", "apprentice", "coach", "teacher"] },
  { key: "char_moral_ambiguity", label: "Moral ambiguity", from: { complexity: 0.4, dark_tone: 0.3 }, words: ["moral", "dilemma", "compromis", "betray"] },

  // ---- Emotional payoff ---------------------------------------------------
  { key: "emo_catharsis", label: "Cathartic payoff", from: { emotional_intensity: 0.7, optimism: 0.3 } },
  { key: "emo_tearjerker", label: "Tearjerker", from: { emotional_intensity: 0.6, romance: 0.2 }, words: ["dying", "death", "farewell", "terminal", "goodbye"] },
  { key: "emo_adrenaline", label: "Adrenaline rush", from: { tension: 0.6, violence: 0.3 }, genres: { Action: 0.6 } },
  { key: "emo_comfort", label: "Comfort watch", from: { optimism: 0.6, humor: 0.4 }, adjust: (c) => (c.runtime < 110 ? 0.08 : 0) },
  { key: "emo_dread", label: "Sustained dread", from: { tension: 0.5, dark_tone: 0.5 }, genres: { Horror: 0.6 } },
  { key: "emo_awe", label: "Sense of awe", from: { visual_style: 0.5, world_building: 0.4 } },
  { key: "emo_discomfort", label: "Deliberately uncomfortable", from: { dark_tone: 0.5, realism: 0.3 }, words: ["abuse", "assault", "torture", "humiliat"] },
  { key: "emo_nostalgia", label: "Nostalgic", adjust: (c) => clamp01((2000 - c.year) / 60 + 0.2), words: ["nostalg", "memories", "hometown", "reunion"] },
  { key: "emo_wonder", label: "Childlike wonder", genres: { Family: 0.7, Fantasy: 0.6, Animation: 0.5 }, from: { optimism: 0.3 } },
  { key: "emo_intellectual", label: "Intellectually engaging", from: { philosophical: 0.6, complexity: 0.4 } },

  // ---- Era, scale & reception --------------------------------------------
  { key: "era_classic", label: "Classic era (pre-1970)", adjust: (c) => clamp01((1975 - c.year) / 40) },
  { key: "era_seventies_eighties", label: "70s–80s", adjust: (c) => clamp01(1 - Math.abs(c.year - 1980) / 18) },
  { key: "era_nineties", label: "90s", adjust: (c) => clamp01(1 - Math.abs(c.year - 1995) / 10) },
  { key: "era_2000s", label: "2000s", adjust: (c) => clamp01(1 - Math.abs(c.year - 2005) / 10) },
  { key: "era_modern", label: "Modern (2015+)", adjust: (c) => clamp01((c.year - 2012) / 12) },
  { key: "scale_blockbuster", label: "Blockbuster scale", adjust: (c) => clamp01(c.popularity * 1.1), genres: { Action: 0.4, Adventure: 0.4 } },
  { key: "scale_indie", label: "Indie / small scale", adjust: (c) => clamp01(1 - c.popularity), from: { realism: 0.3 } },
  { key: "scale_cult", label: "Cult appeal", adjust: (c) => clamp01((c.rating - 6.5) / 2.5) * clamp01(1 - c.popularity) * 1.4 },
  { key: "acclaim_critical", label: "Critically acclaimed", adjust: (c) => clamp01((c.rating - 6) / 2.6) },
  { key: "acclaim_crowd_pleaser", label: "Crowd pleaser", adjust: (c) => clamp01(c.popularity * 0.7 + (c.rating - 6) / 4) },
  { key: "origin_international", label: "International / non-English feel", words: ["japan", "korea", "france", "italy", "india", "mexico", "iran", "sweden", "china", "spanish", "berlin", "rome", "tokyo"] },
  { key: "origin_literary", label: "Literary adaptation", words: ["novel", "based on the book", "adaptation", "shakespeare", "short story"] },
  { key: "origin_true_story", label: "Based on true events", words: ["true story", "real life", "biograph", "historic", "memoir"], from: { realism: 0.4 } },
  { key: "audience_mature", label: "Adult / mature", from: { violence: 0.4, dark_tone: 0.4 }, words: ["sex", "nudity", "explicit", "drug"] },
  { key: "audience_all_ages", label: "All ages", genres: { Family: 0.9, Animation: 0.5 }, adjust: (c) => (c.base["violence"]! > 0.55 ? -0.35 : 0.05) },
  { key: "rewatch_value", label: "High rewatch value", from: { humor: 0.3, complexity: 0.3, visual_style: 0.2 }, adjust: (c) => clamp01((c.rating - 6.5) / 3) * 0.4 },
  { key: "demand_attention", label: "Demands attention", from: { complexity: 0.6, slow_burn: 0.4 }, adjust: (c) => (c.runtime > 140 ? 0.1 : 0) },
  { key: "background_friendly", label: "Easy background watch", from: { humor: 0.4, optimism: 0.3 }, adjust: (c) => (c.base["complexity"]! > 0.6 ? -0.3 : 0.1) },
  { key: "genre_blend", label: "Genre-blending", adjust: (c) => clamp01((c.genres.length - 1) / 3) },
  { key: "star_vehicle", label: "Star-driven", adjust: (c) => clamp01(c.popularity * 0.8 + 0.1), from: { character_driven: 0.2 } },
];

export const EXTENDED_FEATURE_KEYS = METRICS.map((m) => m.key);
export const EXTENDED_FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  METRICS.map((m) => [m.key, m.label]),
);

/** Deterministic derivation of the extended metric vector for any film. */
export function deriveExtendedFeatures(input: {
  id: number;
  title: string;
  year: number;
  runtime: number;
  director: string;
  genres: string[];
  overview: string;
  keywords?: string[];
  rating: number;
  popularity: number;
  features: Record<string, number>;
}): Record<string, number> {
  const ctx: Ctx = {
    id: input.id,
    title: input.title,
    year: input.year,
    runtime: input.runtime || 100,
    director: input.director,
    genres: input.genres,
    text: `${input.title} ${input.overview} ${(input.keywords ?? []).join(" ")}`.toLowerCase(),
    rating: input.rating,
    popularity: input.popularity,
    base: input.features,
  };

  const out: Record<string, number> = {};
  METRICS.forEach((m, idx) => {
    let acc = 0;
    let weight = 0;

    if (m.genres) {
      ctx.genres.forEach((g, i) => {
        const v = m.genres![g];
        if (v === undefined) return;
        const w = i === 0 ? 1 : 0.6;
        acc += v * w;
        weight += w;
      });
    }
    if (m.from) {
      for (const [k, w] of Object.entries(m.from)) {
        acc += (ctx.base[k] ?? 0.35) * w;
        weight += w;
      }
    }
    if (m.words) {
      const hits = m.words.filter((w) => ctx.text.includes(w)).length;
      if (hits) {
        const v = clamp01(0.55 + hits * 0.18);
        acc += v * 1.2;
        weight += 1.2;
      }
    }

    let value = weight ? acc / weight : 0.28;
    if (m.adjust) {
      const a = m.adjust(ctx);
      value = weight ? clamp01(value * 0.65 + a * 0.35) : clamp01(a);
    }
    // Small deterministic jitter so identical metadata still ranks distinctly.
    const jit = (((ctx.id * (idx + 11)) % 19) / 19 - 0.5) * 0.05;
    out[m.key] = r2(clamp01(value + jit));
  });
  return out;
}

/** Convenience: extend an already-built movie in place. */
export function withExtendedFeatures(movie: Movie): Movie {
  return {
    ...movie,
    features: { ...movie.features, ...deriveExtendedFeatures({ ...movie }) },
  };
}
