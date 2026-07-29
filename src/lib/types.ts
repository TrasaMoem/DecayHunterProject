export type PrimaryLock = "world" | "newbie" | "small";

export type WorldStatus =
  | "candidate"
  | "watching"
  | "due"
  | "overdue"
  | "decayed"
  | "claimed"
  | "archived";

export interface WorldTraits {
  newbieLockPresent: boolean;
  smallLockPresent: boolean;
  mediumLockPresent: boolean;
  largeLockPresent: boolean;
  worldLockPresent: boolean;
  newbieLockDecayed: boolean;
  smallLockDecayed: boolean;
  worldLockIntact: boolean;
  worldLockDecayed: boolean;
  sameOwnerConfirmed: boolean;
  otherOwnerWorldsFound: boolean;
  catagotchiHungry: boolean;
  catagotchiSick: boolean;
  dogagotchiHungry: boolean;
  dogagotchiSick: boolean;
  noPets: boolean;
  abandonedLook: boolean;
  emptyShop: boolean;
  oldBlocks: boolean;
  oldMachines: boolean;
  oldEventItems: boolean;
  noNewItems: boolean;
  unchangedLongTime: boolean;
  farmOvergrown: boolean;
  semiDestroyed: boolean;
  manyChests: boolean;
  collectionWorld: boolean;
  storageWorld: boolean;
  shopWorld: boolean;
  farmWorld: boolean;
  secretWorld: boolean;
  ownerOnlyAccess: boolean;
  petsHealthy: boolean;
  newItemsPresent: boolean;
  recentChanges: boolean;
  custom: Record<string, boolean>;
  // Extended fields for wizard form persistence
  omenForgottenPets?: boolean;
  omenOldStuff?: boolean;
  omenOldStuffDays?: string;
  stuffPrice?: string;
  rarity?: string;
  manyPortals?: string;
  amountOfRates?: string;
}

export const emptyTraits = (): WorldTraits => ({
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
});

export interface TraitGroup {
  id: string;
  label: string;
  fields: { key: keyof WorldTraits; label: string }[];
}

export const TRAIT_GROUPS: TraitGroup[] = [
  {
    id: "locks",
    label: "Locks present",
    fields: [
      { key: "newbieLockPresent", label: "Newbie Lock" },
      { key: "smallLockPresent", label: "Small Lock" },
      { key: "mediumLockPresent", label: "Medium Lock" },
      { key: "largeLockPresent", label: "Large Lock" },
      { key: "worldLockPresent", label: "World Lock" },
    ],
  },
  {
    id: "decay",
    label: "What happened",
    fields: [
      { key: "newbieLockDecayed", label: "Newbie Lock decayed" },
      { key: "smallLockDecayed", label: "Small Lock decayed" },
      { key: "worldLockIntact", label: "World Lock intact" },
      { key: "worldLockDecayed", label: "World Lock decayed" },
      { key: "sameOwnerConfirmed", label: "Same owner confirmed" },
      { key: "otherOwnerWorldsFound", label: "Other owner worlds found" },
    ],
  },
  {
    id: "pets",
    label: "Pets",
    fields: [
      { key: "catagotchiHungry", label: "Catagotchi hungry" },
      { key: "catagotchiSick", label: "Catagotchi sick" },
      { key: "dogagotchiHungry", label: "Dogagotchi hungry" },
      { key: "dogagotchiSick", label: "Dogagotchi sick" },
      { key: "noPets", label: "No pets" },
      { key: "petsHealthy", label: "Pets healthy (negative)" },
    ],
  },
  {
    id: "world",
    label: "World condition",
    fields: [
      { key: "abandonedLook", label: "Looks abandoned" },
      { key: "emptyShop", label: "Empty shop" },
      { key: "oldBlocks", label: "Old blocks" },
      { key: "oldMachines", label: "Old machines" },
      { key: "oldEventItems", label: "Old event items" },
      { key: "noNewItems", label: "No new items" },
      { key: "newItemsPresent", label: "New items present (negative)" },
      { key: "unchangedLongTime", label: "Unchanged for a long time" },
      { key: "recentChanges", label: "Recent changes (negative)" },
      { key: "farmOvergrown", label: "Farm overgrown" },
      { key: "semiDestroyed", label: "Semi-destroyed" },
    ],
  },
  {
    id: "extra",
    label: "Extra signals",
    fields: [
      { key: "manyChests", label: "Many chests" },
      { key: "collectionWorld", label: "Collection world" },
      { key: "storageWorld", label: "Storage" },
      { key: "shopWorld", label: "Shop" },
      { key: "farmWorld", label: "Farm" },
      { key: "secretWorld", label: "Secret world" },
      { key: "ownerOnlyAccess", label: "Owner-only access" },
    ],
  },
];

export interface AnalysisResult {
  score: number;
  decayProb: number;
  lootProb: number;
  priorityTier: string;
  stars: number;
  summary: string;
  suggestedNextCheckDays: number;
  suggestedStatus: WorldStatus;
  ownerAbsentMinDays: number;
  worldLockMaxDaysRemaining: number | null;
}

export interface WorldRow {
  id: number;
  name: string;
  ownerName: string;
  addReason: string;
  isFavorite: boolean;
  status: string;
  primaryLock: string;
  score: number;
  decayProb: number;
  lootProb: number;
  priorityTier: string;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  nextCheckManual: boolean;
  tags: string[];
  worldLockDecayed: boolean;
}

export interface ObservationRecord {
  id: number;
  checkedAt: string;
  note: string;
  score: number;
  decayProb: number;
  lootProb: number;
  autoSummary: string;
  nextCheckAt: string | null;
  traits: Partial<WorldTraits> & { custom?: Record<string, boolean> };
}

export interface WorldDetail {
  world: WorldRow;
  observations: ObservationRecord[];
}

export interface StatsSnapshot {
  totalWorlds: number;
  checkedToday: number;
  averageScore: number;
  topWorldName: string | null;
  topWorldScore: number;
  smallLockDecayCount: number;
  worldsWithPets: number;
  worldLockDecayCount: number;
  dueTodayCount: number;
  overdueCount: number;
}
