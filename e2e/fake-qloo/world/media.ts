import { uuidFrom } from "../seed.ts";
import { tagDefs, type TagDef } from "./tags.ts";

export type WorkType = "artist" | "book" | "movie" | "tv_show" | "podcast" | "videogame";

export interface FakeWork {
  id: string;
  name: string;
  type: WorkType;
  disambiguation: string;
  tags: TagDef[];
}

type Row = [name: string, disambiguation: string, tags: string[]];

const MUSIC = "urn:tag:genre:music";
const MEDIA = "urn:tag:genre:media";
const KEYWORD = "urn:tag:keyword:media";

const POOLS: Record<WorkType, Row[]> = {
  artist: [
    ["Hollow Pines", "Hollow Pines", [`${MUSIC}:indie_folk`]],
    ["Marisol Vega", "Marisol Vega", [`${MUSIC}:soul`]],
    ["The Quiet Lanterns", "The Quiet Lanterns", [`${MUSIC}:indie_folk`, `${MUSIC}:jazz`]],
    ["Ondine Park", "Ondine Park", [`${MUSIC}:electronic`]],
    ["Brass Sparrow Trio", "Brass Sparrow Trio", [`${MUSIC}:jazz`]],
    ["Kit Calloway", "Kit Calloway", [`${MUSIC}:soul`, `${MUSIC}:jazz`]],
    ["Static Gardens", "Static Gardens", [`${MUSIC}:post_punk`]],
    ["Juno Ashby", "Juno Ashby", [`${MUSIC}:indie_folk`]],
    ["Night Ferry", "Night Ferry", [`${MUSIC}:electronic`, `${MUSIC}:post_punk`]],
    ["Ada Moreau", "Ada Moreau", [`${MUSIC}:jazz`]],
    ["Paper Boats", "Paper Boats", [`${MUSIC}:post_punk`]],
  ],
  book: [
    ["The Salt Orchard", "2021, Imogen Hale", [`${MEDIA}:drama`, `${KEYWORD}:found_family`]],
    ["A Map of Small Rooms", "2019, Theo Marsh", [`${MEDIA}:drama`, `${KEYWORD}:coming_of_age`]],
    ["Weather for Strangers", "2022, Priya Natarajan", [`${MEDIA}:mystery`]],
    ["The Lamplighter's Ledger", "2018, Callum Reyes", [`${MEDIA}:mystery`, `${MEDIA}:drama`]],
    ["Glass Harbour", "2020, Noor Haddad", [`${MEDIA}:science_fiction`]],
    ["Everything the River Kept", "2023, Lena Vos", [`${MEDIA}:drama`]],
    ["The Night Bakers", "2017, Ruth Okonkwo", [`${MEDIA}:comedy`, `${KEYWORD}:found_family`]],
    ["Orbiting Mrs Pell", "2021, Arlo Finch", [`${MEDIA}:science_fiction`, `${MEDIA}:comedy`]],
    ["Small Fires", "2016, Maeve Duggan", [`${MEDIA}:drama`, `${KEYWORD}:coming_of_age`]],
    ["The Index of Lost Hats", "2022, Ben Arkwright", [`${MEDIA}:comedy`]],
  ],
  movie: [
    ["Harbour Lights", "2018, Ines Coulter", [`${MEDIA}:drama`]],
    ["The Last Projectionist", "2020, Marco Lind", [`${MEDIA}:documentary`]],
    ["Copper Summer", "2019, Hana Sato", [`${MEDIA}:drama`, `${KEYWORD}:coming_of_age`]],
    ["Signal Fire", "2022, Owen Brandt", [`${MEDIA}:science_fiction`]],
    ["Two for the Night Bus", "2017, Elena Ruiz", [`${MEDIA}:comedy`]],
    ["Field Notes from Nowhere", "2021, Sam Achebe", [`${MEDIA}:documentary`]],
    ["The Quiet Accountant", "2016, Pia Lund", [`${MEDIA}:mystery`]],
    ["Lantern Street", "2023, Rafael Mendes", [`${MEDIA}:drama`, `${KEYWORD}:found_family`]],
    ["Moth and Moon", "2015, Clara Benoit", [`${MEDIA}:drama`]],
    ["Rooftop Orchestra", "2020, Dara Moore", [`${MEDIA}:documentary`, `${MEDIA}:comedy`]],
  ],
  tv_show: [
    ["Night Shift Diaries", "2021", [`${MEDIA}:comedy`]],
    ["The Ferryman's Daughters", "2019", [`${MEDIA}:drama`, `${KEYWORD}:found_family`]],
    ["Cold Case Kitchen", "2022", [`${MEDIA}:mystery`, `${MEDIA}:comedy`]],
    ["Outer Rings", "2020", [`${MEDIA}:science_fiction`]],
    ["Small Town Signals", "2018", [`${MEDIA}:drama`]],
    ["The Record Keepers", "2023", [`${MEDIA}:documentary`]],
    ["Second Shelf", "2017", [`${MEDIA}:comedy`, `${KEYWORD}:found_family`]],
    ["Harbourmaster", "2021", [`${MEDIA}:mystery`]],
    ["Late Bloomers", "2022", [`${MEDIA}:comedy`, `${KEYWORD}:coming_of_age`]],
    ["Tidewater", "2016", [`${MEDIA}:drama`]],
  ],
  podcast: [
    ["Small Hours Radio", "Small Hours Radio", [`${MEDIA}:documentary`]],
    ["The Shelf Life", "The Shelf Life", [`${MEDIA}:comedy`]],
    ["Unsolved on Main Street", "Unsolved on Main Street", [`${MEDIA}:mystery`]],
    ["Liner Notes", "Liner Notes", [`${MEDIA}:documentary`]],
    ["Kitchen Table Science", "Kitchen Table Science", [`${MEDIA}:science_fiction`]],
    ["Two Coffees In", "Two Coffees In", [`${MEDIA}:comedy`]],
    ["Neighbourhood Ghosts", "Neighbourhood Ghosts", [`${MEDIA}:mystery`, `${MEDIA}:documentary`]],
    ["The Long Table", "The Long Table", [`${MEDIA}:drama`]],
    ["Overheard at the Bar", "Overheard at the Bar", [`${MEDIA}:comedy`]],
    ["Field Recordings", "Field Recordings", [`${MEDIA}:documentary`]],
  ],
  videogame: [
    ["Lighthouse Keeper", "2021, Tern Games", [`${MEDIA}:mystery`]],
    ["Pocket Orchestra", "2019, Slow Owl", [`${MEDIA}:comedy`]],
    ["Orbit Gardeners", "2022, Fennel Works", [`${MEDIA}:science_fiction`]],
    ["Night Market Tycoon", "2020, Lantern Labs", [`${MEDIA}:comedy`]],
    ["The Ferry Puzzle", "2018, Quay Studio", [`${MEDIA}:mystery`]],
    ["Paper Kingdoms", "2023, Inkwell", [`${MEDIA}:drama`]],
    ["Signal Lost", "2021, Static Hare", [`${MEDIA}:science_fiction`]],
    ["Bakehouse Rush", "2017, Crumb Co", [`${MEDIA}:comedy`]],
    ["Small Gods of Main Street", "2022, Alder Games", [`${MEDIA}:drama`, `${KEYWORD}:found_family`]],
    ["Harbor Lights Racing", "2016, Pier Nine", [`${MEDIA}:comedy`]],
  ],
};

export const WORK_URN: Record<WorkType, string> = {
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  podcast: "urn:entity:podcast",
  videogame: "urn:entity:videogame",
};

export function workTypeOf(urn: string): WorkType | null {
  const hit = Object.entries(WORK_URN).find(([, u]) => u === urn);
  return hit ? (hit[0] as WorkType) : null;
}

export function worksOf(type: WorkType): FakeWork[] {
  return POOLS[type].map(([name, disambiguation, tags]) => ({ id: uuidFrom(`${type}|${name}`), name, type, disambiguation, tags: tagDefs(tags) }));
}
