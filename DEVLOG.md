# Millhaven Transit Authority — Dev Log

> **Current status:** Playable core loop, two UIs on a shared sim core. `game.js` holds all rules; `index.html` (desktop schematic map) and `mobile.html` (phone-first text UI) render it and share one save (`mta_save_v3`). No build step — open either HTML file. Next: fleet expansion (GDD §6), then seasonal demand (§8).

## Session 2 — 2026-07-15

### State at end of session
Two ways to play, one game. `index.html` (desktop schematic map) and `mobile.html` (phone-first text UI) now sit on top of a shared, UI-agnostic simulation in `game.js`. Both load `game.js` via `<script src>` and read/write the **same save** (`mta_save_v3`), so a game started in one opens in the other in the same browser. No build step; open either HTML file directly. Branch: `claude/mobile-only-redesign-t8cgks`.

Files: `game.js` (new, sim core) · `index.html` (now render-only) · `mobile.html` (new) · `map_background.png` (shared art) · `Claude.md` (GDD) · `DEVLOG.md`.

Commits this session:
- `27e67f4` Add mobile-only text-first UI (mobile.html)
- `8a0f1a3` Extract shared simulation core into game.js

### Mobile-only text-first version ([mobile.html](mobile.html))
A second UI over the same simulation, aimed at phones: less map, more text. Kept in the same repo (not a fork) so sim changes only need to be made once, and **it shares the same save** (`mta_save_v3`) — progress carries over between `index.html` and `mobile.html` in the same browser.

### Structure
Bottom tab bar: **Stations / Train / Build / End Month**.
- **Stations**: small non-interactive-ish town mini-map (tap a node to open its station) above a station list — each row shows queue depth (`n/6 waiting`, red at overflow), a `TRAIN` badge when the train is there, or unlock cost/rep when locked.
- **Station detail**: same info/unlock-checklist/queue-sort sections as desktop, plus Dispatch when the train is present.
- **Train**: train card, **onboard manifest** (new — desktop doesn't show this), and a vertical route strip (line-diagram style) with the train's position and next direction. Route editing is fully text-based: candidate "next stop" chips are computed from built track out of the last draft stop, so invalid routes can't be entered.
- **Build**: every connection as a list row — Built / Build $750 / locked-with-reason. No map interaction at all.

### Notes
- Mobile UI state (active tab, route draft) lives in memory only and is never persisted, so it can't pollute the shared save. `buildMode`/`routeEditMode` from desktop saves are cleared on load.
- Verified end-to-end headlessly (Playwright + system Chromium): fresh start, track build, route set, dispatch + fare collection, ping-pong, queue sort, end-month summary, and save round-trip desktop↔mobile.

### Shared simulation core ([game.js](game.js)) — refactor
Pulled all game data + rules out of both HTML files into `window.MTA` (loaded via `<script src="game.js">`). Both `index.html` and `mobile.html` are now **render-only**: they alias the shared helpers (`stationById`, `isTrackBuilt`, `sortQueueEntries`, …) so existing render code reads unchanged, and wrap the four mutating ops.
- **UI-agnostic sim**: `game.js` has no DOM/alert/render. Mutating ops return results instead of rendering — `unlockStation`→`{ok,reasons}`, `buildTrack`→`{ok,reason}` (reason non-null only when worth an alert, e.g. short on cash), `dispatchTrain`→bool, `endMonth`→summary object. Each page's thin wrapper surfaces errors + re-renders in its own idiom.
- **Shared state**: `MTA.state` is a single stable object reference (loaded once from `mta_save_v3`); sim ops mutate in place and never reassign it, so `var state = MTA.state` captured per-page stays valid. `MTA.init()` does the one-time passenger seed.
- **Route-editing UIs stay per-page** — desktop edits on the map (banner + chips), mobile via candidate-chip list — since only the core rules are shared, not the interaction. Balance/rule changes now happen once in `game.js`.
- Re-verified: 18 cross-file checks (mobile flow + desktop flow + round-trip) pass with no page errors.

### Next up (carried from Session 1 — now write once in `game.js`)
1. **Fleet expansion** — buy a second train, train types/upgrades per GDD §6. The old "hardcoded to `state.trains[0]`" caveat still applies in the *render* layers (desktop pinned panel + route editing, mobile Train tab both assume one train); the sim ops (`dispatchTrain`, maintenance in `endMonth`) already loop over `state.trains`, so generalizing is mostly UI work now.
2. **Seasonal demand curves** (GDD §8): summer quiets University stations, winter boosts suburbs — belongs in `spawnPassengers`.
3. **Polish**: wait-time → happiness consequences beyond queue overflow; government subsidies for underserved districts (GDD §7); real-device pass on the mobile layout.

### Verification harness (not committed)
Headless checks live in the session scratchpad (`verify.js`, `verify2.js`) using `playwright-core` + system Chromium (`/opt/pw-browsers/chromium-1194/...`). They drive the real pages via `file://` and assert on `localStorage`. Note: cross-file save sharing only works within a single Playwright **context** (`browser.newContext()` once, then `context.newPage()`), since `file://` localStorage is per-context. Not part of the repo — reconstruct from the DEVLOG if needed.

## Session 1 — 2026-07-13

### State at end of session
Playable core loop in a single file ([index.html](index.html)), no build step, saves to `localStorage` (`mta_save_v3`). Open `index.html` directly in a browser to play.

### What was built (in order)
1. **Milestone 1 — Map shell**: SVG schematic map (800×720 viewBox, 80px grid, 45°/90° angles), 12 stations, click-to-select side panel, header stats (date/cash/reputation), End Month button. Start: Central + Docks unlocked, $5,000, rep 50, Jan 1962.
2. **Milestone 2 — Track, fleet, dispatch**: Build mode (tap dashed connections, $750/segment); route editing directly on the map with a banner UI (chips + Undo/Clear/Cancel/Save); starter train "Old Betsy" (4 groups, slow); Dispatch moves one leg per click, ping-pongs at route ends.
3. **Milestone 3 — Passengers & economy**: 0–2 groups/station/month spawn at unlocked stations; fare = $8 × BFS hop distance (×2 if origin/dest is The Hill); queues sortable by wait/destination/fare (max 6 groups/station); auto-load eligible groups up to capacity on dispatch, fares collected on arrival; monthly summary modal (fares − maintenance $60/train − staff $120 + $15/extra station).
4. **Station unlocking**: per-station cost + reputation requirements (Foundry $1,200/rep 30 → The Hill $3,500/rep 70), plus adjacency gating (needs an unlocked neighbor). Unlock UI in the side panel with live requirement checklist. Reputation moves monthly: +1 if any fares served, −1 per overflowing queue.

### Key decisions
- **Geographic underlay** (reverses GDD §11 out-of-scope item; GDD updated): user-generated flat-vector city art (`map_background.png`) renders under the schematic. Decorative only — the schematic layer stays the functional map.
- **Fleet modal removed**: train status/route/dispatch controls live permanently pinned at the top of the right sidebar. Route editing happens on the map itself (modal used to block map clicks — the original "can't build routes" bug).
- **Quick dispatch**: selecting the station a train is at also shows Dispatch/Edit Route in the station panel.
- **Light map theme**: station/label/track colors restyled for the light cream background (navy nodes + amber rings unlocked; off-white + dashed navy ring locked; navy labels with cream halo; red selection ring).

### Background image workflow (repeatable)
The art is AI-generated from prompts (kept in chat history; regenerate as needed). To fit new art:
1. Pixel-sample water vs land under all 12 station viewBox positions (water ≈ `b > r+25 && b > g+5` for the current palette — beware navy rooftops false-positive).
2. Grid-search zoom/offset minimizing weighted water contact (Central weighted highest) while keeping composition (limit zoom ~1.0–1.2× or the search crops out all the scenery).
3. Apply as the `<image>` x/y/width/height in `renderUnderlay()`. Current: `x=-16, y=-24, w=1536, h=864` for the 1280×720 art.
- `map_background_old.png` = previous (dense widescreen) art, kept as backup. The two dated PNGs are the session's candidates; the `...649.png` one is live.

### Station grid (viewBox coords = col/row × 80 + 80)
Central (5,4) · Docks (3,6) · Foundry (2,7) · University (3,2) · Collegiate (2,1) · Old Town (9,6) · Market Square (7,4) · The Hill (8,2) · Ashford (5,2) · Greenway (7,0) · Riverside (5,6) · Newfield (3,8)

### Known quirks / tech notes
- Save key is versioned (`mta_save_v1/2/3`); bumping it silently resets saves — fine during dev.
- `localStorage.clear()` in the browser console = fresh game.
- Browser-pane screenshot tool times out in this dev environment; verify via DOM/JS inspection instead.
- Fare/spawn/cost constants are all at the top of the script block for easy tuning.

### Next up (agreed priority)
1. **Fleet expansion** — buy second train, train types/upgrades per GDD §6 (currently hardcoded to `state.trains[0]` in several places: route editing, pinned panel — needs generalizing).
2. Seasonal demand curves (GDD §8): summer quiets University stations, winter boosts suburbs.
3. Polish: mobile layout testing, wait-time → happiness consequences beyond queue overflow, government subsidies for underserved districts (GDD §7).
