# Full House

Full House finds the place down the street whose customers already love yours, and sets up the one night both crowds want, so you each send your regulars to the other.

- Live app: https://fullhouse.sampark-bhol.workers.dev
- Live numbers: https://fullhouse.sampark-bhol.workers.dev/live
- MCP endpoint: https://fullhouse.sampark-bhol.workers.dev/mcp

## Why I built it

Every independent venue has a night that dies. Tuesday at the bookshop cafe, Wednesday at the bar on the corner. The usual fixes are a discount or another reel. What actually fills a room is a night that people already care about, put on with a place they already go to. Small venues do this all the time when the owners happen to know each other. The hard part is knowing which neighbour shares your customers, and what night both crowds would come out for.

Qloo can see both. Asked with the venue itself as the signal, it returns the real places nearby that the venue's own crowd loves, with their hours, and it can split any pick between two venues' crowds with its explainability scores. A plain chatbot guesses from fame: asked for partners for Housing Works Bookstore, one named a hotel Qloo lists as permanently closed and two businesses Qloo has no record of.

## What it does

1. **Type your venue.** One field. Qloo's matches show as you type, and you tap yours. Nothing else is asked first.
2. **See your crowd.** The read lands while you watch: where the taste for your venue runs strongest on the street, then the artists, books, films, shows and podcasts your crowd is into.
3. **Meet your match.** The place down the street your crowd loves most that can host people, minutes away on foot, with what both crowds share. Libraries, churches, parks and places Qloo lists as closed never come up.
4. **The night both crowds want.** Full House asks Qloo with both places as the signal and picks the feature whose explainability split between the two crowds is nearest half and half. For Housing Works Bookstore and Angelika Film Center, 2 minutes apart, that was a watch night around The Other Two, with the split at 50 and 50. When no pick is near even, it says so and builds on your own crowd's pick instead.
5. **Ask them.** One button opens your own share sheet or mail with an invite link. The neighbour's page shows the two places, the night, the split and what the two crowds share, with two buttons: We're in, and Not this time.
6. **Their yes is the action.** Your screen flips to "Angelika Film Center is in" within seconds. Only then does the public event page, the poster and the calendar file carry both names. Before a yes, nothing public mentions them.
7. **It comes back every Monday** with a fresh read and the next joint night, leaves out what you already ran, and waits for your yes.

## Who pays

The buyer is the owner of an independent cafe, bar, bookshop, record shop, cinema or gallery with a slow night and nobody to plan it. The price is about 79 dollars a month per venue. Every invite is distribution: the neighbour's first joint night is free, and it sees its own crowd read on the invite page, which is how it becomes the next customer. One plan costs 12 Qloo calls for the read, 5 more for the joint read and two small model calls for the words, on the Cloudflare Workers free plan. There are no paying venues or pilots yet.

## How Qloo powers each step

Every request is a GET to `https://hackathon.api.qloo.com` with the key in the `X-Api-Key` header, which only the Worker holds. A probe of about 380 live calls across 15 real venues set these choices before any of the app was written.

1. **Find the venue.** `/search` with the name and the city together. Searching the city first sent "New York" to the middle of New York State.
2. **The street and the venue.** `filter.type=urn:tag` twice: once with `signal.location` for the blocks around the venue, once with `signal.interests.entities` set to the venue.
3. **The places its crowd loves.** `urn:entity:place` with the venue as the signal inside a 1.2 km `filter.location` POINT and `feature.explainability`. A location alone returns near level scores and the same global names everywhere; the venue as the signal returns its actual neighbours.
4. **The match.** The best of those that can host people, then `/v2/analysis/compare` between the venue and the partner for what both crowds share, and the partner's own crowd tags.
5. **Where the taste runs strongest.** `urn:heatmap` with the venue as the signal, drawn as lit windows on a night map.
6. **Your crowd's picks.** One insights call each for artist, book, movie, tv_show and podcast with the venue as the signal and the venue's point.
7. **The joint read.** The same five types with `signal.interests.entities` set to both places and `feature.explainability` on. Each pick's two explainability scores, inside one response, become the split between the two crowds.
8. **Proof.** A plain model is asked what an owner would ask a chatbot, and every place it names is looked up on Qloo search near the venue. The page leads with its hard failures: closed, not in Qloo, real but not tied to this crowd.

Trending is flat on the hackathon host, so Full House makes no "rising" claims. Ranks are compared only inside one response, and every reason on screen points at the call it came from in the Receipts drawer.

## The Monday agent

Each venue is its own Durable Object with an alarm set for Monday 09:00 in the venue's time zone. When it wakes, it:

1. Reads the street again with the same twelve calls.
2. Sends the features of the last eight weeks of nights to Qloo as exclusions, so the picks are new, and notes how each pick moved since last week's read, with both dates ("#2 in this read, #4 in the read of 2026-10-20"). It makes no claim of momentum, because Qloo's weekly trend data held flat on this host.
3. Plans the next quiet slot. If the last night drew under 40 percent of its room, that kind of night is skipped this week; if it filled 60 percent or more, that kind is preferred.
4. Stores the plan as a proposal from the Monday run, emails the owner a link if they confirmed an email, and sets next Monday's alarm.

A venue nobody opens for 8 weeks stops its Monday runs, and after 6 months it is deleted with everything in it.

It never publishes. The owner approves every night.

## MCP tools

`/mcp` is a stateless Streamable HTTP endpoint with JSON responses, built on the MCP TypeScript SDK v2. Any MCP client can run the whole flow. Owner tools take the `venue_id` and `owner_token` from the owner's link.

| Tool | What it does | Owner token |
| --- | --- | --- |
| `find_venue` | Looks a venue up by name and city and returns up to 8 places with address, coordinates and tags | no |
| `read_street` | Runs or refreshes the street read, every part with its Qloo provenance | yes |
| `propose_night` | Drafts a night plus two alternatives, or refines a plan from a request in plain words. Publishes nothing | yes |
| `publish_night` | Publishes nothing. Returns the link to the approval screen, where the owner reads the words and ticks each action | yes |
| `log_turnout` | Records how many people came, with an optional note. Never sent to Qloo | yes |

## Live numbers

- Charts: https://fullhouse.sampark-bhol.workers.dev/live
- The same numbers as plain text, no JavaScript needed: https://fullhouse.sampark-bhol.workers.dev/live.txt

`/live` shows what this server has done: venues set up, street reads, plans and who wrote their words, nights published, RSVPs, turnout, Monday runs, MCP tool calls, and every Qloo call by endpoint with its cache answers, errors and time to answer. Every figure comes from counters the Worker keeps as things happen. Nothing is seeded. A pane with nothing to count says what will show there once someone uses the app. Each chart covers 24 hours, 7 days or 30 days, opens as a table, and checks for new numbers on its own while the tab is open.

The page keeps each owner's business with the owner. A venue is named only after it confirms an email on its own website's domain, and then only on its published nights and RSVPs. Reads, plans and drafts never carry a name. Head counts and seats show only as a total, and only once five nights are logged in the range, so no one venue's night can be read off the page. Taking a night down removes its lines from the log, and deleting a venue removes all of them.

Each owner also has a Numbers tab behind their owner link: the RSVPs for the next night as they come in, every night against its room, each street read with the Qloo calls it made, and what each Monday run drafted.

## Privacy and safe use

- **What Qloo receives:** the venue as a public place (its Qloo id and map point), ids of places and tags that Qloo itself returned, the names typed into a search, and, on the Proof tab, the names a plain language model suggested, sent to Qloo search only to check whether they exist. Nothing about customers, because Full House never asks for anything about them. The owner's email stays in the venue's Durable Object. RSVPs and turnout reach the public numbers only as counts added up across venues, and never reach Qloo.
- **Consent both ways:** a partner is never named on a public page, poster or calendar file until it presses We're in on its own invite page. A night the partner hosts cannot be published before that yes. The model never sees partner names, so its copy cannot name one.
- **Who posted a page:** until a venue confirms an email on its own website domain, its event page and poster say "Posted on Full House by whoever set up the venue. The venue has not confirmed it." Anyone can report a page, three reports take it offline, and the owner can take any page down.
- **Aggregate, and said so:** every screen with Qloo data ends with a "Receipts" drawer that holds a "What this does not tell you" list. The read asks Qloo nothing about age or gender. Identity themes never reach public copy. Ranks are positions within one answer, never percentages, and a missing score is never shown as zero.
- **Qloo's answer and Full House's choice stay apart:** each page has one "Receipts" drawer, closed until opened, that says how each part is known and lists each reason with the Qloo call it came from. Where a rule of mine made the choice, the line says so ("tagged movie theater, which Full House pairs with a film night").
- **The model writes words, not facts:** plain rules pick the night. The model (Mistral Small 3.1 24B on Workers AI by default) gets a JSON brief of what Qloo returned and writes the description, poster lines, social post and partner note. A checker rejects any copy that names a person, place, work or brand that is not in the brief, fixed templates step in, and the plan says which writer was used.
- **No outreach without the owner:** partner notes open in the owner's own mail app, Gmail or Outlook, unsent. The only email the app sends goes to an address the owner confirmed, at most three a day, and only when email is set up.
- **Images without tracking:** covers and place photos come from Qloo's image host through the Worker's own `/img/` path, so a visitor's browser never talks to Qloo.
- **Public pages stay small:** event pages ask search engines not to list them and keep an RSVP count only. One RSVP per browser, through a random cookie stored as a hash salted with the night, and at most three per night from one address.
- **Owner links can be replaced:** a new owner link from the venue page stops every older one for that venue.
- **How long things are kept:** a venue nobody opens for 8 weeks stops its Monday runs; after 6 months it is deleted with everything in it.
- **Licences:** the playlist is a list of artists, not a licence, and film nights carry a screening licence reminder.
- **Deleting a venue** removes its reads, plans, nights, counts, email and Eventbrite token and its lines in the public log, and its event pages stop working. The totals on `/live` keep what was counted, with no name attached.

## Limits

- Qloo's weekly trend series came back flat or empty on the hackathon host, so nothing is called rising. Changes show only as rank moves between two dated reads.
- Street tags from a location arrive nearly level and in five namespaces only, so they are shown as a set.
- Demographics ignore location, so they describe the venue's audience as a whole, never the street.
- The venue has to be in Qloo's catalog with a location. Search is fuzzy and never comes back empty, which is why the owner picks by address.
- For a few venues Qloo silently drops the venue from the signal for some kinds of pick. The read spots this from the empty explainability and labels those lists as the area's picks.
- Data is densest in Manhattan, London, Paris and San Francisco and thinner in Austin, Chicago, Los Angeles and Berlin.
- A plan is a suggestion from aggregate taste. It says nothing about who will come, and the owner should check a partner fits before sending the note.
- Qloo calls are capped per day (`QLOO_DAILY_BUDGET`, 4000 by default, with a fifth kept for venues older than a week) and per read (30). Each IP address, or IPv6 /64, gets 20 new venues, 120 searches, 30 reads, 60 plans, 60 RSVPs and 10 proof checks a day, and each venue 3 fresh reads a day. `/mcp` takes 60 requests a minute from one address, and `/api/stats` and `/live.txt` take 30.
- The Eventbrite step is covered by tests against a stubbed Eventbrite API. I have not run it against a live Eventbrite account yet.

## Run it locally

Node 22.18 or newer on Linux or macOS.

```sh
npm ci
npm run dev
```

This builds the web app, starts a fake Qloo server that answers in Qloo's shapes, and runs the Worker with `wrangler dev`. It prints the local URL. Ctrl+C stops everything.

On live Qloo data, keep the key out of your shell history:

```sh
read -rs QLOO_API_KEY && export QLOO_API_KEY
LIVE=1 npm run dev
```

The script writes the key to a `.dev.vars` only you can read and deletes it when it stops. With `CLOUDFLARE_API_TOKEN` set, the Workers AI binding runs remotely. Without it, plans use template copy.

## Test

```sh
npm run check   # typecheck and unit tests
npm run build   # web app into web/dist
npm run e2e     # Playwright, headless, against wrangler dev and the fake Qloo server
```

Unit test fixtures are small hand written JSON shaped like Qloo's answers. The end to end run starts the Worker without the AI binding, so plans use templates, then restarts it without a key to check the page that says so. On 29 October 2026 all 514 unit tests and all 36 end to end specs passed, plus the key missing spec.

`npm run probe` and `npm run live-read` run against the live API with `QLOO_API_KEY` set. They keep every raw answer in `../raw/live/`, beside the clone, so no Qloo response ever lands in the repository.

## Deploy for free on Cloudflare

```sh
npm ci
npm run build
npx wrangler login
npx wrangler deploy
npx wrangler secret put QLOO_API_KEY
openssl rand -hex 32 | npx wrangler secret put TOKEN_SECRET
curl https://fullhouse.<subdomain>.workers.dev/api/health
```

For the owner email, also set `RESEND_API_KEY` and `RESEND_FROM` (a sender on a domain you verified with Resend). Without both, email stays off.

The Workers Free plan covers it: SQLite Durable Objects, the Cache API and a daily Workers AI allowance are included. The dry run bundle is 1646.04 KiB, 397.58 KiB gzipped. A street read stays well inside the 50 subrequests a free invocation gets: 12 Qloo calls and at most 10 Cache API operations.

## Security

The Qloo key lives only in the Worker secret and travels only in the request header. It never reaches the browser, a log line, a response body or the call list the owner sees. Owner links carry an HMAC token after the `#`, compared in constant time. Eventbrite tokens are sealed with AES-GCM under a key derived from `TOKEN_SECRET` and never returned. The API and the MCP endpoint refuse writes from any other origin, bodies are capped at 64 KB, limits are counted under a salted hash of the caller's IP address, and API and event page responses carry strict security headers. Server rendered pages escape every user string.

To report a vulnerability, use GitHub private vulnerability reporting on this repository: Security tab, then "Report a vulnerability". Details are in `SECURITY.md`.

## Repository map

| Path | What it is |
| --- | --- |
| `src/shared` | Types, words, distance and the turnout rule every layer shares, and the colour tokens |
| `src/core/qloo` | Qloo client: request builder, retries, cache and budget hooks, parsers, provenance |
| `src/core/street` | The street read, one step per Qloo call, with reasons and limit lines |
| `src/core/planner` | Night formats, scoring, partners, menu ideas, playlist, slot dates |
| `src/core/copy` | Brief, prompt, claim checker, templates, owner edits |
| `src/core/refine` | Turning a change request in plain words into plan settings |
| `src/core/baseline` | The Proof tab: the plain model ask and the name checks against Qloo search |
| `src/worker` | Hono app, routes, owner tokens, meter, MCP server, Workers AI adapter |
| `src/worker/qloo` | Qloo caches, budget and error mapping for the Worker |
| `src/worker/qr` | The QR encoder for the poster |
| `src/worker/venue` | The venue's Durable Object: records, planning, publishing, the Monday run |
| `src/worker/stats` | The live numbers: counters, Qloo call times, the public log and the owner's Numbers tab |
| `src/worker/actions` | Event page, calendar file, mail drafts, Eventbrite, owner email |
| `src/worker/pages` | Server rendered event page and poster |
| `web/src` | The owner app: pages, UI pieces and styles |
| `test` | Unit tests and hand written fixtures |
| `e2e` | Fake Qloo server and Playwright specs |
| `scripts` | Local dev and e2e runners, the live probe and the live read |
| `media` | The screenshots in this README: the Housing Works plan, read from the live Qloo API on 27 October 2026 |

## Licence

MIT. See `LICENSE`.
