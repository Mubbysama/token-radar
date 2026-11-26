# Token Radar

A token-launch radar: given a snapshot of DeFi protocols, it scores every
protocol that still records no token and ranks them by what a token launch
would be worth, then serves the result as a static dashboard page with no
framework and no network. TypeScript, Node 22, standard library only.

## What it does

`main.ts` reads a snapshot (`snapshot.json`: an `as_of` date, a `source`, a
`floor_usd`, a list of protocols with TVL, 7-day change, market cap, listing
date and token identifiers, and a watchlist of slugs) and hands it to the
model in `lib/model.ts`. The model:

- **Ranks pre-token protocols only.** A protocol counts as pre-token when the
  snapshot records no market cap, no CoinGecko id and no symbol for it.
  Wrapped, staked and bridged products, exchanges, and versioned pools
  (names ending in `V2`, `v3`, `1.0` and the like) are kept out by the same
  rule the watchlist uses — no protocol name is ever special-cased.
- **Scores each one with an implied value:** TVL × 0.25, adjusted by recent
  growth (7-day change clamped to −60%…+300%, weighted 0.4) and by a
  launch-window multiplier on the protocol's age — young protocols ramp up
  from 0.7, the prime window of roughly 6 to 24 months after tracking starts
  scores 1.0, and protocols tracked for over two years with no token decay
  back toward 0.7. The idea: a protocol is likeliest to launch in its prime
  window, with real TVL behind it.
- **Writes a farm plan for each ranked protocol:** six steps derived from
  the protocol's own category, chains, TVL and age — how much capital, what
  action, how long to hold — never from a hand-written list of names.
- **Keeps live-token protocols apart:** the top 24 by market cap are shown
  at the market's own value in a separate Live view, never mixed into the
  ranking.

The output is `board.json` (the ranked board), `data.js` (the same data for
the dashboard), the `dashboard/` page (search, category and chain filters,
sorting, a detail panel per protocol with the model breakdown and farm plan),
and `dossier.json`, a canonical summary of the dashboard and its screenshots
built with the vendored library in `vendor/`.

## How to run it

Node 22 or later (type stripping is on by default in recent Node 22
releases; on an older one, run with `--experimental-strip-types`):

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Then open `out/dashboard/index.html` in a browser (it reads the
`data.js` beside it; no server needed).

Two things to know before running it:

- The snapshot is an input, not part of this repository: bring your own
  `snapshot.json` in the shape described above (the fields are listed in
  `SnapshotProtocol` and `Snapshot` at the top of `lib/model.ts`).
- The program expects three screenshots in `screenshots/` (a board view, a
  detail view and a filtered view) and refuses to finish without them.
  They are binary images, so they are not in this repository — add your own
  three PNG or JPEG files to `screenshots/` to run it end to end. The board
  and dashboard are still written before that check.

## What is whose code

- `main.ts`, `lib/model.ts` and `dashboard/` are my code.
- `vendor/makefun-board.ts` is make.fun's dashboard-dossier library,
  vendored as the bounty required (its own header says so) — not my code.
  It builds the canonical `dossier.json` from the dashboard and screenshots.

## What it achieved

Entered in the make.fun token-radar-01 bounty (a $1,325 prize pool, top 10
paid). On the sealed snapshot it scored a **198-row board** — the 40
watchlist protocols plus 158 pre-token protocols the watchlist had left out,
including 20 above-floor protocols (the top-ranked at $695.9M implied value
on $2.76B TVL). Two runs produced byte-identical output, and the dev phase
scored it as a valid entry. Final result due 28 December 2026.

## License

MIT. See `LICENSE`.
