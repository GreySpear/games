# Millhaven Transit Authority — Dev Log

> **Current status:** Playable core loop, two UIs on a shared sim core. `game.js` holds all rules; `index.html` (desktop schematic map) and `mobile.html` (phone-first text UI) render it and share one save (`mta_save_v3`). No build step — open either HTML file. **Both UIs are fleet-complete** (buy/select/route multiple trains) and **seasonal demand (§8) is live** — summer quiets University, winter spikes suburbs. Next: polish (wait-time → happiness, subsidies §7).

## Session 4 — 2026-07-28

### Seasonal demand curves — GDD §8
Demand now shifts with the calendar, driven entirely in `game.js`'s `spawnPassengers` (both UIs picked it up for free).
- **Seasons**: `seasonForMonth()` maps the month to Winter (Dec–Feb) / Spring (Mar–May) / Summer (Jun–Aug) / Autumn (Sep–Nov); `currentSeason()` reads `state.month`. Both exposed on `MTA`.
- **Per-district multipliers** (`seasonalDemandFactor`): University Quarter ×0.3 in summer (students gone — the §8 case + station character); suburbs (North/East/South) ×1.6 in winter, ×0.85 in summer (§8 commuter spike); Heritage/Tourism (Old Town) ×1.4 in summer, ×0.9 otherwise (leisure character). Everything else stays ×1.0.
- **Spawn math preserves the baseline**: draw the same 0–2 uniform as before, scale by the factor, then probabilistically round. `factor === 1` reproduces the old draw **exactly**, so non-seasonal stations/seasons are unchanged; a winter suburb can now spike past the old 2/month cap.
- **Surfaced in both UIs**: header date now reads e.g. `Jul 1962 · Summer`, and a station's detail shows a green "Busier than usual this summer" / red "Quieter than usual this winter" badge when its factor ≠ 1.
- **Verified**: a headless sim test (`seasontest.js`, 20 checks — season mapping, every factor value, and statistical spawn means over 8k trials confirming summer University ≈0.3, winter suburbs >1.35 and able to exceed 2, and Central's mean pinned at ~1.0 across seasons). Desktop jsdom smoke test (26 checks) and a mobile load check still green. Harnesses in the session scratchpad, not committed.

### Desktop fleet UI — GDD §6 (desktop now feature-parity with mobile)
Generalized `index.html` off its last `state.trains[0]` assumptions so the desktop map plays the same multi-train game the mobile UI already did. No sim changes — `game.js` already had `buyTrain`, per-train maintenance, and fleet-aware `dispatchTrain`; this was pure render/UI work.
- **Selected-train model**: added `getSelectedTrain()` / `selectTrain()` backed by a persisted `state.selectedTrainId` (falls back to the first train if missing/stale), so the panel's focus and an in-progress route edit survive a reload. Route editing (`setRouteEditMode`, `saveRouteDraft`, `cancelRouteEdit`, the banner) now all operate on the selected train instead of `trains[0]`.
- **Pinned Fleet panel, now fleet-aware**: a horizontal **roster** of train chips (name · cap · routed/idle · @station) appears once you own more than one train; tapping one focuses it (and abandons any half-built route draft, matching mobile). Below the selected train's card + route + Dispatch sits a **Buy a Train** section listing each `TRAIN_TYPES` entry with specs/cost — a Buy button (disabled when short on cash) or a rep-lock badge below its reputation threshold. Buying focuses the new train.
- **Station panel + map delint**: the station "Train / Dispatch" section lists **every** train present at that station (each with its own Set/Edit-route + Dispatch), plus a note for any train passing through on its route. On the map, trains sharing a station **stack vertically** instead of overlapping, and the selected train's icon is **ringed** in red.
- **Verified** headlessly: a jsdom smoke test drives the real `index.html` (26 checks — load with no errors, buy gating by cash/rep, roster grows + selection, route edit lands on the *selected* train while Old Betsy's route stays empty, station panel lists both trains with only the routed one dispatchable, two ringed/stacked train icons). Harness lives in the session scratchpad (`desktoptest.js`), not committed.

## Session 3 — 2026-07-22

### Mobile real-device hardening + persistent control board
Real-device pass on `mobile.html` (served via GitHub Pages off the feature branch).

- **Layout hardening for phones**: `viewport-fit=cover` so `env(safe-area-inset-*)` actually resolve; header padded past the notch/status bar (top) and rounded corners (sides); bottom nav extended to landscape side insets; `-webkit-tap-highlight-color: transparent`; `overscroll-behavior: none` to kill page rubber-band / pull-to-refresh.
- **Persistent control board** (replaces the per-tab town mini-map): a dispatcher's mimic panel pinned between header and the scroll area, **visible on every tab**. Dark screen with scanline/vignette, glowing built-track lines vs faint dashed unbuilt conduit, station indicator lamps (lit = unlocked), per-station queue LEDs (green/amber/red by load), a pulsing train locator halo, and a mono status ticker (train position + next stop, station/track counts). Tapping any lamp jumps to that station's detail from any tab. Dropped the `map_background.png` photo underlay — the board is now a pure schematic. `renderControlBoard()` runs on every `renderAll()`; `prefers-reduced-motion` disables the blink/pulse.

### Fleet expansion — GDD §6 (mobile now feature-complete)
Buying and running multiple trains, done once in `game.js` so desktop can adopt it later too.
- **Shared sim (`game.js`)**: `TRAIN_TYPES` catalog (Refurbished Diesel 6/med, EMU 8/fast, Modern Metro 10/fast) with per-type cost, maintenance, and a **reputation gate** (40/55/75) — electrification stays out of scope (§11), so "electric" is flavour + capacity, not a track system. New `buyTrain(typeId)` op returns `{ok,reason,train}`, parks the train at the first unlocked station, and assigns a unique id via `state.nextTrainId`. Each train now carries its own `maintenance`; `endMonth` **sums per-train maintenance** instead of `count × 60`. Added `normalizeState()` at load so **pre-fleet saves migrate** (backfills `maintenance`/`typeId`/`manifest`/`nextTrainId`) — a game started in Session 2 keeps working.
- **Mobile Train tab**: now fleet-aware. A horizontal **fleet roster** (chips: name · cap · routed/idle · @station) picks which train the tab controls (`ui.selectedTrain`); switching trains clears any half-built route draft. Route edit/dispatch operate on the selected train. A **Buy a Train** section lists each type with specs/cost and a Buy button (disabled when short on cash, shown as rep-locked below its threshold). Delinted the last `trains[0]` render assumptions: the Stations-list "Train" badge and the station-detail Trains section now handle **any number of trains** at a station (badge shows `×N`; detail lists each with its own Dispatch/Set-route).
- **Verified** headlessly: a Node sim harness (17 checks — buy gating, cash math, per-train maintenance, legacy-save migration) and a **jsdom UI smoke test** (17 checks — board renders 12 lamps + halos, buy grows the roster, train selection, multi-halo board, station detail lists both trains) both pass with no runtime errors. Harnesses live in the session scratchpad (`simtest.js`, `domtest.js`), not committed.

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
