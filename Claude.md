# Millhaven Transit Authority — Game Design Document
**Version 0.1 | Working Document**

---

## 1. Overview

**Title:** Millhaven Transit Authority (working title)
**Platform:** HTML5 — browser-based, playable on desktop and mobile
**Genre:** Puzzle / management sim
**Perspective:** Top-down schematic (metro map style)
**Scope:** Single-player, open-ended, no win condition

### Elevator Pitch
You are the newly appointed director of Millhaven's struggling city transit department. You inherit two stations, one ageing train, and a modest budget. Your job: connect the whole city, keep the trains running, and turn a profit — one queue at a time.

---

## 2. The City: Millhaven

A fictional mid-sized city. The map is **fixed and identical every playthrough**. Station locations are pre-set. Routes are not — the player builds them.

The map is rendered as a **schematic diagram** (metro map style): clean lines, 45° angles, colour-coded lines, node-based stations. The schematic layer is the functional map — not geographically accurate.

> **v0.2 decision:** an invented, non-canonical city geography (river, parks, industrial zone, street grid) is rendered as a faint decorative underlay beneath the schematic layer, purely for atmosphere. It has no gameplay function and isn't meant to be a "real" city plan — see §11.

### Districts & Stations (12–16 total)

| # | Station | District | Character |
|---|---|---|---|
| 01 | Central | City Centre | Main hub. Highest footfall. Connects to everything eventually. |
| 02 | Millhaven Docks | Industrial | Shift workers. Strong AM/PM peak. Low fares, high volume. |
| 03 | Foundry Street | Industrial | Adjacent to Docks. Factory workers. Similar demand profile. |
| 04 | University | University Quarter | Students. High volume, lower fares. Quiet in summer. |
| 05 | Collegiate Road | University Quarter | Postgrad housing and faculty. Steadier demand than University. |
| 06 | Old Town | Heritage/Tourism | Tourists and leisure travellers. Weekend peaks. |
| 07 | Market Square | Commercial | Shoppers and office workers. Midday busy. |
| 08 | The Hill | Wealthy Residential | Low volume, premium fares. Prestige route. |
| 09 | Ashford | Suburb North | Commuters. Predictable morning/evening peaks. |
| 10 | Greenway | Suburb East | Commuters. Long distance from centre — costly to serve, good fares. |
| 11 | Riverside | Mixed Residential | Steady mid-range demand. Good connector node. |
| 12 | Newfield | Suburb South | New development. Low demand early, grows over time as city expands. |

> **Starting stations:** Central (01) and Millhaven Docks (02).

---

## 3. Core Gameplay Loop

```
Passengers arrive at stations → Player manages queue → Player dispatches train
→ Train travels route, stops at stations → Passengers unloaded/loaded automatically
→ Fares collected → Player earns revenue → Player invests in network
→ New stations unlock → Repeat
```

### Step by Step

1. **Passengers arrive** at stations and join the queue. Each passenger group (5 people) has a destination badge visible in the queue.
2. **Player sorts the queue** — by arrival time (default), destination, or fare value. This is the key moment-to-moment decision.
3. **Player dispatches the train** on a set route. The train auto-loads the top groups from the queue that match the route and fit within capacity.
4. **Train travels the route**, stopping at each station. Passengers bound for that stop are automatically unloaded. New passengers are auto-loaded from that station's queue.
5. **Fares are collected** on arrival at each destination.
6. **Revenue and costs** are tallied monthly. Player uses profit to expand the network.

---

## 4. Passenger System

### Passenger Groups
- Passengers travel in **groups of 5**
- Each group has one destination
- Groups are the atomic unit — you load/unload groups, not individuals

### Train Capacity
- Starter train holds **4 groups (20 passengers)**
- Upgraded trains hold more groups
- Capacity is a hard limit — you cannot overload

### Queue Management
- Each station has a **waiting queue** displayed visually
- Queue shows: destination badge, fare value, wait time indicator
- Player can re-sort the queue before dispatch:
  - **By wait time** (default — first come, first served)
  - **By destination** (group by where they're going)
  - **By fare value** (highest revenue first)
- The train auto-loads the top N groups that fit the route and capacity
- Player can manually swap groups before confirming dispatch (optional intervention, not required)

### Passenger Happiness
- Groups accumulate wait time. Waiting too long = unhappy group.
- Unhappy passengers reduce your **Reputation score**
- Reputation affects government subsidy eligibility and unlocking new stations
- Happiness is forgiving early game, tighter as the network grows

---

## 5. Routes & Track

### Building Routes
- A route is a sequence of stations: e.g. **Central → Riverside → Ashford**
- Player draws routes by connecting unlocked stations
- A route needs: (a) track laid between each station pair, and (b) a train assigned

### Track
- Track must be **purchased and laid** between station pairs
- Cost varies by segment:
  - Flat urban: cheap
  - River crossing: moderate (bridge cost)
  - Tunnel (e.g. under The Hill): expensive
- Track is permanent once built — no demolition in v1

### Route Rules
- A train is assigned to one route at a time
- Routes can share track segments (two trains can use the same stretch of track)
- No collision system in v1 — keep it simple

---

## 6. Fleet Management

### Trains
Each train has:
- **Capacity** — number of passenger groups it can carry
- **Speed** — affects how many trips per month it completes
- **Age** — older trains cost more to maintain
- **Maintenance cost** — monthly fixed cost regardless of use

### Starter Train ("Old Betsy")
- Capacity: 4 groups
- Speed: slow
- Maintenance: low (it barely runs but it barely costs)
- Flavour: a rattling diesel from the 1950s

### Progression
New train types unlock over time. Older trains can be retired (sold for scrap value).

| Era | Train Type | Capacity | Speed | Notes |
|---|---|---|---|---|
| Early | Old diesel (starter) | 4 groups | Slow | Cheap to run |
| Mid | Refurbished diesel | 6 groups | Medium | First upgrade |
| Mid | Electric multiple unit | 8 groups | Fast | Requires electrified track |
| Late | Modern metro car | 10 groups | Fast | High capacity, high cost |

---

## 7. Finances

### Revenue
- **Fares** — collected when a passenger group reaches their destination
- Fare value = base rate × distance (number of stops)
- Premium districts (The Hill) have a fare multiplier

### Costs
- **Track laying** — one-time capital cost
- **Train purchase** — one-time capital cost
- **Maintenance** — monthly cost per train (scales with age)
- **Staff** — monthly fixed overhead (small, grows slightly with network size)

### Government Subsidies
- Available if you serve **underserved districts** (Docks, Foundry Street, Newfield)
- Subsidy amount tied to your **Reputation score**
- Applied as a monthly bonus payment
- Encourages the player to run socially useful but less profitable routes

### Budget Cycle
- Finances calculated **monthly**
- Player sees a simple monthly summary: revenue, costs, net profit/loss, cash balance
- Going into the red doesn't immediately end anything — but sustained losses unlock a "council warning" event (future feature)

---

## 8. Time System

- Each **turn = 1 month**
- Player advances time manually (clicks "End Month")
- Seasons affect demand:
  - **Summer:** University stations go quiet
  - **Winter:** Suburb commuter demand spikes
  - **Weekends (toggle):** Old Town and leisure stations peak — *optional complexity, decide later*

### Progression Pacing (approximate)

| Years | Phase | Focus |
|---|---|---|
| 1–3 | Scrappy startup | Survive on 2 stations. Upgrade the starter train. |
| 3–8 | Expansion | Unlock 4–6 new stations. Lay new track. Open new routes. |
| 8–15 | Network building | Serve outer suburbs. Manage multiple trains and routes. |
| 15+ | Mature system | Optimise queues, modernise fleet, reach full city coverage. |

---

## 9. Station Unlocking

- Stations are **locked** at game start (except Central and Docks)
- Unlocking a station costs money and requires a minimum **Reputation score**
- Some stations also require a prerequisite station to be connected first (adjacency unlock)
- Unlock order is partially guided but player has some choice

### Suggested unlock path (not rigid):
```
Central → Docks (start)
         ↓
    Foundry Street   Market Square   Riverside
                          ↓
                     Old Town    University
                                     ↓
                               Collegiate Road   Ashford
                                                    ↓
                                              Greenway   The Hill   Newfield
```

---

## 10. Visual Design

### Map Style
- **Schematic metro map** — not geographic
- Clean lines, 45° and 90° angles only
- Station nodes are circles or rounded squares
- Lines are colour-coded by route
- Inspired by: London Underground map, NYC Subway diagram

### UI Layout (schematic)
```
┌─────────────────────────────────────────┐
│  HEADER: Month/Year | Cash | Reputation │
├──────────────────┬──────────────────────┤
│                  │  SELECTED STATION    │
│   MAP VIEW       │  ─────────────────  │
│                  │  Queue (sortable)    │
│  (tap station    │  [Group → Dest $X]   │
│   to select)     │  [Group → Dest $X]   │
│                  │  [Group → Dest $X]   │
│                  │  ─────────────────  │
│                  │  Train: [Route ▼]    │
│                  │  [Dispatch]          │
├──────────────────┴──────────────────────┤
│  FOOTER: [End Month] [Build] [Fleet]    │
└─────────────────────────────────────────┘
```

### Aesthetic Direction
- Palette: muted transit authority colours — navy, amber, off-white, with route line colours as accents
- Typography: clean, utilitarian — a mono or semi-condensed sans for numbers and data, humanist sans for UI text
- Tone: slightly retro municipal — think 1960s public transport authority, not slick tech startup
- Avoid: glossy gradients, drop shadows, anything that looks like a mobile game from 2015

---

## 11. Out of Scope (v1)

These are explicitly **not** in the first version. Document them here so they don't creep in:

- ❌ Freight / cargo lines
- ❌ Competitor AI
- ❌ Random breakdown events
- ❌ Free-form map drawing
- ❌ Geographic / realistic map **as the functional map** (the schematic stays the interactive layer — see v0.2 decision in §2 for the decorative underlay exception)
- ❌ Politics / council approval mechanics
- ❌ Multiplayer
- ❌ Electrification as a separate system (trains just unlock over time)

---

## 12. Open Questions

These need a decision before or during development:

- [ ] Does the player name their transit authority, or is it always "Millhaven Transit Authority"?
- [ ] Weekend toggle — simplify to just monthly demand curves, or model weekends separately?
- [ ] How are multiple trains managed? Does each train get its own dispatch UI, or is there a global train manager screen?
- [ ] What happens when a queue overflows? Cap it, or let passengers "leave" and take a reputation hit?
- [ ] Is there a debt/loan system for big capital purchases (e.g. a tunnel)?
- [ ] Freight lines — if added later, do they use the same track or parallel freight-only track?

---

## 13. Technical Notes (for Claude Code)

- **HTML5 / Vanilla JS** preferred for portability — no heavy framework unless complexity demands it
- **Canvas or SVG** for the map — SVG preferred for tap/click interaction on mobile
- **Mobile-first layout** — touch targets minimum 44px, queue sortable by drag or tap
- **No backend** — all state lives in `localStorage`; game saves automatically each month
- **Single HTML file** for easy sharing and offline play (CSS and JS inline or bundled)

---

*Last updated: v0.1 — initial brainstorm. Expand as decisions are made.*
