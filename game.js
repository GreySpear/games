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
  var MAINTENANCE_PER_TRAIN = 60;
  var STAFF_BASE = 120;
  var STAFF_PER_EXTRA_STATION = 15;

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
      seeded: false,
      trains: [
        { id: 'old-betsy', name: 'Old Betsy', capacity: 4, speedLabel: 'Slow', flavor: '1950s diesel — rattles, but it runs.', route: [], posIndex: 0, dir: 1, atStation: 'central', manifest: [] }
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

  var state = loadState();

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

  function spawnPassengers() {
    var ids = unlockedStationIds();
    if (ids.length < 2) return;
    ids.forEach(function (originId) {
      var queue = state.queues[originId];
      var spawnCount = Math.floor(Math.random() * (SPAWN_MAX_PER_STATION + 1));
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
    var maintenance = state.trains.length * MAINTENANCE_PER_TRAIN;
    var unlockedIds = unlockedStationIds();
    var unlockedCount = unlockedIds.length;
    var staff = STAFF_BASE + Math.max(0, unlockedCount - 2) * STAFF_PER_EXTRA_STATION;
    var costs = maintenance + staff;
    var revenue = state.monthlyRevenue;
    var net = revenue - costs;

    var overflowCount = unlockedIds.filter(function (id) {
      return (state.queues[id] || []).length >= QUEUE_MAX_PER_STATION;
    }).length;
    var repDelta = (revenue > 0 ? 1 : 0) - overflowCount;
    state.reputation = Math.max(0, Math.min(100, state.reputation + repDelta));

    var summary = {
      label: MONTH_NAMES[state.month - 1] + ' ' + state.year,
      revenue: revenue,
      maintenance: maintenance,
      staff: staff,
      costs: costs,
      net: net,
      repDelta: repDelta
    };

    state.cash += net;
    state.month += 1;
    if (state.month > 12) {
      state.month = 1;
      state.year += 1;
    }
    state.monthlyRevenue = 0;
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
    // live state (stable reference)
    state: state,
    // pure helpers
    gx: gx,
    gy: gy,
    stationById: stationById,
    connectionKey: connectionKey,
    findConnection: findConnection,
    isTrackBuilt: isTrackBuilt,
    getAdjacency: getAdjacency,
    hopDistance: hopDistance,
    computeFare: computeFare,
    unlockedStationIds: unlockedStationIds,
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
    loadGroupsAtStation: loadGroupsAtStation,
    unloadGroupsAtStation: unloadGroupsAtStation,
    dispatchTrain: dispatchTrain,
    endMonth: endMonth
  };
})(window);
