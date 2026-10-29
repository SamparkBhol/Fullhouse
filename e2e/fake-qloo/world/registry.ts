import type { FakePlace } from "./places.ts";

// Compare and the entity signals look places up by id, so every place the fake has answered with is kept here.
export class PlaceRegistry {
  private readonly byId = new Map<string, FakePlace>();

  remember(places: FakePlace[]): FakePlace[] {
    for (const p of places) this.byId.set(p.id.toUpperCase(), p);
    return places;
  }

  find(id: string): FakePlace | undefined {
    return this.byId.get(id.trim().toUpperCase());
  }

  // Places a search has already answered with, such as the venue itself, so another place's crowd can love it back.
  known(): FakePlace[] {
    return [...this.byId.values()];
  }
}
