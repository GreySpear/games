/*
 * Millhaven Transit Authority — shared simulation core.
 *
 * This module owns all game data, state, and rules. It is UI-agnostic: no
 * DOM, no rendering, no alert(). Mutating operations change state, persist it,
 * and RETURN a result the caller uses to drive its own UI (show an error,
 * re-render, open a modal). Both index.html (desktop map) and mobile.html
 * (text-first) load this file and share the same save key, so a game started
 * in one opens in the other.
 *
 * Exposed as window.MTA. Pages typically alias the pieces they use, e.g.
 *   var state = MTA.state, stationById = MTA.stationById;
 * state is a stable object reference — sim ops mutate it in place and never
 * reassign it, so an alias captured once stays valid.
 */
(function (global) {
  'use strict';

  var GRID_UNIT = 80;
  var GRID_OFFSET_X = 80;
  var GRID_OFFSET_Y = 80;

  var STATIONS = [
    { id: 'central',      num: '01', name: 'Central',          district: 'City Centre',        character: 'Main hub. Highest footfall. Connects to everything eventually.', col: 5, row: 4, startUnlocked: true },
    { id: 'docks',        num: '02', name: 'Millhaven Docks',  district: 'Industrial',          character: 'Shift workers. Strong AM/PM peak. Low fares, high volume.', col: 3, row: 6, startUnlocked: true },
    { id: 'foundry',      num: '03', name: 'Foundry Street',   district: 'Industrial',          character: 'Adjacent to Docks. Factory workers. Similar demand profile.', col: 2, row: 7, unlockCost: 1200, unlockRep: 30 },
    { id: 'university',   num: '04', name: 'University',       district: 'University Quarter',  character: 'Students. High volume, lower fares. Quiet in summer.', col: 3, row: 2, unlockCost: 2000, unlockRep: 50 },
    { id: 'collegiate',   num: '05', name: 'Collegiate Road',  district: 'University Quarter',  character: 'Postgrad housing and faculty. Steadier demand than University.', col: 2, row: 1, unlockCost: 2200, unlockRep: 55 },
    { id: 'oldtown',      num: '06', name: 'Old Town',         district: 'Heritage/Tourism',    character: 'Tourists and leisure travellers. Weekend peaks.', col: 9, row: 6, unlockCost: 2400, unlockRep: 55 },
    { id: 'marketsquare', num: '07', name: 'Market Square',    district: 'Commercial',          character: 'Shoppers and office workers. Midday busy.', col: 7, row: 4, unlockCost: 1800, unlockRep: 45 },
    { id: 'thehill',      num: '08', name: 'The Hill',         district: 'Wealthy Residential', character: 'Low volume, premium fares. Prestige route.', col: 8, row: 2, unlockCost: 3500, unlockRep: 70 },
    { id: 'ashford',      num: '09', name: 'Ashford',          district: 'Suburb North',        character: 'Commuters. Predictable morning/evening peaks.', col: 5, row: 2, unlockCost: 1800, unlockRep: 45 },
    { id: 'greenway',     num: '10', name: 'Greenway',         district: 'Suburb East',         character: 'Long distance from centre — costly to serve, good fares.', col: 7, row: 0, unlockCost: 3200, unlockRep: 65 },
    { id: 'riverside',    num: '11', name: 'Riverside',        district: 'Mixed Residential',   character: 'Steady mid-range demand. Good connector node.', col: 5, row: 6, unlockCost: 1600, unlockRep: 40 },
    { id: 'newfield',     num: '12', name: 'Newfield',         district: 'Suburb South',        character: 'New development. Low demand early, grows over time.', col: 3, row: 8, unlockCost: 2000, unlockRep: 40 }
  ];

  var CONNECTIONS = [
    ['central', 'docks'],
    ['docks', 'foundry'],
    ['central', 'marketsquare'],
    ['marketsquare', 'oldtown'],
    ['central', 'riverside'],
    ['central', 'university'],
    ['university', 'collegiate'],
    ['central', 'ashford'],
    ['ashford', 'greenway'],
    ['ashford', 'thehill'],
    ['riverside', 'newfield']
  ];

  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var STATE_KEY = 'mta_save_v3';
  var TRACK_COST = 750;
  var QUEUE_MAX_PER_STATION = 6;
  var SPAWN_MAX_PER_STATION = 2;
  var BASE_FARE_PER_HOP = 8;
  var HILL_FARE_MULTIPLIER = 2;
  var MAINTENANCE_PER_TRAIN = 60; // starter/legacy fallback; each train carries its own now
  var STAFF_BASE = 120;
  var STAFF_PER_EXTRA_STATION = 15;

  // Passenger happiness (GDD §4). A group turns unhappy once it has waited past
  // the patience threshold, which starts forgiving and tightens as the network
  // grows. Unhappy groups cost reputation; groups that wait ABANDON_GRACE months
  // beyond patience give up and leave the queue.
  var BASE_PATIENCE = 6;
  var MIN_PATIENCE = 2;
  var PATIENCE_TIGHTEN_PER_STATION = 0.4;
  var ABANDON_GRACE = 3;
  var UNHAPPY_PER_REP_POINT = 3; // this many unhappy groups = -1 reputation

  // Government subsidies (GDD §7). Serving these socially-useful, lower-profit
  // districts earns a monthly bonus per served station, scaled by reputation.
  var UNDERSERVED_DISTRICT_STATIONS = ['docks', 'foundry', 'newfield'];
  var SUBSIDY_BASE = 20;
  var SUBSIDY_PER_REP = 1.2;

  // Buyable stock (GDD §6). Availability is gated by reputation so the fleet
  // grows as the authority earns its stripes — electrification is out of scope
  // (§11), so "electric" here is just flavour + capacity, not a track system.
  var TRAIN_TYPES = [
    { id: 'refurb-diesel', name: 'Refurbished Diesel',    capacity: 6,  speedLabel: 'Medium', cost: 3500,  maintenance: 90,  minRep: 40, flavor: 'Tidied-up branch-line diesel. Honest work.' },
    { id: 'emu',           name: 'Electric Multiple Unit', capacity: 8,  speedLabel: 'Fast',   cost: 6500,  maintenance: 130, minRep: 55, flavor: 'Clean, quick, quietly modern.' },
    { id: 'metro-car',     name: 'Modern Metro Car',       capacity: 10, speedLabel: 'Fast',   cost: 11000, maintenance: 180, minRep: 75, flavor: 'Big-capacity mainline stock. The future.' }
  ];

  function trainTypeById(id) {
    for (var i = 0; i < TRAIN_TYPES.length; i++) {
      if (TRAIN_TYPES[i].id === id) return TRAIN_TYPES[i];
    }
    return null;
  }

  function defaultState() {
    var unlocked = {};
    var queues = {};
    STATIONS.forEach(function (s) {
      unlocked[s.id] = !!s.startUnlocked;
      queues[s.id] = [];
    });
    return {
      month: 1,
      year: 1962,
      cash: 5000,
      reputation: 50,
      unlocked: unlocked,
      selected: null,
      trackBuilt: {},
      buildMode: false,
      routeEditMode: false,
      routeDraft: [],
      queues: queues,
      queueSort: 'wait',
      nextGroupId: 1,
      monthlyRevenue: 0,
      servedThisMonth: {},
      seeded: false,
      nextTrainId: 2,
      trains: [
        { id: 'old-betsy', typeId: 'starter', name: 'Old Betsy', capacity: 4, speedLabel: 'Slow', maintenance: MAINTENANCE_PER_TRAIN, flavor: '1950s diesel — rattles, but it runs.', route: [], posIndex: 0, dir: 1, atStation: 'central', manifest: [] }
      ]
    };
  }

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(STATE_KEY); } catch (e) {}
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return defaultState();
  }

  // Backfill fields added after a save was first written, so games started
  // before fleet expansion keep working (each train needs its own maintenance
  // + typeId now, and the buy counter must exist).
  function normalizeState(s) {
    if (!s.trains || !s.trains.length) s.trains = defaultState().trains;
    s.trains.forEach(function (t) {
      if (!t.manifest) t.manifest = [];
      if (!t.route) t.route = [];
      if (typeof t.posIndex !== 'number') t.posIndex = 0;
      if (typeof t.dir !== 'number') t.dir = 1;
      if (!t.atStation) t.atStation = t.route[0] || 'central';
      if (typeof t.maintenance !== 'number') t.maintenance = MAINTENANCE_PER_TRAIN;
      if (!t.typeId) t.typeId = 'starter';
    });
    if (typeof s.nextTrainId !== 'number') s.nextTrainId = s.trains.length + 1;
    if (!s.servedThisMonth) s.servedThisMonth = {};
    return s;
  }

  var state = normalizeState(loadState());

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function gx(col) { return GRID_OFFSET_X + col * GRID_UNIT; }
  function gy(row) { return GRID_OFFSET_Y + row * GRID_UNIT; }

  function stationById(id) {
    for (var i = 0; i < STATIONS.length; i++) {
      if (STATIONS[i].id === id) return STATIONS[i];
    }
    return null;
  }

  function connectionKey(a, b) {
    return [a, b].sort().join('|');
  }

  function findConnection(a, b) {
    for (var i = 0; i < CONNECTIONS.length; i++) {
      var pair = CONNECTIONS[i];
      if ((pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a)) return pair;
    }
    return null;
  }

  function isTrackBuilt(a, b) {
    return !!state.trackBuilt[connectionKey(a, b)];
  }

  var adjacency = null;
  function getAdjacency() {
    if (adjacency) return adjacency;
    adjacency = {};
    STATIONS.forEach(function (s) { adjacency[s.id] = []; });
    CONNECTIONS.forEach(function (pair) {
      adjacency[pair[0]].push(pair[1]);
      adjacency[pair[1]].push(pair[0]);
    });
    return adjacency;
  }

  function hopDistance(a, b) {
    if (a === b) return 0;
    var adj = getAdjacency();
    var visited = {};
    visited[a] = true;
    var queue = [{ id: a, dist: 0 }];
    while (queue.length) {
      var cur = queue.shift();
      var neighbors = adj[cur.id] || [];
      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        if (visited[n]) continue;
        if (n === b) return cur.dist + 1;
        visited[n] = true;
        queue.push({ id: n, dist: cur.dist + 1 });
      }
    }
    return null;
  }

  function computeFare(originId, destId) {
    var hops = hopDistance(originId, destId);
    if (hops === null || hops === 0) hops = 1;
    var fare = hops * BASE_FARE_PER_HOP;
    if (destId === 'thehill' || originId === 'thehill') fare *= HILL_FARE_MULTIPLIER;
    return Math.round(fare);
  }

  function unlockedStationIds() {
    return STATIONS.filter(function (s) { return !!state.unlocked[s.id]; }).map(function (s) { return s.id; });
  }

  // --- Seasons (GDD §8) ---------------------------------------------------
  // Northern-hemisphere calendar seasons keyed off the current month.
  var SEASONS = [
    { id: 'winter', label: 'Winter' },
    { id: 'spring', label: 'Spring' },
    { id: 'summer', label: 'Summer' },
    { id: 'autumn', label: 'Autumn' }
  ];

  function seasonForMonth(month) {
    // Dec/Jan/Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn.
    if (month === 12 || month === 1 || month === 2) return SEASONS[0];
    if (month >= 3 && month <= 5) return SEASONS[1];
    if (month >= 6 && month <= 8) return SEASONS[2];
    return SEASONS[3];
  }

  function currentSeason() { return seasonForMonth(state.month); }

  // Per-station multiplier on baseline demand for a given season. 1.0 leaves the
  // baseline spawn distribution untouched; the seasonal cases are the two called
  // out in §8 (University Quarter quiet in summer, suburbs spike in winter) plus
  // a modest heritage/tourism summer bump (Old Town's leisure character).
  function seasonalDemandFactor(station, seasonId) {
    var d = station.district;
    if (d === 'University Quarter') {
      return seasonId === 'summer' ? 0.3 : 1.0;
    }
    if (d === 'Suburb North' || d === 'Suburb East' || d === 'Suburb South') {
      if (seasonId === 'winter') return 1.6;
      if (seasonId === 'summer') return 0.85;
      return 1.0;
    }
    if (d === 'Heritage/Tourism') {
      return seasonId === 'summer' ? 1.4 : 0.9;
    }
    return 1.0;
  }

  function spawnPassengers() {
    var ids = unlockedStationIds();
    if (ids.length < 2) return;
    var seasonId = currentSeason().id;
    ids.forEach(function (originId) {
      var queue = state.queues[originId];
      var station = stationById(originId);
      var factor = seasonalDemandFactor(station, seasonId);
      // Draw the baseline 0..2, then scale by the seasonal factor with
      // probabilistic rounding. factor === 1 leaves the draw exactly as-is, so
      // non-seasonal stations behave identically to before.
      var base = Math.floor(Math.random() * (SPAWN_MAX_PER_STATION + 1));
      var scaled = base * factor;
      var spawnCount = Math.floor(scaled);
      if (Math.random() < scaled - spawnCount) spawnCount += 1;
      for (var i = 0; i < spawnCount; i++) {
        if (queue.length >= QUEUE_MAX_PER_STATION) break;
        var others = ids.filter(function (id) { return id !== originId; });
        var destId = others[Math.floor(Math.random() * others.length)];
        queue.push({
          id: state.nextGroupId++,
          destination: destId,
          fare: computeFare(originId, destId),
          spawnMonth: state.year * 12 + state.month
        });
      }
    });
  }

  function sortQueueEntries(entries) {
    var sorted = entries.slice();
    if (state.queueSort === 'fare') {
      sorted.sort(function (a, b) { return b.fare - a.fare; });
    } else if (state.queueSort === 'destination') {
      sorted.sort(function (a, b) {
        return stationById(a.destination).name.localeCompare(stationById(b.destination).name);
      });
    } else {
      sorted.sort(function (a, b) { return a.spawnMonth - b.spawnMonth; });
    }
    return sorted;
  }

  // How many whole months a group has been waiting, relative to now.
  function groupWaitMonths(group) {
    return Math.max(0, (state.year * 12 + state.month) - group.spawnMonth);
  }

  // Patience (months) before a group turns unhappy — forgiving on a small
  // network, tighter as more stations come online (GDD §4).
  function patienceThreshold() {
    var n = unlockedStationIds().length;
    var p = Math.round(BASE_PATIENCE - Math.max(0, n - 2) * PATIENCE_TIGHTEN_PER_STATION);
    return Math.max(MIN_PATIENCE, Math.min(BASE_PATIENCE, p));
  }

  function isGroupUnhappy(group) {
    return groupWaitMonths(group) >= patienceThreshold();
  }

  // Per-station monthly subsidy for serving an underserved district (GDD §7),
  // scaled by reputation.
  function subsidyPerStation() {
    return Math.round(SUBSIDY_BASE + state.reputation * SUBSIDY_PER_REP);
  }

  function hasUnlockedNeighbor(stationId) {
    var adj = getAdjacency()[stationId] || [];
    for (var i = 0; i < adj.length; i++) {
      if (state.unlocked[adj[i]]) return true;
    }
    return false;
  }

  function checkUnlockRequirements(stationId) {
    var s = stationById(stationId);
    var reasons = [];
    if (!hasUnlockedNeighbor(stationId)) reasons.push('Needs an unlocked neighboring station on the line.');
    if (state.cash < s.unlockCost) reasons.push('Not enough cash ($' + s.unlockCost.toLocaleString('en-US') + ' required).');
    if (state.reputation < s.unlockRep) reasons.push('Reputation too low (' + s.unlockRep + ' required).');
    return { ok: reasons.length === 0, reasons: reasons };
  }

  // Mutating op. Returns { ok, reasons }. On success, cash is spent, station
  // unlocked, and state saved. Caller shows reasons on failure, re-renders on ok.
  function unlockStation(stationId) {
    var check = checkUnlockRequirements(stationId);
    if (!check.ok) return check;
    var s = stationById(stationId);
    state.cash -= s.unlockCost;
    state.unlocked[stationId] = true;
    if (!state.queues[stationId]) state.queues[stationId] = [];
    saveState();
    return { ok: true, reasons: [] };
  }

  // Mutating op. Returns { ok, reason }. reason is a user-facing string only
  // when the failure is worth surfacing (insufficient cash); other rejections
  // (already built, not connected, locked) return reason: null silently.
  function buildTrack(a, b) {
    if (isTrackBuilt(a, b)) return { ok: false, reason: null };
    if (!findConnection(a, b)) return { ok: false, reason: null };
    if (!state.unlocked[a] || !state.unlocked[b]) return { ok: false, reason: null };
    if (state.cash < TRACK_COST) {
      return { ok: false, reason: 'Not enough cash to lay this track. Need $' + TRACK_COST.toLocaleString('en-US') + '.' };
    }
    state.cash -= TRACK_COST;
    state.trackBuilt[connectionKey(a, b)] = true;
    saveState();
    return { ok: true, reason: null };
  }

  // Mutating op. Returns { ok, reason, train }. reason is a user-facing string
  // on failure (locked by rep, short on cash); on success the train is bought,
  // parked at the first unlocked station with no route, and state saved.
  function buyTrain(typeId) {
    var type = trainTypeById(typeId);
    if (!type) return { ok: false, reason: 'Unknown train type.', train: null };
    if (state.reputation < type.minRep) {
      return { ok: false, reason: type.name + ' needs reputation ' + type.minRep + ' (you have ' + state.reputation + ').', train: null };
    }
    if (state.cash < type.cost) {
      return { ok: false, reason: 'Not enough cash. ' + type.name + ' costs $' + type.cost.toLocaleString('en-US') + '.', train: null };
    }
    state.cash -= type.cost;
    var n = state.nextTrainId++;
    var train = {
      id: 'train-' + n,
      typeId: type.id,
      name: type.name + ' #' + n,
      capacity: type.capacity,
      speedLabel: type.speedLabel,
      maintenance: type.maintenance,
      flavor: type.flavor,
      route: [],
      posIndex: 0,
      dir: 1,
      atStation: unlockedStationIds()[0] || 'central',
      manifest: []
    };
    state.trains.push(train);
    saveState();
    return { ok: true, reason: null, train: train };
  }

  function loadGroupsAtStation(train, stationId) {
    var queue = state.queues[stationId];
    if (!queue) return;
    var capacityLeft = train.capacity - train.manifest.length;
    if (capacityLeft <= 0) return;
    var eligible = queue.filter(function (g) { return train.route.indexOf(g.destination) !== -1 && g.destination !== stationId; });
    eligible = sortQueueEntries(eligible).slice(0, capacityLeft);
    eligible.forEach(function (g) {
      train.manifest.push(g);
      var idx = queue.indexOf(g);
      if (idx !== -1) queue.splice(idx, 1);
    });
    if (eligible.length > 0) state.servedThisMonth[stationId] = true; // boarding here
  }

  function unloadGroupsAtStation(train, stationId) {
    var remaining = [];
    var fareCollected = 0;
    train.manifest.forEach(function (g) {
      if (g.destination === stationId) fareCollected += g.fare;
      else remaining.push(g);
    });
    train.manifest = remaining;
    if (fareCollected > 0) {
      state.cash += fareCollected;
      state.monthlyRevenue += fareCollected;
      state.servedThisMonth[stationId] = true; // alighting here
    }
  }

  // Mutating op. Advances the train one leg (ping-ponging at route ends),
  // loading at the origin and unloading/collecting fares at the arrival stop.
  // Returns true if it moved, false if the train has no valid route.
  function dispatchTrain(trainId) {
    var train = null;
    for (var i = 0; i < state.trains.length; i++) {
      if (state.trains[i].id === trainId) train = state.trains[i];
    }
    if (!train || train.route.length < 2) return false;

    loadGroupsAtStation(train, train.atStation);

    var nextIndex = train.posIndex + train.dir;
    if (nextIndex < 0 || nextIndex >= train.route.length) {
      train.dir *= -1;
      nextIndex = train.posIndex + train.dir;
    }
    train.posIndex = nextIndex;
    train.atStation = train.route[train.posIndex];

    unloadGroupsAtStation(train, train.atStation);

    saveState();
    return true;
  }

  // Mutating op. Tallies the month, applies net cash + reputation, advances the
  // calendar, and spawns next month's passengers. Returns a summary object for
  // the caller to display.
  function endMonth() {
    var maintenance = state.trains.reduce(function (sum, t) {
      return sum + (typeof t.maintenance === 'number' ? t.maintenance : MAINTENANCE_PER_TRAIN);
    }, 0);
    var unlockedIds = unlockedStationIds();
    var unlockedCount = unlockedIds.length;
    var staff = STAFF_BASE + Math.max(0, unlockedCount - 2) * STAFF_PER_EXTRA_STATION;

    // Passenger happiness: tally groups that have waited past their patience,
    // and drop the ones fed up enough to abandon the queue entirely (GDD §4).
    var patience = patienceThreshold();
    var nowAbs = state.year * 12 + state.month;
    var unhappyGroups = 0;
    var abandonedGroups = 0;
    unlockedIds.forEach(function (id) {
      var q = state.queues[id] || [];
      var kept = [];
      q.forEach(function (g) {
        var wait = Math.max(0, nowAbs - g.spawnMonth);
        if (wait >= patience) unhappyGroups++;
        if (wait >= patience + ABANDON_GRACE) abandonedGroups++;
        else kept.push(g);
      });
      state.queues[id] = kept;
    });

    // Government subsidies: a per-station bonus (scaled by reputation) for every
    // underserved district actually served this month (GDD §7).
    var subsidyStationIds = UNDERSERVED_DISTRICT_STATIONS.filter(function (id) {
      return state.unlocked[id] && state.servedThisMonth[id];
    });
    var perStation = subsidyStationIds.length ? subsidyPerStation() : 0;
    var subsidy = subsidyStationIds.length * perStation;

    var costs = maintenance + staff;
    var revenue = state.monthlyRevenue;
    var net = revenue - costs + subsidy;

    var repDelta = (revenue > 0 ? 1 : 0) - Math.ceil(unhappyGroups / UNHAPPY_PER_REP_POINT);
    state.reputation = Math.max(0, Math.min(100, state.reputation + repDelta));

    var summary = {
      label: MONTH_NAMES[state.month - 1] + ' ' + state.year,
      revenue: revenue,
      maintenance: maintenance,
      staff: staff,
      costs: costs,
      subsidy: subsidy,
      subsidyStations: subsidyStationIds.length,
      net: net,
      repDelta: repDelta,
      unhappyGroups: unhappyGroups,
      abandonedGroups: abandonedGroups,
      patience: patience
    };

    state.cash += net;
    state.month += 1;
    if (state.month > 12) {
      state.month = 1;
      state.year += 1;
    }
    state.monthlyRevenue = 0;
    state.servedThisMonth = {};
    spawnPassengers();
    saveState();
    return summary;
  }

  // One-time seed of the opening passenger queues on a brand-new game.
  function init() {
    if (!state.seeded) {
      spawnPassengers();
      state.seeded = true;
      saveState();
    }
  }

  global.MTA = {
    // data & constants
    STATIONS: STATIONS,
    CONNECTIONS: CONNECTIONS,
    MONTH_NAMES: MONTH_NAMES,
    STATE_KEY: STATE_KEY,
    TRACK_COST: TRACK_COST,
    QUEUE_MAX_PER_STATION: QUEUE_MAX_PER_STATION,
    SPAWN_MAX_PER_STATION: SPAWN_MAX_PER_STATION,
    BASE_FARE_PER_HOP: BASE_FARE_PER_HOP,
    HILL_FARE_MULTIPLIER: HILL_FARE_MULTIPLIER,
    MAINTENANCE_PER_TRAIN: MAINTENANCE_PER_TRAIN,
    STAFF_BASE: STAFF_BASE,
    STAFF_PER_EXTRA_STATION: STAFF_PER_EXTRA_STATION,
    UNDERSERVED_DISTRICT_STATIONS: UNDERSERVED_DISTRICT_STATIONS,
    TRAIN_TYPES: TRAIN_TYPES,
    // live state (stable reference)
    state: state,
    // pure helpers
    gx: gx,
    gy: gy,
    stationById: stationById,
    trainTypeById: trainTypeById,
    connectionKey: connectionKey,
    findConnection: findConnection,
    isTrackBuilt: isTrackBuilt,
    getAdjacency: getAdjacency,
    hopDistance: hopDistance,
    computeFare: computeFare,
    unlockedStationIds: unlockedStationIds,
    seasonForMonth: seasonForMonth,
    currentSeason: currentSeason,
    seasonalDemandFactor: seasonalDemandFactor,
    groupWaitMonths: groupWaitMonths,
    patienceThreshold: patienceThreshold,
    isGroupUnhappy: isGroupUnhappy,
    subsidyPerStation: subsidyPerStation,
    sortQueueEntries: sortQueueEntries,
    hasUnlockedNeighbor: hasUnlockedNeighbor,
    checkUnlockRequirements: checkUnlockRequirements,
    // state management
    defaultState: defaultState,
    loadState: loadState,
    saveState: saveState,
    init: init,
    // mutating sim ops (UI-agnostic; return results, no render)
    spawnPassengers: spawnPassengers,
    unlockStation: unlockStation,
    buildTrack: buildTrack,
    buyTrain: buyTrain,
    loadGroupsAtStation: loadGroupsAtStation,
    unloadGroupsAtStation: unloadGroupsAtStation,
    dispatchTrain: dispatchTrain,
    endMonth: endMonth
  };
})(window);
