// Curated movie catalog (static reference data).
// Feature values are normalized 0..1 semantic attributes used by the recommender.
export const FEATURE_KEYS = ["character_driven","atmosphere","philosophical","humor","tension","romance","visual_style","slow_burn","complexity","emotional_intensity","realism","violence","world_building","dark_tone","optimism"] as const;

export type Movie = {
  id: number;
  title: string;
  year: number;
  runtime: number;
  director: string;
  genres: string[];
  overview: string;
  features: Record<string, number>;
  popularity: number;
  rating: number;
};

const RAW: [string, number, number, string, string[], string, number[]][] = [
["Interstellar",2014,169,"Christopher Nolan",["Sci-Fi","Drama","Adventure"],"A team of explorers travels through a wormhole in space in an attempt to ensure humanity's survival.",[.85,.88,.92,.15,.75,.55,.95,.6,.8,.95,.5,.2,.9,.5,.7]],
["The Batman",2022,176,"Matt Reeves",["Crime","Drama","Action"],"A brooding detective Batman tracks a sadistic killer through a rain-soaked Gotham.",[.7,.95,.4,.1,.85,.25,.9,.75,.6,.6,.4,.7,.7,.95,.2]],
["Arrival",2016,116,"Denis Villeneuve",["Sci-Fi","Drama","Mystery"],"A linguist is recruited to communicate with alien visitors and discovers time itself is at stake.",[.9,.9,.95,.05,.6,.4,.85,.85,.85,.9,.6,.05,.7,.5,.6]],
["Dune",2021,155,"Denis Villeneuve",["Sci-Fi","Adventure","Drama"],"A young heir travels to a desert planet to secure the future of his family and his people.",[.6,.95,.7,.05,.7,.3,.98,.8,.7,.6,.3,.6,.98,.6,.4]],
["Parasite",2019,132,"Bong Joon-ho",["Thriller","Drama","Comedy"],"A poor family schemes its way into the household of a wealthy one, with unforeseen consequences.",[.85,.7,.75,.6,.9,.1,.8,.4,.85,.8,.8,.6,.3,.8,.2]],
["Everything Everywhere All at Once",2022,139,"Daniels",["Sci-Fi","Comedy","Drama"],"A laundromat owner is pulled across the multiverse to save existence and her family.",[.9,.5,.85,.95,.6,.6,.9,.1,.95,.95,.2,.4,.9,.4,.9]],
["Blade Runner 2049",2017,164,"Denis Villeneuve",["Sci-Fi","Mystery","Drama"],"A young blade runner uncovers a secret that could plunge what's left of society into chaos.",[.8,.99,.95,.05,.6,.35,.99,.95,.75,.8,.3,.5,.9,.85,.2]],
["Knives Out",2019,130,"Rian Johnson",["Mystery","Comedy","Crime"],"A detective investigates the death of a patriarch of an eccentric, combative family.",[.6,.5,.15,.85,.6,.15,.7,.2,.7,.4,.6,.2,.3,.3,.8]],
["Whiplash",2014,106,"Damien Chazelle",["Drama","Music"],"A young drummer enrolls at a conservatory where a ruthless instructor pushes him to his limit.",[.95,.6,.5,.1,.95,.15,.7,.2,.5,.95,.9,.3,.1,.8,.3]],
["Mad Max: Fury Road",2015,120,"George Miller",["Action","Adventure","Sci-Fi"],"In a post-apocalyptic wasteland, a drifter and a rebel warrior flee a tyrant across the desert.",[.4,.8,.2,.3,.95,.05,.98,.05,.3,.6,.1,.9,.9,.7,.5]],
["Her",2013,126,"Spike Jonze",["Romance","Sci-Fi","Drama"],"A lonely writer falls in love with an operating system designed to meet his every need.",[.98,.9,.9,.35,.3,.95,.85,.85,.6,.95,.5,.02,.6,.5,.5]],
["The Grand Budapest Hotel",2014,99,"Wes Anderson",["Comedy","Adventure","Drama"],"A legendary concierge and his protégé become entangled in the theft of a priceless painting.",[.7,.85,.3,.95,.4,.4,.99,.1,.6,.5,.2,.3,.8,.3,.85]],
["No Country for Old Men",2007,122,"Coen Brothers",["Thriller","Crime","Drama"],"A hunter stumbles on drug money and is pursued by an implacable killer across Texas.",[.7,.9,.7,.15,.98,.02,.8,.8,.6,.6,.8,.85,.3,.95,.05]],
["Spirited Away",2001,125,"Hayao Miyazaki",["Animation","Fantasy","Adventure"],"A girl wanders into a world of spirits and must work to free her parents.",[.8,.95,.6,.5,.5,.2,.98,.4,.6,.85,.05,.1,.99,.4,.9]],
["The Social Network",2010,120,"David Fincher",["Drama","Biography"],"The founding of a social network and the lawsuits and betrayals that followed.",[.9,.6,.4,.4,.7,.15,.7,.3,.7,.6,.95,.05,.2,.7,.3]],
["Prisoners",2013,153,"Denis Villeneuve",["Thriller","Crime","Drama"],"A father takes matters into his own hands when his daughter disappears.",[.85,.9,.6,.02,.95,.05,.8,.8,.7,.95,.85,.75,.2,.98,.05]],
["Lady Bird",2017,94,"Greta Gerwig",["Drama","Comedy"],"A headstrong teenager navigates her last year of high school and her mother.",[.98,.5,.3,.7,.2,.5,.6,.3,.4,.85,.95,.02,.05,.3,.8]],
["Inception",2010,148,"Christopher Nolan",["Sci-Fi","Action","Thriller"],"A thief who steals secrets through dream-sharing is given the inverse task of planting an idea.",[.6,.7,.75,.15,.85,.4,.9,.2,.98,.7,.2,.5,.9,.6,.5]],
["Portrait of a Lady on Fire",2019,122,"Céline Sciamma",["Romance","Drama","History"],"On an isolated island, a painter is commissioned to paint a reluctant bride.",[.98,.95,.7,.05,.4,.99,.95,.98,.4,.95,.8,.02,.3,.5,.4]],
["Get Out",2017,104,"Jordan Peele",["Horror","Thriller","Mystery"],"A young man visits his girlfriend's family estate and uncovers a disturbing secret.",[.7,.85,.6,.5,.95,.2,.75,.5,.7,.7,.5,.6,.4,.9,.2]],
["The Lighthouse",2019,109,"Robert Eggers",["Horror","Drama","Mystery"],"Two lighthouse keepers lose their sanity on a remote New England island.",[.9,.99,.8,.4,.9,.02,.99,.9,.85,.8,.4,.6,.5,.99,.02]],
["Chef",2014,114,"Jon Favreau",["Comedy","Drama"],"A chef quits his restaurant job and starts a food truck to rediscover his passion.",[.8,.4,.1,.8,.1,.35,.5,.1,.15,.5,.8,.02,.1,.05,.98]],
["Sicario",2015,121,"Denis Villeneuve",["Thriller","Crime","Action"],"An idealistic agent is enlisted in an escalating war against drug cartels.",[.7,.95,.6,.02,.99,.02,.9,.6,.6,.7,.85,.85,.3,.95,.05]],
["Paddington 2",2017,103,"Paul King",["Comedy","Family","Adventure"],"A polite bear searches for the perfect present and lands in prison for a crime he didn't commit.",[.6,.7,.1,.98,.2,.2,.9,.02,.2,.6,.05,.02,.6,.02,.99]],
["Oldboy",2003,120,"Park Chan-wook",["Thriller","Mystery","Action"],"A man imprisoned for fifteen years is released and given five days to find his captor.",[.8,.9,.7,.2,.95,.3,.9,.5,.9,.9,.3,.95,.4,.99,.02]],
["Coco",2017,105,"Lee Unkrich",["Animation","Family","Fantasy"],"A boy is transported to the Land of the Dead and seeks his musician great-great-grandfather.",[.8,.85,.5,.6,.4,.4,.95,.05,.4,.95,.05,.05,.9,.2,.98]],
["Nightcrawler",2014,117,"Dan Gilroy",["Thriller","Crime","Drama"],"A driven loner films crime scenes in nocturnal Los Angeles and blurs every line.",[.9,.9,.6,.4,.9,.05,.8,.4,.6,.6,.85,.6,.2,.95,.05]],
["Before Sunrise",1995,101,"Richard Linklater",["Romance","Drama"],"Two strangers meet on a train and spend one night walking through Vienna.",[.99,.7,.8,.5,.1,.99,.5,.9,.3,.85,.95,.02,.05,.1,.9]],
["The Prestige",2006,130,"Christopher Nolan",["Mystery","Drama","Thriller"],"Two rival magicians engage in an escalating battle of obsession and deception.",[.8,.8,.6,.1,.85,.3,.8,.4,.95,.7,.4,.4,.5,.85,.1]],
["Past Lives",2023,105,"Celine Song",["Romance","Drama"],"Two childhood friends reunite decades later for one fateful week in New York.",[.99,.85,.8,.2,.2,.95,.8,.95,.3,.98,.95,.02,.05,.3,.5]],
["Aliens",1986,137,"James Cameron",["Sci-Fi","Action","Horror"],"A survivor returns to the moon where her crew met an alien threat, this time with marines.",[.6,.85,.2,.2,.98,.05,.7,.2,.4,.6,.1,.85,.85,.8,.3]],
["In Bruges",2008,107,"Martin McDonagh",["Comedy","Crime","Drama"],"Two hitmen hide out in a medieval Belgian town after a job goes wrong.",[.9,.8,.7,.9,.6,.2,.7,.4,.5,.8,.6,.6,.2,.7,.4]],
["Children of Men",2006,109,"Alfonso Cuarón",["Sci-Fi","Thriller","Drama"],"In an infertile world, a bureaucrat must escort a miraculously pregnant woman to safety.",[.75,.95,.9,.1,.95,.1,.95,.4,.6,.85,.6,.8,.9,.9,.4]],
["Moonlight",2016,111,"Barry Jenkins",["Drama"],"Three chapters in the life of a young Black man growing up in Miami.",[.99,.95,.7,.1,.4,.7,.9,.9,.4,.98,.95,.3,.1,.7,.4]],
["The Nice Guys",2016,116,"Shane Black",["Comedy","Crime","Action"],"A bruiser and a hapless private eye investigate a missing girl in 1970s Los Angeles.",[.7,.6,.1,.95,.5,.1,.7,.05,.5,.3,.5,.5,.2,.4,.8]],
["Annihilation",2018,115,"Alex Garland",["Sci-Fi","Horror","Mystery"],"A biologist joins an expedition into a zone where the laws of nature are unraveling.",[.7,.99,.95,.02,.85,.2,.95,.8,.9,.7,.2,.5,.9,.9,.2]],
["Roma",2018,135,"Alfonso Cuarón",["Drama"],"A year in the life of a housekeeper for a middle-class family in 1970s Mexico City.",[.95,.95,.7,.15,.3,.2,.95,.99,.3,.9,.99,.2,.1,.6,.4]],
["Edge of Tomorrow",2014,113,"Doug Liman",["Sci-Fi","Action"],"A soldier relives the same day of a losing alien war until he can win it.",[.5,.5,.3,.6,.85,.3,.8,.02,.7,.4,.1,.6,.8,.5,.7]],
["Call Me by Your Name",2017,132,"Luca Guadagnino",["Romance","Drama"],"A summer romance in northern Italy changes a young man forever.",[.98,.9,.5,.3,.2,.99,.9,.95,.2,.95,.9,.02,.1,.3,.7]],
["Heat",1995,170,"Michael Mann",["Crime","Thriller","Action"],"A career thief and the detective pursuing him mirror each other across Los Angeles.",[.85,.9,.5,.05,.9,.3,.85,.6,.6,.7,.8,.8,.3,.8,.2]],
["Spider-Man: Into the Spider-Verse",2018,117,"Bob Persichetti",["Animation","Action","Adventure"],"A Brooklyn teen joins spider-people from other dimensions to save the multiverse.",[.7,.7,.3,.85,.6,.3,.99,.02,.6,.7,.05,.3,.95,.2,.98]],
["Zodiac",2007,157,"David Fincher",["Mystery","Crime","Thriller"],"A cartoonist becomes obsessed with tracking a serial killer terrorizing the Bay Area.",[.85,.85,.5,.2,.8,.05,.8,.95,.8,.5,.95,.4,.2,.85,.1]],
["Amélie",2001,122,"Jean-Pierre Jeunet",["Romance","Comedy"],"A shy Parisian waitress decides to change the lives of those around her for the better.",[.9,.9,.4,.9,.1,.9,.98,.3,.3,.7,.2,.02,.6,.05,.99]],
["Sound of Metal",2019,120,"Darius Marder",["Drama","Music"],"A metal drummer loses his hearing and must rebuild his sense of self.",[.99,.85,.8,.05,.6,.4,.7,.7,.3,.98,.98,.1,.05,.7,.5]],
["Snowpiercer",2013,126,"Bong Joon-ho",["Sci-Fi","Action","Thriller"],"Survivors of a frozen earth live on a class-divided train circling the globe.",[.5,.8,.8,.3,.9,.05,.9,.2,.7,.6,.1,.85,.95,.9,.2]],
["Little Women",2019,135,"Greta Gerwig",["Drama","Romance","History"],"Four sisters come of age in the aftermath of the American Civil War.",[.98,.7,.5,.6,.2,.8,.9,.5,.5,.9,.7,.05,.3,.2,.9]],
["Ex Machina",2014,108,"Alex Garland",["Sci-Fi","Thriller","Drama"],"A programmer is invited to administer the Turing test to an intelligent humanoid robot.",[.85,.9,.98,.15,.85,.5,.9,.85,.8,.6,.5,.3,.6,.85,.15]],
["The Handmaiden",2016,145,"Park Chan-wook",["Thriller","Romance","Drama"],"A pickpocket is hired as a maid in a plot to defraud a Japanese heiress.",[.85,.95,.5,.5,.9,.9,.99,.6,.95,.8,.4,.5,.6,.8,.3]],
];

export const MOVIES: Movie[] = RAW.map(([title, year, runtime, director, genres, overview, feats], i) => ({
  id: i + 1,
  title,
  year,
  runtime,
  director,
  genres,
  overview,
  features: Object.fromEntries(FEATURE_KEYS.map((k, j) => [k, feats[j]])) as Record<string, number>,
  popularity: Math.min(1, 0.45 + ((year - 1990) / 70) + (genres.length * 0.03)),
  rating: 7.0 + ((i * 37) % 20) / 10,
}));

export const MOVIES_BY_ID = new Map<number, Movie>(MOVIES.map((m) => [m.id, m]));
export const ALL_GENRES = [...new Set(MOVIES.flatMap((m) => m.genres))].sort();
