"use strict";

const SUITS = [
  { id: "dots", name: "Balls", short: "●", color: "dot-suit" },
  { id: "bamboo", name: "Sticks", short: "竹", color: "bamboo-suit" },
  { id: "characters", name: "Characters", short: "萬", color: "char-suit" }
];

const FLOWERS = [
  { name: "East Wind", label: "東", family: "Wind" },
  { name: "South Wind", label: "南", family: "Wind" },
  { name: "West Wind", label: "西", family: "Wind" },
  { name: "North Wind", label: "北", family: "Wind" },
  { name: "Red Dragon", label: "中", family: "Dragon" },
  { name: "Green Dragon", label: "發", family: "Dragon" },
  { name: "White Dragon", label: "白", family: "Dragon" },
  { name: "Plum", label: "梅", family: "Flower" },
  { name: "Orchid", label: "蘭", family: "Flower" },
  { name: "Chrysanthemum", label: "菊", family: "Flower" },
  { name: "Bamboo Flower", label: "竹", family: "Flower" },
  { name: "Spring", label: "春", family: "Season" },
  { name: "Summer", label: "夏", family: "Season" },
  { name: "Autumn", label: "秋", family: "Season" },
  { name: "Winter", label: "冬", family: "Season" }
];

const PLAYER_NAMES = ["You", "Ate Nena", "Lola Tess", "Kuya Jun"];
const SHORT_NAMES = ["YOU", "NENA", "TESS", "JUN"];
const SUIT_INDEX = { dots: 0, bamboo: 1, characters: 2 };
const SUIT_BY_INDEX = ["dots", "bamboo", "characters"];
const TOTAL_GROUPS = 5;

let tileSerial = 0;
let state = null;

const byId = function (id) { return document.getElementById(id); };
const sleep = function (ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms); }); };

function makeTile(suit, rank, flower) {
  tileSerial += 1;
  if (flower) {
    return {
      id: tileSerial,
      kind: "bonus",
      name: flower.name,
      label: flower.label,
      family: flower.family
    };
  }
  return { id: tileSerial, kind: "suited", suit: suit, rank: rank };
}

function buildWall() {
  const wall = [];
  SUITS.forEach(function (suit) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) wall.push(makeTile(suit.id, rank));
    }
  });
  FLOWERS.slice(0, 7).forEach(function (flower) {
    for (let copy = 0; copy < 4; copy += 1) wall.push(makeTile(null, null, flower));
  });
  FLOWERS.slice(7).forEach(function (flower) { wall.push(makeTile(null, null, flower)); });
  for (let i = wall.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = wall[i];
    wall[i] = wall[j];
    wall[j] = temp;
  }
  return wall;
}

function playerRecord(name, index, score) {
  return {
    name: name,
    index: index,
    score: score || 0,
    hand: [],
    flowers: [],
    melds: [],
    discards: []
  };
}

function createGame(keepScores, nextHandNumber) {
  const previousScores = keepScores && state ? state.players.map(function (player) { return player.score; }) : [0, 0, 0, 0];
  tileSerial = 0;
  const players = PLAYER_NAMES.map(function (name, index) {
    return playerRecord(name, index, previousScores[index]);
  });
  const handNumber = nextHandNumber || 1;
  state = {
    players: players,
    wall: buildWall(),
    front: 0,
    back: 143,
    handNumber: handNumber,
    dealer: (handNumber - 1) % 4,
    turn: (handNumber - 1) % 4,
    phase: "deal",
    selectedTileId: null,
    drawnTileId: null,
    pending: null,
    claimOptions: [],
    botClaims: [],
    message: "Shuffling the tiles…",
    lastDiscard: null,
    history: [],
    actionSeq: 0,
    result: null,
    busy: false
  };

  players.forEach(function (player) {
    for (let i = 0; i < 16; i += 1) drawPlayable(player, "front");
  });
  drawPlayable(players[state.dealer], "front");
  players.forEach(function (player) { sortHand(player.hand); });
  state.phase = "discard";
  state.turn = state.dealer;
  state.message = players[state.dealer].name + " is Mano and discards first.";
  recordAction({ kind: "dealer", actor: state.dealer });
  render();
  if (state.turn !== 0) window.setTimeout(runBotDiscard, 400);
}

function recordAction(action) {
  state.actionSeq += 1;
  action.id = state.actionSeq;
  action.at = Date.now();
  state.history.unshift(action);
  state.history = state.history.slice(0, 5);
}

function drawPlayable(player, end) {
  while (state.front <= state.back) {
    let tile;
    if (end === "back") {
      tile = state.wall[state.back];
      state.back -= 1;
    } else {
      tile = state.wall[state.front];
      state.front += 1;
    }
    if (tile.kind === "bonus") {
      player.flowers.push(tile);
      state.message = player.name + " reveals " + tile.name + " and takes a replacement.";
      recordAction({ kind: "flower", actor: player.index, tile: tile, source: "back" });
      if (state.front > state.back) return null;
      end = "back";
      continue;
    }
    player.hand.push(tile);
    sortHand(player.hand);
    return tile;
  }
  return null;
}

function remainingWall() {
  return Math.max(0, state.back - state.front + 1);
}

function tileKey(tile) {
  if (typeof tile === "string") return tile;
  return tile.suit + "-" + tile.rank;
}

function tileName(tile) {
  if (tile.kind === "bonus") return tile.name;
  const suit = SUITS[SUIT_INDEX[tile.suit]];
  return tile.rank + " " + suit.name;
}

function tileIndex(tile) {
  if (typeof tile === "string") {
    const parts = tile.split("-");
    return SUIT_INDEX[parts[0]] * 9 + Number(parts[1]) - 1;
  }
  return SUIT_INDEX[tile.suit] * 9 + tile.rank - 1;
}

function indexKey(index) {
  return SUIT_BY_INDEX[Math.floor(index / 9)] + "-" + (index % 9 + 1);
}

function sortHand(hand) {
  hand.sort(function (a, b) {
    return tileIndex(a) - tileIndex(b) || a.id - b.id;
  });
}

function countsFor(hand) {
  const counts = Array(27).fill(0);
  hand.forEach(function (tile) { counts[tileIndex(tile)] += 1; });
  return counts;
}

function firstPresent(counts) {
  for (let i = 0; i < counts.length; i += 1) if (counts[i]) return i;
  return -1;
}

function solveStandard(counts, groupsNeeded, needPair, memo) {
  const key = counts.join("") + "|" + groupsNeeded + "|" + (needPair ? "1" : "0");
  if (memo.has(key)) return memo.get(key);
  const first = firstPresent(counts);
  if (first < 0) {
    const solved = groupsNeeded === 0 && !needPair ? { groups: [], pair: null } : null;
    memo.set(key, solved);
    return solved;
  }
  if (groupsNeeded < 0) {
    memo.set(key, null);
    return null;
  }
  let next;
  if (needPair && counts[first] >= 2) {
    const copy = counts.slice();
    copy[first] -= 2;
    next = solveStandard(copy, groupsNeeded, false, memo);
    if (next) {
      const result = { groups: next.groups, pair: indexKey(first) };
      memo.set(key, result);
      return result;
    }
  }
  if (groupsNeeded > 0 && counts[first] >= 3) {
    const copy = counts.slice();
    copy[first] -= 3;
    next = solveStandard(copy, groupsNeeded - 1, needPair, memo);
    if (next) {
      const groups = next.groups.slice();
      groups.unshift({ type: "pung", keys: [indexKey(first), indexKey(first), indexKey(first)] });
      const result = { groups: groups, pair: next.pair };
      memo.set(key, result);
      return result;
    }
  }
  const suitStart = Math.floor(first / 9) * 9;
  if (groupsNeeded > 0 && first < suitStart + 7 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    const copy = counts.slice();
    copy[first] -= 1;
    copy[first + 1] -= 1;
    copy[first + 2] -= 1;
    next = solveStandard(copy, groupsNeeded - 1, needPair, memo);
    if (next) {
      const groups = next.groups.slice();
      groups.unshift({ type: "chow", keys: [indexKey(first), indexKey(first + 1), indexKey(first + 2)] });
      const result = { groups: groups, pair: next.pair };
      memo.set(key, result);
      return result;
    }
  }
  memo.set(key, null);
  return null;
}

function removeSetGroups(counts, groupsNeeded, memo) {
  const key = counts.join("") + "|" + groupsNeeded;
  if (memo.has(key)) return memo.get(key);
  if (groupsNeeded === 0) {
    const pairs = [];
    let pairCount = 0;
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i] % 2 !== 0) {
        memo.set(key, null);
        return null;
      }
      for (let j = 0; j < counts[i] / 2; j += 1) pairs.push(indexKey(i));
      pairCount += counts[i] / 2;
    }
    const result = pairCount === 7 ? { pairs: pairs } : null;
    memo.set(key, result);
    return result;
  }
  if (groupsNeeded < 0) {
    memo.set(key, null);
    return null;
  }
  const first = firstPresent(counts);
  if (first < 0) {
    memo.set(key, null);
    return null;
  }
  let next;
  if (counts[first] >= 3) {
    const copy = counts.slice();
    copy[first] -= 3;
    next = removeSetGroups(copy, groupsNeeded - 1, memo);
    if (next) {
      const result = { pairs: next.pairs, groups: [{ type: "pung", keys: [indexKey(first), indexKey(first), indexKey(first)] }] };
      memo.set(key, result);
      return result;
    }
  }
  const suitStart = Math.floor(first / 9) * 9;
  if (first < suitStart + 7 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    const copy = counts.slice();
    copy[first] -= 1;
    copy[first + 1] -= 1;
    copy[first + 2] -= 1;
    next = removeSetGroups(copy, groupsNeeded - 1, memo);
    if (next) {
      const groups = (next.groups || []).slice();
      groups.unshift({ type: "chow", keys: [indexKey(first), indexKey(first + 1), indexKey(first + 2)] });
      const result = { pairs: next.pairs, groups: groups };
      memo.set(key, result);
      return result;
    }
  }
  memo.set(key, null);
  return null;
}

function getWinningShape(hand, melds) {
  const groupsNeeded = TOTAL_GROUPS - melds.length;
  if (groupsNeeded < 0) return null;
  const counts = countsFor(hand);
  if (hand.length === groupsNeeded * 3 + 2) {
    const standard = solveStandard(counts, groupsNeeded, true, new Map());
    if (standard) return { kind: "standard", groups: standard.groups, pair: standard.pair };
  }
  const extraSetNeeded = 1 - melds.length;
  if (extraSetNeeded >= 0 && hand.length === 14 + extraSetNeeded * 3) {
    const siete = removeSetGroups(counts, extraSetNeeded, new Map());
    if (siete) return { kind: "siete-pares", groups: siete.groups || [], pairCount: 7 };
  }
  return null;
}

function isWinning(player, extraTile) {
  const hand = player.hand.slice();
  if (extraTile) hand.push(extraTile);
  return getWinningShape(hand, player.melds);
}

function handPatterns(player, shape, extraTile) {
  const tiles = player.hand.slice();
  if (extraTile) tiles.push(extraTile);
  player.melds.forEach(function (meld) { meld.tiles.forEach(function (tile) { tiles.push(tile); }); });
  const suits = Array.from(new Set(tiles.map(function (tile) { return tile.suit; })));
  const flush = suits.length === 1;
  const allMelds = player.melds.concat(shape.groups || []);
  const allPung = shape.kind === "standard" && allMelds.every(function (meld) { return meld.type === "pung" || meld.type === "kong"; });
  const concealed = player.melds.every(function (meld) { return meld.concealed; });
  const rankSets = {};
  tiles.forEach(function (tile) {
    if (!rankSets[tile.suit]) rankSets[tile.suit] = new Set();
    rankSets[tile.suit].add(tile.rank);
  });
  const escalera = Object.keys(rankSets).some(function (suit) {
    for (let rank = 1; rank <= 9; rank += 1) if (!rankSets[suit].has(rank)) return false;
    return true;
  });
  const bonuses = [];
  if (flush) bonuses.push({ label: "Isa-isa · Flush", value: 1 });
  if (allPung) bonuses.push({ label: "Puro Pung", value: 1 });
  if (concealed) bonuses.push({ label: "Lihim · Concealed", value: 1 });
  if (player.flowers.length === 0) bonuses.push({ label: "Walang Bulaklak · No Flores", value: 1 });
  if (shape.kind === "siete-pares") bonuses.push({ label: "Siete Pares", value: 2 });
  if (escalera) bonuses.push({ label: "Escalera", value: 2 });
  return { bonuses: bonuses, multiplier: 1 + bonuses.reduce(function (sum, item) { return sum + item.value; }, 0) };
}

function removeFromHand(player, key, amount) {
  let removed = 0;
  for (let i = player.hand.length - 1; i >= 0 && removed < amount; i -= 1) {
    if (tileKey(player.hand[i]) === key) {
      player.hand.splice(i, 1);
      removed += 1;
    }
  }
  return removed === amount;
}

function removeKeys(player, keys) {
  const needed = {};
  keys.forEach(function (key) { needed[key] = (needed[key] || 0) + 1; });
  for (const key in needed) {
    if (player.hand.filter(function (tile) { return tileKey(tile) === key; }).length < needed[key]) return false;
  }
  keys.forEach(function (key) { removeFromHand(player, key, needed[key]); });
  sortHand(player.hand);
  return true;
}

function countsByKey(hand) {
  const result = {};
  hand.forEach(function (tile) { const key = tileKey(tile); result[key] = (result[key] || 0) + 1; });
  return result;
}

function chowOptions(player, tile, fromIndex) {
  if (tile.kind !== "suited" || (fromIndex + 1) % 4 !== player.index) return [];
  const counts = countsByKey(player.hand);
  const options = [];
  for (let start = Math.max(1, tile.rank - 2); start <= Math.min(tile.rank, 7); start += 1) {
    const needed = [start, start + 1, start + 2]
      .filter(function (rank) { return rank !== tile.rank; })
      .map(function (rank) { return tile.suit + "-" + rank; });
    if (needed.every(function (key) { return (counts[key] || 0) > 0; })) {
      options.push({ type: "chow", keys: needed, label: "Chow " + needed.map(function (key) { return key.split("-")[1]; }).join("–") });
    }
  }
  return options;
}

function legalDiscardClaims(player, tile, fromIndex) {
  const options = [];
  if (isWinning(player, tile)) options.push({ type: "win", priority: 4, label: "Todas" });
  if (tile.kind === "suited") {
    const count = (countsByKey(player.hand)[tileKey(tile)] || 0);
    if (count >= 3) options.push({ type: "kong", priority: 3, key: tileKey(tile), label: "Kang" });
    if (count >= 2) options.push({ type: "pung", priority: 2, key: tileKey(tile), label: "Pung" });
    chowOptions(player, tile, fromIndex).forEach(function (option) {
      option.priority = 1;
      options.push(option);
    });
  }
  return options;
}

function chooseBotClaim(options) {
  if (!options.length) return null;
  const win = options.find(function (option) { return option.type === "win"; });
  if (win) return win;
  const kong = options.find(function (option) { return option.type === "kong"; });
  if (kong) return kong;
  const pung = options.find(function (option) { return option.type === "pung"; });
  if (pung) return pung;
  const chow = options.find(function (option) { return option.type === "chow"; });
  return chow && Math.random() < 0.42 ? chow : null;
}

function discardTile(playerIndex, handTile) {
  const player = state.players[playerIndex];
  const handPosition = player.hand.findIndex(function (tile) { return tile.id === handTile.id; });
  if (handPosition < 0) return;
  const tile = player.hand.splice(handPosition, 1)[0];
  sortHand(player.hand);
  const entry = { tile: tile, from: playerIndex, claimed: false };
  player.discards.push(entry);
  state.pending = { entry: entry, tile: tile, from: playerIndex };
  state.lastDiscard = state.pending;
  state.phase = "claim";
  state.turn = playerIndex;
  state.selectedTileId = null;
  state.drawnTileId = null;
  state.message = player.name + " discards " + tileName(tile) + ".";
  recordAction({ kind: "discard", actor: playerIndex, tile: tile });
  beginClaims();
}

function beginClaims() {
  const pending = state.pending;
  if (!pending) return;
  state.claimOptions = [];
  state.botClaims = [];
  for (let offset = 1; offset < 4; offset += 1) {
    const index = (pending.from + offset) % 4;
    const player = state.players[index];
    const options = legalDiscardClaims(player, pending.tile, pending.from);
    if (index === 0) {
      state.claimOptions = options;
    } else {
      const choice = chooseBotClaim(options);
      if (choice) state.botClaims.push({ player: index, option: choice, distance: offset });
    }
  }
  render();
  if (state.claimOptions.length) return;
  window.setTimeout(function () { resolveClaims(null); }, state.botClaims.length ? 500 : 180);
}

function resolveClaims(userOption) {
  if (!state.pending) return;
  const claims = state.botClaims.slice();
  if (userOption && userOption.type !== "pass") {
    claims.push({
      player: 0,
      option: userOption,
      distance: (0 - state.pending.from + 4) % 4
    });
  }
  claims.sort(function (a, b) {
    return b.option.priority - a.option.priority || a.distance - b.distance;
  });
  const winner = claims[0];
  if (!winner) {
    state.pending = null;
    startTurn((state.turn + 1) % 4);
    return;
  }
  if (userOption && userOption.type !== "pass" && winner.player !== 0) {
    state.message = "Your call was beaten by " + winner.option.label + ".";
  }
  executeClaim(winner.player, winner.option);
}

function executeClaim(playerIndex, option) {
  const player = state.players[playerIndex];
  const pending = state.pending;
  if (!pending) return;
  if (option.type === "win") {
    pending.entry.claimed = true;
    pending.entry.claimedBy = playerIndex;
    pending.entry.claimedWith = "Todas";
    recordAction({ kind: "call", actor: playerIndex, source: pending.from, tile: pending.tile, call: "TODAS · WIN" });
    finishHand(playerIndex, "Todas", pending.from, pending.tile);
    return;
  }
  pending.entry.claimed = true;
  pending.entry.claimedBy = playerIndex;
  pending.entry.claimedWith = option.label;
  if (option.type === "kong") {
    removeFromHand(player, option.key, 3);
    const tiles = [pending.tile, pending.tile, pending.tile, pending.tile];
    player.melds.push({
      type: "kong",
      tiles: tiles,
      concealed: false,
      fromIndex: pending.from,
      claimedTileId: pending.tile.id
    });
    state.message = player.name + " takes " + tileName(pending.tile) + " from " + state.players[pending.from].name + " with Kang.";
    recordAction({ kind: "call", actor: playerIndex, source: pending.from, tile: pending.tile, call: "KANG" });
    state.pending = null;
    state.turn = playerIndex;
    state.phase = "discard";
    const replacement = drawPlayable(player, "back");
    if (!replacement) {
      finishDraw();
      return;
    }
    state.drawnTileId = replacement.id;
    sortHand(player.hand);
    recordAction({ kind: "draw", actor: playerIndex, tile: playerIndex === 0 ? replacement : null, hidden: playerIndex !== 0, source: "back", replacement: true });
    render();
    if (playerIndex !== 0) {
      if (getWinningShape(player.hand, player.melds)) window.setTimeout(function () { finishHand(playerIndex, "Bunot", null); }, 380);
      else window.setTimeout(runBotDiscard, 380);
    }
    return;
  }
  if (option.type === "pung") {
    removeFromHand(player, option.key, 2);
    player.melds.push({
      type: "pung",
      tiles: [pending.tile, pending.tile, pending.tile],
      concealed: false,
      fromIndex: pending.from,
      claimedTileId: pending.tile.id
    });
  } else if (option.type === "chow") {
    removeKeys(player, option.keys);
    player.melds.push({
      type: "chow",
      tiles: option.keys.map(function (key) { return tileFromKey(key); }).concat([pending.tile]),
      concealed: false,
      fromIndex: pending.from,
      claimedTileId: pending.tile.id
    });
    player.melds[player.melds.length - 1].tiles.sort(function (a, b) { return tileIndex(a) - tileIndex(b); });
  }
  state.message = player.name + " takes " + tileName(pending.tile) + " from " + state.players[pending.from].name + " with " + option.label + ".";
  recordAction({ kind: "call", actor: playerIndex, source: pending.from, tile: pending.tile, call: option.label.toUpperCase() });
  state.pending = null;
  state.turn = playerIndex;
  state.phase = "discard";
  sortHand(player.hand);
  render();
  if (playerIndex !== 0) window.setTimeout(runBotDiscard, 380);
}

function tileFromKey(key) {
  const parts = key.split("-");
  return makeTile(parts[0], Number(parts[1]));
}

function startTurn(playerIndex) {
  if (remainingWall() <= 0) {
    finishDraw();
    return;
  }
  state.turn = playerIndex;
  state.phase = "draw";
  state.selectedTileId = null;
  state.drawnTileId = null;
  state.message = state.players[playerIndex].name + " draws.";
  render();
  if (playerIndex === 0) drawHumanTurn();
  else window.setTimeout(runBotTurn, 350);
}

function drawHumanTurn() {
  const player = state.players[0];
  const tile = drawPlayable(player, "front");
  if (!tile) {
    finishDraw();
    return;
  }
  state.phase = "discard";
  state.drawnTileId = tile.id;
  state.message = "Your turn. Choose a tile to discard, or call Bunot if your hand is complete.";
  recordAction({ kind: "draw", actor: 0, tile: tile, source: "wall" });
  sortHand(player.hand);
  render();
}

async function runBotTurn() {
  if (!state || state.phase !== "draw" || state.turn === 0 || state.busy) return;
  state.busy = true;
  await sleep(420);
  if (!state || state.phase !== "draw" || state.turn === 0) {
    state.busy = false;
    return;
  }
  const player = state.players[state.turn];
  const drawn = drawPlayable(player, "front");
  if (!drawn) {
    state.busy = false;
    finishDraw();
    return;
  }
  state.phase = "discard";
  state.drawnTileId = drawn.id;
  recordAction({ kind: "draw", actor: player.index, hidden: true, source: "wall" });
  render();
  await sleep(340);
  if (!state || state.phase !== "discard" || state.turn !== player.index) {
    state.busy = false;
    return;
  }
  sortHand(player.hand);
  const shape = getWinningShape(player.hand, player.melds);
  if (shape) {
    state.busy = false;
    finishHand(player.index, "Bunot", null);
    return;
  }
  const kongs = selfKongOptions(player);
  if (kongs.length) {
    await sleep(280);
    if (state.phase === "discard" && state.turn === player.index) {
      state.busy = false;
      declareKong(player.index, kongs[0]);
      return;
    }
  }
  state.busy = false;
  runBotDiscard();
}

function runBotDiscard() {
  if (!state || state.phase !== "discard" || state.turn === 0 || state.busy) return;
  const player = state.players[state.turn];
  const tile = chooseDiscard(player);
  if (!tile) return;
  discardTile(player.index, tile, "bot");
}

function tileSupport(tile, hand) {
  const key = tileKey(tile);
  const counts = countsByKey(hand);
  const exact = Math.max(0, (counts[key] || 0) - 1);
  let support = exact * 3.1;
  [1, -1, 2, -2].forEach(function (offset) {
    const rank = tile.rank + offset;
    if (rank < 1 || rank > 9) return;
    const neighbor = tile.suit + "-" + rank;
    if (!counts[neighbor]) return;
    support += Math.abs(offset) === 1 ? 1.35 : 0.5;
  });
  if (tile.rank >= 3 && tile.rank <= 7) support += 0.16;
  return support;
}

function chooseDiscard(player) {
  let best = null;
  let bestSupport = Infinity;
  player.hand.forEach(function (tile) {
    const support = tileSupport(tile, player.hand);
    if (support < bestSupport || (support === bestSupport && tile.rank > best.rank)) {
      best = tile;
      bestSupport = support;
    }
  });
  return best;
}

function selfKongOptions(player) {
  const options = [];
  const counts = countsByKey(player.hand);
  Object.keys(counts).forEach(function (key) {
    if (counts[key] >= 4) options.push({ kind: "concealed", key: key, label: "Secret Kang · " + key.split("-")[1] });
  });
  player.melds.forEach(function (meld, index) {
    if (meld.type !== "pung" || meld.concealed) return;
    const key = tileKey(meld.tiles[0]);
    if (counts[key]) options.push({ kind: "upgrade", key: key, meldIndex: index, label: "Sagása · " + key.split("-")[1] });
  });
  return options;
}

function declareKong(playerIndex, option) {
  const player = state.players[playerIndex];
  if (option.kind === "concealed") {
    const tiles = player.hand.filter(function (tile) { return tileKey(tile) === option.key; }).slice(0, 4);
    if (tiles.length !== 4) return;
    removeFromHand(player, option.key, 4);
    player.melds.push({ type: "kong", tiles: tiles, concealed: true });
    state.players.forEach(function (other) {
      if (other.index !== playerIndex) {
        other.score -= 1;
        player.score += 1;
      }
    });
    state.message = player.name + " declares a Secret Kang. Each opponent pays one point.";
    recordAction({ kind: "secret-kang", actor: playerIndex });
  } else {
    if (!removeFromHand(player, option.key, 1)) return;
    const meld = player.melds[option.meldIndex];
    meld.tiles.push(tileFromKey(option.key));
    meld.type = "kong";
    state.message = player.name + " calls Sagása and upgrades a Pung to Kang.";
    recordAction({ kind: "sagasa", actor: playerIndex, tile: meld.tiles[0] });
  }
  const replacement = drawPlayable(player, "back");
  if (!replacement) {
    finishDraw();
    return;
  }
  state.turn = playerIndex;
  state.phase = "discard";
  state.drawnTileId = replacement.id;
  sortHand(player.hand);
  recordAction({ kind: "draw", actor: playerIndex, tile: playerIndex === 0 ? replacement : null, hidden: playerIndex !== 0, source: "back", replacement: true });
  render();
  if (playerIndex !== 0) {
    if (getWinningShape(player.hand, player.melds)) window.setTimeout(function () { finishHand(playerIndex, "Bunot", null); }, 360);
    else window.setTimeout(runBotDiscard, 360);
  }
}

function finishHand(winnerIndex, winType, discarderIndex, winningTile) {
  if (!state || state.phase === "finished") return;
  const winner = state.players[winnerIndex];
  const winningHand = winner.hand.slice();
  if (winningTile) winningHand.push(winningTile);
  const shape = getWinningShape(winningHand, winner.melds);
  if (!shape) {
    state.message = "That hand does not make a legal win.";
    render();
    return;
  }
  const patterns = handPatterns(winner, shape, winningTile);
  const payouts = [];
  state.players.forEach(function (player) {
    if (player.index === winnerIndex) return;
    const units = winType === "Bunot" || player.index === discarderIndex ? 2 * patterns.multiplier : patterns.multiplier;
    player.score -= units;
    winner.score += units;
    payouts.push(player.name + " pays " + units);
  });
  state.phase = "finished";
  state.pending = null;
  state.busy = false;
  state.result = {
    winner: winnerIndex,
    type: winType,
    shape: shape,
    patterns: patterns,
    payouts: payouts
  };
  state.message = winner.name + " wins with " + winType + "!";
  recordAction({ kind: "win", actor: winnerIndex, tile: winningTile || null, winType: winType });
  render();
  showResult();
}

function finishDraw() {
  if (!state || state.phase === "finished") return;
  state.phase = "finished";
  state.pending = null;
  state.busy = false;
  state.result = { draw: true };
  state.message = "The wall is exhausted. This hand is a draw.";
  recordAction({ kind: "draw-end", actor: state.turn });
  render();
  byId("resultEyebrow").textContent = "WALL EXHAUSTED";
  byId("resultTitle").textContent = "No Mahjong this hand";
  byId("resultCopy").textContent = "No winner this time. The scores carry forward to the next hand.";
  byId("resultScore").textContent = "The next Mano takes the first discard.";
  byId("resultDialog").hidden = false;
}

function showResult() {
  const result = state.result;
  const winner = state.players[result.winner];
  const kindText = result.shape.kind === "siete-pares" ? "Siete Pares" : "five báhay and a pair";
  byId("resultEyebrow").textContent = result.type === "Bunot" ? "BUNOT · SELF-DRAW" : "TODAS · DISCARD WIN";
  byId("resultTitle").textContent = winner.index === 0 ? "Mahjong!" : winner.name + " wins";
  byId("resultCopy").textContent = winner.name + " completes " + kindText + " at " + result.patterns.multiplier + "×. " + result.patterns.bonuses.map(function (item) { return item.label; }).join(" · ");
  byId("resultScore").textContent = result.payouts.join("  ·  ");
  byId("resultDialog").hidden = false;
}

function tileFace(tile, className) {
  const classes = ["tile"];
  if (className) classes.push(className);
  if (tile.kind === "bonus") {
    classes.push("bonus-tile");
    return '<div class="' + classes.join(" ") + '" title="' + tile.name + '"><span class="tile-rank">' + tile.label + '</span><span class="tile-suit">' + tile.family + '</span></div>';
  }
  const suit = SUITS[SUIT_INDEX[tile.suit]];
  classes.push(suit.color);
  return '<div class="' + classes.join(" ") + '" title="' + tileName(tile) + '"><span class="tile-rank">' + tile.rank + '</span><span class="tile-suit">' + suit.short + '</span></div>';
}

function tinyFace(tile, extraClass, title) {
  const extra = extraClass ? " " + extraClass : "";
  if (tile.kind === "bonus") return '<span class="tiny-tile bonus' + extra + '" title="' + (title || tile.name) + '">' + tile.label + '</span>';
  const color = tile.suit === "characters" ? " red" : "";
  const suit = SUITS[SUIT_INDEX[tile.suit]];
  return '<span class="tiny-tile' + color + extra + '" title="' + (title || tileName(tile)) + '">' + tile.rank + '<small class="tiny-suit">' + suit.short + '</small></span>';
}

function discardFace(entry) {
  const owner = entry.claimedBy === undefined ? "" : " · called by " + PLAYER_NAMES[entry.claimedBy];
  const title = tileName(entry.tile) + " discarded by " + PLAYER_NAMES[entry.from] + owner;
  return tinyFace(entry.tile, entry.claimed ? "claimed" : "", title);
}

function seatBadge(index) {
  const parts = [];
  if (index === state.dealer) parts.push('<span class="seat-badge">✦ MANO</span>');
  if (state.phase === "claim" && state.pending) {
    if (index === state.turn) parts.push('<span class="seat-badge current">DISCARD</span>');
    else if (index === 0 && state.claimOptions.length) parts.push('<span class="seat-badge current">YOUR CALL</span>');
    else if (state.botClaims.some(function (claim) { return claim.player === index; })) parts.push('<span class="seat-badge current">CALL READY</span>');
  } else if (index === state.turn && state.phase !== "finished") {
    const label = index === 0 ? (state.phase === "draw" ? "YOUR DRAW" : "YOUR TURN") : (state.phase === "draw" ? "DRAWING" : "DISCARD");
    parts.push('<span class="seat-badge current">' + label + '</span>');
  }
  return parts.join("");
}

function renderMelds(player) {
  if (!player.melds.length) return "";
  return player.melds.map(function (meld) {
    let marked = false;
    const face = meld.concealed
      ? '<span class="back-tile" aria-label="Face-down tile"></span><span class="back-tile" aria-label="Face-down tile"></span><span class="back-tile" aria-label="Face-down tile"></span><span class="back-tile" aria-label="Face-down tile"></span>'
      : meld.tiles.map(function (tile) {
        const isTakenTile = !marked && meld.claimedTileId !== undefined && tile.id === meld.claimedTileId;
        if (isTakenTile) marked = true;
        return tinyFace(tile, isTakenTile ? "taken-origin" : "");
      }).join("");
    const name = meld.type === "kong" ? (meld.concealed ? "SECRET KANG" : "KANG") : meld.type.toUpperCase();
    const sourceName = meld.fromIndex === undefined ? "" : SHORT_NAMES[meld.fromIndex];
    const source = sourceName ? '<span class="meld-source">← ' + sourceName + '</span>' : "";
    const title = name + (sourceName ? " · from " + PLAYER_NAMES[meld.fromIndex] : "");
    return '<div class="meld-block' + (source ? " called-meld" : "") + '" title="' + title + '"><span class="meld-name">' + name + '</span>' + source + face + '</div>';
  }).join("");
}

function highlightEventSeats(seat, index) {
  const latest = state.history[0];
  if (!latest) return;
  if (latest.actor === index) seat.classList.add("event-seat");
  if (latest.source === index && latest.actor !== index) seat.classList.add("source-seat");
}

function visibleBacks(player, side) {
  const limit = side ? 6 : 15;
  const shown = Math.min(player.hand.length, limit);
  let markup = "";
  for (let i = 0; i < shown; i += 1) markup += '<span class="back-tile" aria-hidden="true"></span>';
  if (player.hand.length > shown) markup += '<span class="hidden-count">+' + (player.hand.length - shown) + '</span>';
  return markup;
}

function renderOpponent(index) {
  const player = state.players[index];
  const side = index === 1 || index === 3;
  const seat = byId("seat-" + index);
  seat.className = "seat " + (index === 2 ? "seat-top" : index === 1 ? "seat-left seat-side" : "seat-right seat-side");
  if (state.turn === index && state.phase !== "finished") seat.classList.add("active-seat");
  highlightEventSeats(seat, index);
  const melds = renderMelds(player);
  const flowers = player.flowers.map(function (tile) { return tinyFace(tile); }).join("");
  const discards = player.discards.slice(-12).map(function (entry) { return discardFace(entry); }).join("");
  seat.innerHTML =
    '<div class="seat-head"><div class="seat-name"><span class="seat-name-text">' + player.name + '</span>' + seatBadge(index) + '</div><span class="seat-score">' + player.score + ' pts</span></div>' +
    '<div class="seat-subrow"><div class="back-row">' + visibleBacks(player, side) + '</div><div class="mini-melds">' + melds + '</div><div class="mini-flowers">' + flowers + '</div></div>' +
    '<div class="mini-discards">' + discards + '</div>';
}

function renderHuman() {
  const player = state.players[0];
  const seat = byId("seat-0");
  seat.className = "seat seat-bottom";
  if (state.turn === 0 && state.phase !== "finished") seat.classList.add("active-seat");
  highlightEventSeats(seat, 0);
  const melds = renderMelds(player);
  const flowers = player.flowers.map(function (tile) { return tinyFace(tile); }).join("");
  const hand = player.hand.map(function (tile, index) {
    const separator = index > 0 && index % 4 === 0 ? '<span class="hand-separator" aria-hidden="true"></span>' : "";
    const selected = tile.id === state.selectedTileId ? " selected" : "";
    const drawn = tile.id === state.drawnTileId ? " last-drawn" : "";
    const disabled = state.turn !== 0 || state.phase !== "discard" ? " disabled" : "";
    return separator + '<button type="button" class="tile tile-button' + (tile.kind === "suited" ? " " + SUITS[SUIT_INDEX[tile.suit]].color : "") + selected + drawn + '" data-tile-id="' + tile.id + '" title="Select ' + tileName(tile) + '"' + disabled + '>' +
      (tile.kind === "bonus" ? '<span class="tile-rank">' + tile.label + '</span><span class="tile-suit">' + tile.family + '</span>' : '<span class="tile-rank">' + tile.rank + '</span><span class="tile-suit">' + SUITS[SUIT_INDEX[tile.suit]].short + '</span>') +
      '</button>';
  }).join("");
  const shape = state.turn === 0 && state.phase === "discard" ? getWinningShape(player.hand, player.melds) : null;
  seat.innerHTML =
    '<div class="seat-head"><div class="seat-name"><span class="seat-name-text">You</span>' + seatBadge(0) + '</div><span class="seat-score">' + player.score + ' pts</span></div>' +
    '<div class="meld-area">' + melds + '</div>' +
    '<div class="seat-subrow"><div class="mini-flowers">' + flowers + '</div><div class="mini-discards">' + player.discards.slice(-9).map(function (entry) { return discardFace(entry); }).join("") + '</div></div>' +
    '<div class="hand-area" id="handArea">' + hand + '</div>' +
    '<div class="player-hand-label"><span>YOUR HAND</span><span class="hand-count">' + player.hand.length + ' TILES</span></div>';
}

function renderLastDiscard() {
  const box = byId("lastDiscard");
  if (!state.lastDiscard) {
    box.innerHTML = "";
    return;
  }
  const entry = state.lastDiscard;
  const riverEntry = entry.entry;
  const claimed = riverEntry && riverEntry.claimedBy !== undefined;
  const latest = state.history[0];
  const isLatestTile = latest && latest.tile && latest.tile.id === entry.tile.id;
  const tileClass = claimed
    ? (latest && latest.kind === "call" && isLatestTile ? "tile-taken" : "tile-taken-static")
    : (latest && latest.kind === "discard" && isLatestTile ? "discard-arrive" : "discard-resting");
  let detail = state.players[entry.from].name + " discarded";
  if (claimed) {
    detail += '<br><span class="discard-taken">TAKEN BY ' + SHORT_NAMES[riverEntry.claimedBy] + ' · ' + riverEntry.claimedWith.toUpperCase() + '</span>';
  } else if (state.phase === "claim" && state.pending === entry) {
    detail += '<br><span class="discard-waiting">CLAIM WINDOW OPEN</span>';
  } else {
    detail += '<br><span class="discard-resting">IN THE RIVER</span>';
  }
  box.innerHTML = '<div class="discard-focus">' + tileFace(entry.tile, tileClass) + '<small><strong>' + tileName(entry.tile) + '</strong><br>' + detail + '</small></div>';
}

function renderClaimTray() {
  const tray = byId("claimTray");
  if (state.phase !== "claim" || !state.pending) {
    tray.innerHTML = "";
    return;
  }
  const label = state.claimOptions.length ? "YOUR CALL" : (state.botClaims.length ? "CALL READY" : "CLAIM WINDOW");
  tray.innerHTML = '<span class="claim-chip">' + label + '</span><span class="claim-arrow">← ' + state.players[state.pending.from].name + '</span>';
}

function actionDescription(event) {
  const actor = PLAYER_NAMES[event.actor];
  if (event.kind === "dealer") return { icon: "MANO", text: actor + " leads." };
  if (event.kind === "discard") return { icon: "THROW", text: actor + " discarded ", tile: event.tile };
  if (event.kind === "call") {
    return { icon: "CALL", text: actor + " took ", tile: event.tile, after: " from " + PLAYER_NAMES[event.source] + " · " + event.call };
  }
  if (event.kind === "draw" && event.replacement) {
    return { icon: "BACK", text: actor + " took a replacement from the back wall" + (event.tile ? ": " : "."), tile: event.tile };
  }
  if (event.kind === "draw") {
    return { icon: "DRAW", text: actor + (event.hidden ? " drew from the wall." : " drew "), tile: event.hidden ? null : event.tile };
  }
  if (event.kind === "flower") return { icon: "FLORES", text: actor + " exposed ", tile: event.tile, after: " · back-wall replacement" };
  if (event.kind === "secret-kang") return { icon: "KANG", text: actor + " declared Secret Kang." };
  if (event.kind === "sagasa") return { icon: "KANG", text: actor + " upgraded a Pung to Kang · ", tile: event.tile };
  if (event.kind === "win") return { icon: "WIN", text: (event.actor === 0 ? "You win with " : actor + " wins with ") + event.winType + (event.tile ? " on " : "."), tile: event.tile };
  return { icon: "WALL", text: "The wall is exhausted. Hand ends in a draw." };
}

function renderActivityFeed() {
  const feed = byId("activityFeed");
  if (!state.history.length) {
    feed.innerHTML = '<div class="activity-empty">The table action trail will appear here.</div>';
    return;
  }
  const events = state.history.slice(0, 2).reverse();
  feed.innerHTML = events.map(function (event, index) {
    const description = actionDescription(event);
    const tile = description.tile ? tinyFace(description.tile, "activity-tile") : "";
    return '<div class="activity-item kind-' + event.kind + (index === events.length - 1 ? " activity-new" : "") + '">' +
      '<span class="activity-kind">' + description.icon + '</span>' +
      '<span class="activity-copy"><span class="activity-text">' + description.text + '</span>' + tile + '<span class="activity-after">' + (description.after || "") + '</span></span></div>';
  }).join("");
}

function buttonMarkup(label, action, extraClass, disabled, extra) {
  return '<button type="button" class="action-button' + (extraClass ? " " + extraClass : "") + '" data-action="' + action + '"' +
    (disabled ? " disabled" : "") + (extra || "") + '>' + label + '</button>';
}

function renderActions() {
  const container = byId("actionButtons");
  const hint = byId("actionHint");
  let buttons = "";
  if (state.phase === "claim") {
    if (state.claimOptions.length) {
      hint.textContent = "That discard can help your hand. Choose a call or pass.";
      state.claimOptions.forEach(function (option, index) {
        const label = option.type === "win" ? "TODAS · WIN" : option.label.toUpperCase();
        buttons += '<button type="button" class="action-button' + (option.type === "win" ? " gold" : "") + '" data-claim-index="' + index + '">' + label + '</button>';
      });
      buttons += buttonMarkup("Pass", "pass", "", false);
    } else {
      hint.textContent = "Waiting for the table to answer the discard…";
      buttons = buttonMarkup("Waiting…", "none", "", true);
    }
  } else if (state.phase === "discard" && state.turn === 0) {
    const player = state.players[0];
    const shape = getWinningShape(player.hand, player.melds);
    hint.textContent = shape ? "A complete hand. Claim Bunot, or keep playing." : (state.selectedTileId ? "Tile selected. Discard it to pass the turn." : "Choose a tile to discard.");
    const selected = player.hand.find(function (tile) { return tile.id === state.selectedTileId; });
    buttons += buttonMarkup("Discard", "discard", "strong", !selected);
    if (shape) buttons += buttonMarkup("Bunot · win", "win", "gold", false);
    selfKongOptions(player).forEach(function (option, index) {
      buttons += buttonMarkup(option.label, "kong", "", false, ' data-kong-index="' + index + '"');
    });
  } else if (state.phase === "finished") {
    hint.textContent = "Hand complete.";
  } else {
    hint.textContent = "The table is playing…";
  }
  container.innerHTML = buttons;
}

function renderScores() {
  byId("scoreStrip").innerHTML = state.players.map(function (player) {
    return '<div class="score-chip' + (player.index === 0 ? " current" : "") + '"><span class="score-seat">' + player.name + '</span><span class="score-value">' + player.score + '</span></div>';
  }).join("");
}

function render() {
  if (!state) return;
  byId("roundLabel").textContent = "HAND " + state.handNumber;
  byId("wallCount").textContent = "WALL " + remainingWall();
  byId("statusText").textContent = state.message;
  renderOpponent(2);
  renderOpponent(1);
  renderOpponent(3);
  renderHuman();
  renderLastDiscard();
  renderClaimTray();
  renderActivityFeed();
  renderActions();
  renderScores();
}

function takeHumanDiscard() {
  const player = state.players[0];
  const tile = player.hand.find(function (item) { return item.id === state.selectedTileId; });
  if (!tile || state.phase !== "discard" || state.turn !== 0) return;
  discardTile(0, tile, "human");
}

function handleActionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "discard") takeHumanDiscard();
  if (action === "win") finishHand(0, "Bunot", null);
  if (action === "pass") resolveClaims({ type: "pass" });
  if (action === "kong") {
    const options = selfKongOptions(state.players[0]);
    const option = options[Number(button.dataset.kongIndex)];
    if (option) declareKong(0, option);
  }
}

byId("seat-0").addEventListener("click", function (event) {
  const tileButton = event.target.closest("[data-tile-id]");
  if (!tileButton || tileButton.disabled || state.phase !== "discard" || state.turn !== 0) return;
  state.selectedTileId = Number(tileButton.dataset.tileId);
  render();
});

byId("actionButtons").addEventListener("click", handleActionClick);
byId("actionButtons").addEventListener("click", function (event) {
  const button = event.target.closest("[data-claim-index]");
  if (!button) return;
  const option = state.claimOptions[Number(button.dataset.claimIndex)];
  if (option) resolveClaims(option);
});

byId("rulesButton").addEventListener("click", function () { byId("rulesDialog").hidden = false; });
byId("closeRulesButton").addEventListener("click", function () { byId("rulesDialog").hidden = true; });
byId("gotItButton").addEventListener("click", function () { byId("rulesDialog").hidden = true; });
byId("rulesDialog").addEventListener("click", function (event) {
  if (event.target === byId("rulesDialog")) byId("rulesDialog").hidden = true;
});
byId("newGameButton").addEventListener("click", function () {
  if (window.confirm("Start a new game and reset all scores?")) {
    byId("resultDialog").hidden = true;
    createGame(false, 1);
  }
});
byId("nextHandButton").addEventListener("click", function () {
  byId("resultDialog").hidden = true;
  createGame(true, state.handNumber + 1);
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") byId("rulesDialog").hidden = true;
});

createGame(false, 1);
