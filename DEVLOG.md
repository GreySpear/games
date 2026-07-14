# Millhaven Transit Authority — Dev Log

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

## Session 2 — 2026-07-14

### Milestone 4 — Fleet expansion
Generalized the game from one hardcoded train to a purchasable, multi-train fleet (GDD §6). Save key bumped to `mta_save_v4` (silent reset — instance shape changed).

### What was built
- **`TRAIN_TYPES` catalog** (new top-of-script constant): each type carries `capacity`, `speedLabel`, `maintenance`, `purchaseCost`, `scrapValue`, `unlockYear`, `flavor`. Train instances now store only `{ id, typeId, name, route, posIndex, dir, atStation, manifest }` — capacity/speed/maintenance/flavour are derived from the type, not duplicated. Old Betsy stays the starter (`diesel`).
- **Fleet panel tabs** (`renderFleetPinned`): a tab row (one per owned train, active highlighted) above the existing single-train detail view. Below the detail: Edit Route + Dispatch (act on the selected tab), plus a **Buy Train** toggle and a **Retire** button. Buy Train expands an inline section (no blocking modal — kept per Session 1's removal) listing purchasable types whose `unlockYear ≤ current year`, each with capacity/speed/maintenance and a cost button disabled when cash is short. Retire uses `confirm()`, credits scrap value, and is disabled when only one train remains.
- **Per-train route editing**: `setRouteEditMode(on, trainId)` records `state.editingTrainId`; `updateModeBanner`, `cancelRouteEdit`, `saveRouteDraft` all key off it. Editing from either the fleet panel or the station panel also syncs `activeTrainId`.
- **Station panel** (`renderTrainSection`): now lists *every* train currently at the selected station (each with its own Dispatch/Edit Route), with sensible on-route / no-train fallbacks for multiple trains.
- **Economy** (`endMonth`): maintenance is the sum of each train's type maintenance (replaced flat `MAINTENANCE_PER_TRAIN × count`; constant removed). Summary still shows one Maintenance line.
- **Map** (`renderMap`): trains sharing a station are offset vertically (15px per extra train) so they don't render on top of each other.
- New state fields: `editingTrainId`, `activeTrainId`, `buyPanelOpen`, `nextUnitNum` (purchases auto-name "Unit 02", "Unit 03"…).

### Constants chosen (tunable, sanity-checked vs fare = $8 × hops, ×2 The Hill)
| Type | Cap | Speed | Purchase | Maint/mo | Scrap | Unlocks |
|---|---|---|---|---|---|---|
| Old diesel (starter) | 4 | Slow | — (free) | $60 | $300 | — |
| Refurbished diesel | 6 | Medium | $2,500 | $90 | $1,000 | 1965 |
| Electric multiple unit | 8 | Fast | $4,500 | $130 | $1,800 | 1972 |
| Modern metro car | 10 | Fast | $7,000 | $170 | $2,800 | 1980 |
Scrap ≈ 40% of purchase; starter given a nominal $300.

### Key decisions
- **Buy list excludes the starter diesel** (`purchaseCost 0`) — buying free trains would be an exploit; only the three paid upgrades appear.
- **Tabs, not a manager screen** (resolves GDD §12 open question toward per-train tabs in the existing pinned panel) — no new blocking modal over the map.
- Electrification is not modelled — EMU/metro simply unlock by year (GDD §11).

### Verified
Throwaway Playwright script (scratchpad, not in repo) against `file://index.html`: fresh load with zero console errors; seed cash + year → Buy panel lists exactly the 3 unlocked types; buy metro → cash deducted, auto-named "Unit 02", stabled at Central, tabs render and switch; set + save a route on train 2 and dispatch it (advances one leg); two offset train icons on the map; end month maintenance = $230 (diesel 60 + metro 170); retire train 2 credits $2,800 scrap and resets the active tab; last-train retire button disabled. All 26 checks passed, no console errors across the run.

### Left out (out of scope for this milestone)
Player renaming of trains; age-based maintenance scaling (GDD §6 mentions age — maintenance is currently flat per type); speed actually affecting trips-per-month (still one leg per Dispatch click regardless of `speedLabel`). Known quirk: retiring a train with passenger groups aboard discards them (no fares, no return to queue) — revisit if it turns out to matter in play.
