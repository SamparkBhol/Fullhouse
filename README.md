# Full House

Full House finds the place down the street whose customers already love your venue, checks that its customers love you back, and plans one night that walks both crowds through both doors.

Live site: https://fullhouse.sampark-bhol.workers.dev

Small venues have nights that die, a Tuesday at the bookshop or a Wednesday at the bar on the corner. A night fills when people already care about it and it runs with a place they already go to. Owners who know each other do this all the time. The hard part is knowing which neighbour shares your customers, whether that crowd likes you back, and what night both would come out for.

Qloo knows which places, books, films, shows and artists the same people love. Full House takes those answers and makes the calls an owner would make: which neighbour, what night, which day, and who sent whom.

## What it does

1. Pick your city and type your venue's name. Search looks round the city centre or within a mile of you and ranks by name, then distance.
2. Full House reads the street while a map fills with the places your crowd loves.
3. The partner screen names the neighbour it chose, scores the pair on six checks, and shows Qloo's list with Full House's verdict on each place.
4. The night screen plans two stops, one at each place, on a day both are open.
5. You send the invite link from your own phone. The neighbour sets its own part of the night and answers yes or no.
6. Your screen flips on the yes. You check the exact words, then publish the event page, a poster and a calendar file.
7. Each place gets its own sign up link, and every RSVP counts against the link it came through.
8. Every Monday the venue reads its street again, drafts a fresh night and waits for the owner.

Any MCP client can run the same flow at `/mcp`, and `/live` shows what the server has done.

The shots are from the live site on 30 October 2026, for Daunt Books Marylebone in London. The venue was deleted afterwards.

| Screen | What it shows |
| --- | --- |
| ![Landing](media/landing.png) | Qloo's list for Housing Works Bookstore, with Full House's verdicts. |
| ![Search](media/search.png) | Search in London. |
| ![Your crowd](media/crowd.png) | The places your crowd loves. |
| ![Partner](media/partner.png) | EtnaCoffee, 11th on Qloo's list, chosen. |
| ![Partner on a phone](media/partner-phone.png) | The same, on a phone. |
| ![The night](media/night.png) | Two stops, five minutes apart. |
| ![Invite](media/invite.png) | The invite as EtnaCoffee sees it. |
| ![Flip](media/flip.png) | The owner's screen after the yes. |
| ![Event page](media/event.png) | The public event page. |
| ![Ledger](media/ledger.png) | One RSVP through EtnaCoffee's link. |

## How a pair is chosen

Qloo returns up to 50 places within 1.2 km that people who like your venue also love. Full House keeps Qloo's order as the rank and sets aside closed places, places that cannot host a night (shops, libraries, parks, churches, hotels) and rivals of your own kind. The rest are ordered on what is already known, and the top 8 go on.

For each of those 8 it asks Qloo the same question from the other side, with that place as the signal, and looks for your venue in the answer. Daunt Books Marylebone is 17th of the 50 places EtnaCoffee's crowd loves.

The fit score has six checks. Crowd pull (25 points) is how high the place sits on your crowd's list, and loves you back (25) is where you sit on theirs. Both pass in the top half. Good partners (15) comes from a complement matrix over nine kinds of place: a bookshop and a cinema score 1, a cinema and a theatre 0.8, a cafe and a restaurant 0.5, two of a kind 0. Open together (15) counts the next seven evenings on which both are open at their own stop's time, with half for a late opening or unlisted hours. Close enough to walk (10) is full within 300 m and empty at 1.5 km. Shared taste (10) scores tags both places carry by how rare they are on the street: the lower affinity times the log of one over the share of nearby places with the tag. Tags most of the street carries earn nothing.

The highest score wins, unless the next is within 5 points and a shorter walk. A place shut for its part every evening cannot win while another can open.

The partner screen shows Qloo's first 15 places plus every place scored, each with a verdict and a reason from its own numbers. For Daunt it read "Full House chose the 11th of Qloo's 50, EtnaCoffee. The 1st, Park Sports The Regent's Park, is a tennis shop." EtnaCoffee and K-POP both scored 73, and EtnaCoffee won as "5 minutes on foot instead of 13."

## The night

The two kinds of place pick the format: book then film, film then show, screening then drinks, book club then drinks, a listening party at a record shop, coffee or drinks before a live room's own set, show then drinks, a late view at a gallery, or a TV and film quiz crawl. A film is screened only at a cinema, and the playlist plays only in a bar, a record shop or a cafe after 17:00.

The picks come from one Qloo call per kind of pick with both places as the signal and explainability on, so each pick carries each crowd's share. Full House takes picks from the top ten split between 35 and 65, better known first, and drops anything under 0.8 popularity. For a book then film night it finds the book the film was made from.

The day is the owner's quiet slot when both stops are open at their own times, and a stop counts as open only if it stays open 45 minutes after people arrive. Otherwise it tries the nearest weekday, an hour earlier, the other place first, and last the venue opening late. Daunt closes at 19:30 on Tuesdays and EtnaCoffee at 20:00, so the night runs coffee at EtnaCoffee from 19:00, then a book club on The Possession of Mr Cave at Daunt from 20:15, split 51 to 49 between the crowds.

Mistral Small 3.1 24B on Workers AI writes the description and poster lines from a brief of what Qloo returned. A checker rejects copy naming anything not in the brief, and templates step in.

The owner's night page counts RSVPs per link, "From your link 0. From EtnaCoffee's link 1." Public pages show a count only from 3.

## What Qloo provides

Only the Worker holds the key. The limits are in `src/shared/engine.ts`.

| Step | Request | Calls |
| --- | --- | --- |
| Find the venue | `/search` | 1 to 3 per search |
| The street's and the venue's tags | `/v2/insights`, `urn:tag` | 2 per read |
| Places the crowd loves | `/v2/insights`, `urn:entity:place`, take 50 | 1 per read |
| Loves you back | the same, each candidate as signal | up to 8 per read |
| What the two share | `/v2/analysis/compare` | 1 per read or swap |
| Where the crowd gathers | `/v2/insights`, `urn:heatmap` | up to 2 per read |
| What the crowd loves | `/v2/insights`, five kinds | 5 per read |
| The night's picks | `/v2/insights`, both places | 1 to 3 per night |
| The book behind the film | `/search` | up to 3 per night |

A read makes at most 19 calls under a cap of 30, and a night stays under a cap of 8. The Daunt read made 19 and its night 2. Images come through the Worker, so visitors never talk to Qloo.

## Run it

Node 22.18 or newer.

```sh
npm ci
npm run dev
```

This runs the Worker with `wrangler dev` against a fake Qloo server. For live data:

```sh
read -rs QLOO_API_KEY && export QLOO_API_KEY
LIVE=1 npm run dev
```

The key goes into a `.dev.vars` that is deleted on exit. To deploy, run `npm run build` and `npx wrangler deploy`, and set `QLOO_API_KEY` and `TOKEN_SECRET` as secrets.

## Tests

```sh
npm run check
npm run e2e
```

`check` runs the typecheck and the unit tests, whose fixtures include trimmed real Qloo answers. `e2e` runs Playwright against the fake Qloo server. On 30 October 2026, `npx vitest run --maxWorkers=2` passed 610 tests in 78 files, and `npm run e2e` passed 38 tests in the app project and 1 in the no key project.

## Privacy

Qloo receives your venue as a public place, ids it returned itself, names typed into search, and on the Proof tab the places a plain language model suggested, only to check they exist. Nothing about customers is sent. Your position from "use my location" finds your venue and is never stored.

A partner is never named on a night's event page, poster or calendar file before it says yes on its own invite page, and the landing marks its example as a pair not yet agreed. It first sets its own part: what runs there, when it starts, and whether it is open that evening. The event page says how the yes was given, for example "EtnaCoffee answered through an invite link. Its stop is proposed, subject to its own programme." The owner approves every night, and the Monday run never publishes.

On the hosted demo, email is off, so no venue can confirm an address on its own website and every venue shows as unconfirmed.

A venue nobody opens for 8 weeks stops its Monday runs and is deleted after 6 months.

## Licence

MIT. See `LICENSE`.
