import type { KindGroup } from "../../src/shared/contract.ts";

export interface Area {
  name: string;
  lat: number;
  lng: number;
}

export interface CityPlan {
  city: string;
  // Independent rooms that run evenings, typed by name the way an owner would type them.
  seeds: string[];
  areas: Area[];
  // Kind words near one area, used only when the named rooms leave the city short.
  searches: Array<{ query: string; area: string }>;
}

export const PER_CITY = 21;
export const WALK_MAX = 10;
// Live calls the scan may spend, and the room one more venue needs before it starts.
export const LIVE_CAP = 430;
export const VENUE_CALLS = 11;

// Rooms that run evenings. Restaurants and diners are left out of the scanned venues, never out of the partners.
export const SCANNED_GROUPS: KindGroup[] = ["book", "film", "record", "live", "stage", "art", "drinks", "coffee"];

// Chains and their branches are not independent rooms. A name seen at two or more places in the search is treated the same way.
export const CHAINS = [
  "amc", "regal", "angelika", "alamo drafthouse", "showcase", "odeon", "vue", "cineworld", "picturehouse", "everyman", "curzon",
  "barnes", "waterstones", "foyles", "hmv", "starbucks", "pret", "costa", "caffe nero", "blue bottle", "joe coffee", "gail", "le pain quotidien",
  "wetherspoon", "all bar one", "slug and lettuce", "nicholson", "fuller", "young's", "brewdog", "whole foods",
];

export const CITY_PLANS: CityPlan[] = [
  {
    city: "New York",
    seeds: [
      "Housing Works Bookstore Cafe", "Caffe Reggio", "smalls jazz club",
      "McNally Jackson Books", "Books Are Magic", "Greenlight Bookstore", "Bluestockings", "Three Lives & Company",
      "Film Forum", "IFC Center", "Anthology Film Archives", "Metrograph", "Nitehawk Cinema",
      "Academy Records", "Generation Records", "Village Vanguard", "Nublu", "Union Pool", "Rockwood Music Hall",
      "KGB Bar", "Nuyorican Poets Cafe", "Comedy Cellar", "Pete's Candy Store",
    ],
    areas: [
      { name: "Greenwich Village", lat: 40.7336, lng: -74.0027 },
      { name: "Lower East Side", lat: 40.718, lng: -73.989 },
      { name: "East Village", lat: 40.7264, lng: -73.9818 },
      { name: "Williamsburg", lat: 40.7142, lng: -73.9614 },
      { name: "Park Slope", lat: 40.6745, lng: -73.981 },
      { name: "Greenpoint", lat: 40.7299, lng: -73.954 },
    ],
    searches: [
      { query: "bookstore", area: "Lower East Side" },
      { query: "books", area: "Park Slope" },
      { query: "records", area: "Williamsburg" },
      { query: "records", area: "East Village" },
      { query: "cinema", area: "Williamsburg" },
      { query: "film", area: "Greenwich Village" },
      { query: "jazz", area: "East Village" },
      { query: "music hall", area: "Williamsburg" },
      { query: "gallery", area: "Lower East Side" },
      { query: "bar", area: "Greenpoint" },
      { query: "coffee", area: "Park Slope" },
      { query: "comedy", area: "Greenwich Village" },
    ],
  },
  {
    city: "London",
    seeds: [
      "prince charles cinema", "the french house", "soho theatre", "photographers gallery", "rough trade", "daunt books marylebone",
      "London Review Bookshop", "Gay's the Word", "Libreria", "Brick Lane Bookshop", "Close-Up Cinema", "Rich Mix",
      "Reckless Records", "Phonica Records", "Sister Ray", "Sounds of the Universe", "Ronnie Scott's", "The Social",
      "The Lexington", "Bar Italia", "Whitechapel Gallery", "Coach and Horses Soho",
    ],
    areas: [
      { name: "Soho", lat: 51.5136, lng: -0.134 },
      { name: "Shoreditch", lat: 51.5246, lng: -0.078 },
      { name: "Bloomsbury", lat: 51.521, lng: -0.126 },
      { name: "South Bank", lat: 51.505, lng: -0.115 },
      { name: "Clerkenwell", lat: 51.524, lng: -0.105 },
      { name: "Camden", lat: 51.5392, lng: -0.1426 },
    ],
    searches: [
      { query: "bookshop", area: "Bloomsbury" },
      { query: "books", area: "Clerkenwell" },
      { query: "records", area: "Soho" },
      { query: "records", area: "Shoreditch" },
      { query: "cinema", area: "Shoreditch" },
      { query: "jazz", area: "Soho" },
      { query: "gallery", area: "Shoreditch" },
      { query: "pub", area: "Bloomsbury" },
      { query: "coffee", area: "Clerkenwell" },
      { query: "comedy", area: "Camden" },
      { query: "music", area: "Camden" },
      { query: "theatre", area: "South Bank" },
    ],
  },
];
