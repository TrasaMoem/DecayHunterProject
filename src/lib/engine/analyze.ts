import type { AnalysisResult, PrimaryLock, WorldStatus, WorldTraits } from "../types";

const LOCK_DAYS = {
  newbie: 30,
  small: 90,
  medium: 90,
  large: 90,
  world: 365,
} as const;

const WEIGHTS: Partial<Record<keyof WorldTraits, number>> = {
  smallLockDecayed: 45,
  newbieLockDecayed: 30,
  catagotchiHungry: 10,
  dogagotchiHungry: 10,
  catagotchiSick: 15,
  dogagotchiSick: 15,
  noNewItems: 10,
  oldEventItems: 10,
  emptyShop: 5,
  abandonedLook: 10,
  sameOwnerConfirmed: 20,
  otherOwnerWorldsFound: 15,
  unchangedLongTime: 8,
  farmOvergrown: 6,
  oldBlocks: 5,
  oldMachines: 5,
  semiDestroyed: 4,
  manyChests: 5,
  collectionWorld: 8,
  storageWorld: 6,
  shopWorld: 4,
  farmWorld: 3,
  secretWorld: 7,
  petsHealthy: -12,
  newItemsPresent: -15,
  recentChanges: -20,
};

const CHECK_INTERVALS: Partial<Record<keyof WorldTraits, number>> = {
  smallLockDecayed: 30,
  newbieLockDecayed: 14,
  newbieLockPresent: 7,
  catagotchiHungry: 10,
  dogagotchiHungry: 10,
  catagotchiSick: 12,
  dogagotchiSick: 12,
  worldLockIntact: 45,
  abandonedLook: 21,
  noNewItems: 14,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function absentDays(traits: WorldTraits): number {
  if (traits.worldLockDecayed) return LOCK_DAYS.world;
  if (traits.smallLockDecayed) return LOCK_DAYS.small;
  if (traits.newbieLockDecayed) return LOCK_DAYS.newbie;
  return 0;
}

function inferPrimaryLock(traits: WorldTraits): PrimaryLock {
  if (traits.worldLockPresent || traits.worldLockIntact || traits.worldLockDecayed) {
    return "world";
  }
  if (traits.newbieLockPresent || traits.newbieLockDecayed) {
    return "newbie";
  }
  return "small";
}

function lootScore(traits: WorldTraits): number {
  let loot = 20;
  if (traits.manyChests) loot += 25;
  if (traits.collectionWorld) loot += 20;
  if (traits.storageWorld) loot += 15;
  if (traits.shopWorld) loot += 10;
  if (traits.secretWorld) loot += 12;
  if (traits.abandonedLook) loot += 5;
  return clamp(loot, 0, 100);
}

function buildSummary(
  traits: WorldTraits,
  absentMin: number,
  wlMax: number | null,
  nextDays: number,
): string {
  const parts: string[] = [];

  if (traits.worldLockDecayed) {
    parts.push(
      "World Lock has already decayed on this world. Track it for statistics only; further decay checks are not needed.",
    );
  } else if (traits.smallLockDecayed) {
    parts.push("Rusty Small Lock detected.");
    if (traits.worldLockPresent || traits.worldLockIntact) {
      parts.push(
        "If the World Lock belongs to the same owner, owner inactivity is at least 90 days.",
      );
      if (wlMax != null) {
        parts.push(`Estimated time until World Lock decay: up to ${wlMax} days (upper bound).`);
      }
    }
  } else if (traits.newbieLockDecayed) {
    parts.push("Newbie Lock decay detected — owner absence of at least 30 days.");
  } else if (traits.newbieLockPresent) {
    parts.push("Newbie Lock present — shorter 30-day decay window; recheck soon.");
  }

  const soft: string[] = [];
  if (traits.catagotchiHungry || traits.dogagotchiHungry) soft.push("hungry pets");
  if (traits.catagotchiSick || traits.dogagotchiSick) soft.push("sick pets");
  if (traits.noNewItems) soft.push("no items from recent updates");
  if (traits.abandonedLook) soft.push("abandoned appearance");
  if (traits.otherOwnerWorldsFound || traits.sameOwnerConfirmed) {
    soft.push("owner portfolio linked");
  }
  if (soft.length) {
    parts.push(`Supporting signals (${soft.join(", ")}) increase long-inactivity likelihood.`);
  }

  if (traits.petsHealthy || traits.newItemsPresent || traits.recentChanges) {
    parts.push("Negative activity signals suggest the owner may still play — treat score with caution.");
  }

  parts.push(`Recommended recheck in about ${nextDays} day(s).`);
  return parts.join("\n\n");
}

export function analyzeTraits(traits: WorldTraits): AnalysisResult {
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS) as [keyof WorldTraits, number][]) {
    if (key === "custom") continue;
    if (traits[key] === true) score += weight;
  }
  for (const val of Object.values(traits.custom)) {
    if (val) score += 5;
  }
  score = clamp(score, 0, 100);

  const absentMin = absentDays(traits);
  let decayProb = clamp(absentMin > 0 ? 35 + absentMin / 4 : score * 0.45, 0, 100);
  if (traits.sameOwnerConfirmed && traits.smallLockDecayed) decayProb = clamp(decayProb + 15, 0, 100);
  if (traits.worldLockDecayed) decayProb = 100;

  if (traits.petsHealthy) decayProb = clamp(decayProb - 10, 0, 100);
  if (traits.newItemsPresent) decayProb = clamp(decayProb - 15, 0, 100);
  if (traits.recentChanges) decayProb = clamp(decayProb - 20, 0, 100);

  const lootProb = lootScore(traits);

  let suggestedNextCheckDays = 30;
  const intervals: number[] = [];
  for (const [key, days] of Object.entries(CHECK_INTERVALS) as [keyof WorldTraits, number][]) {
    if (traits[key] === true) intervals.push(days);
  }
  if (intervals.length) {
    suggestedNextCheckDays = Math.min(...intervals);
    if (intervals.length >= 3) {
      suggestedNextCheckDays = Math.max(7, Math.floor(suggestedNextCheckDays * 0.7));
    }
  }

  let suggestedStatus: WorldStatus = "watching";
  if (traits.worldLockDecayed) suggestedStatus = "decayed";
  else if (score >= 75) suggestedStatus = "watching";
  else if (score >= 40) suggestedStatus = "candidate";

  const wlMax =
    absentMin >= LOCK_DAYS.small && (traits.worldLockPresent || traits.worldLockIntact)
      ? LOCK_DAYS.world - absentMin
      : null;

  const priorityTier =
    score >= 90 ? "S" : score >= 75 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";

  return {
    score,
    decayProb: Math.round(decayProb),
    lootProb,
    priorityTier,
    stars: clamp(Math.round(score / 20), 1, 5),
    summary: buildSummary(traits, absentMin, wlMax, suggestedNextCheckDays),
    suggestedNextCheckDays,
    suggestedStatus,
    ownerAbsentMinDays: absentMin,
    worldLockMaxDaysRemaining: wlMax,
  };
}

export function inferPrimaryLockFromTraits(traits: WorldTraits): PrimaryLock {
  return inferPrimaryLock(traits);
}

export function addDaysIso(from: Date, days: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function traitsFromPartial(raw: Partial<WorldTraits> | undefined): WorldTraits {
  const base: WorldTraits = {
    newbieLockPresent: false,
    smallLockPresent: false,
    mediumLockPresent: false,
    largeLockPresent: false,
    worldLockPresent: false,
    newbieLockDecayed: false,
    smallLockDecayed: false,
    worldLockIntact: false,
    worldLockDecayed: false,
    sameOwnerConfirmed: false,
    otherOwnerWorldsFound: false,
    catagotchiHungry: false,
    catagotchiSick: false,
    dogagotchiHungry: false,
    dogagotchiSick: false,
    noPets: false,
    abandonedLook: false,
    emptyShop: false,
    oldBlocks: false,
    oldMachines: false,
    oldEventItems: false,
    noNewItems: false,
    unchangedLongTime: false,
    farmOvergrown: false,
    semiDestroyed: false,
    manyChests: false,
    collectionWorld: false,
    storageWorld: false,
    shopWorld: false,
    farmWorld: false,
    secretWorld: false,
    ownerOnlyAccess: false,
    petsHealthy: false,
    newItemsPresent: false,
    recentChanges: false,
    custom: {},
  };
  if (!raw) return base;
  return { ...base, ...raw, custom: raw.custom ?? {} };
}
