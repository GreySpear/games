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
