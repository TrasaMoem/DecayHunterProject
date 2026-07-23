import { invoke } from "@tauri-apps/api/core";
import type { ObservationRecord, StatsSnapshot, WorldDetail, WorldRow, WorldTraits } from "./types";

export interface ObservationInput {
  id?: number;
  name: string;
  ownerName: string;
  addReason: string;
  isFavorite: boolean;
  status: string;
  primaryLock: string;
  tags: string[];
  note: string;
  score: number;
  decayProb: number;
  lootProb: number;
  autoSummary: string;
  nextCheckAt: string | null;
  nextCheckManual: boolean;
  traits: WorldTraits;
}

export interface ExportBundle {
  version: number;
  exported_at: string;
  data: unknown;
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function listWorlds(): Promise<WorldRow[]> {
  if (!isTauri()) return demoWorlds();
  return invoke<WorldRow[]>("list_worlds");
}

export async function getWorldDetail(worldId: number): Promise<WorldDetail> {
  if (!isTauri()) {
    const w = demoWorlds().find((x) => x.id === worldId);
    if (!w) throw new Error("Not found");
    return { world: w, observations: [] };
  }
  return invoke<WorldDetail>("get_world_detail", { worldId });
}

export async function saveWorldWithObservation(payload: ObservationInput): Promise<WorldDetail> {
  if (!isTauri()) {
    return {
      world: {
        id: payload.id ?? 1,
        name: payload.name,
        ownerName: payload.ownerName,
        addReason: payload.addReason,
        isFavorite: payload.isFavorite,
        status: payload.status,
        primaryLock: payload.primaryLock,
        score: payload.score,
        decayProb: payload.decayProb,
        lootProb: payload.lootProb,
        priorityTier: "B",
        lastCheckedAt: new Date().toISOString(),
        nextCheckAt: payload.nextCheckAt,
        nextCheckManual: payload.nextCheckManual,
        tags: payload.tags,
        worldLockDecayed: payload.traits.worldLockDecayed,
      },
      observations: [],
    };
  }
  return invoke<WorldDetail>("save_world_with_observation", { payload });
}

export async function deleteWorld(worldId: number): Promise<void> {
  if (!isTauri()) return;
  return invoke("delete_world", { worldId });
}

export async function getStats(): Promise<StatsSnapshot> {
  if (!isTauri()) {
    const worlds = demoWorlds();
    return {
      totalWorlds: worlds.length,
      checkedToday: 0,
      averageScore: 72,
      topWorldName: worlds[0]?.name ?? null,
      topWorldScore: worlds[0]?.score ?? 0,
      smallLockDecayCount: 1,
      worldsWithPets: 1,
      worldLockDecayCount: 0,
      dueTodayCount: 1,
      overdueCount: 0,
    };
  }
  return invoke<StatsSnapshot>("get_stats");
}

export async function exportDatabase(): Promise<ExportBundle> {
  return invoke<ExportBundle>("export_database");
}

export async function importDatabase(bundle: ExportBundle): Promise<void> {
  return invoke("import_database", { bundle });
}

export async function listOwnerWorlds(ownerName: string): Promise<WorldRow[]> {
  if (!isTauri()) return demoWorlds().filter((w) => w.ownerName === ownerName);
  return invoke<WorldRow[]>("list_owner_worlds", { ownerName });
}

function demoWorlds(): WorldRow[] {
  return [
    {
      id: 1,
      name: "STORAGE",
      ownerName: "FRANK123",
      addReason: "Small decay on linked farm",
      isFavorite: true,
      status: "watching",
      primaryLock: "world",
      score: 88,
      decayProb: 72,
      lootProb: 55,
      priorityTier: "A",
      lastCheckedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      nextCheckAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      nextCheckManual: false,
      tags: ["storage", "smalllock"],
      worldLockDecayed: false,
    },
    {
      id: 2,
      name: "FARM",
      ownerName: "FRANK123",
      addReason: "Rusty Small Lock",
      isFavorite: false,
      status: "watching",
      primaryLock: "small",
      score: 76,
      decayProb: 65,
      lootProb: 30,
      priorityTier: "A",
      lastCheckedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      nextCheckAt: new Date().toISOString(),
      nextCheckManual: false,
      tags: ["farm"],
      worldLockDecayed: false,
    },
    {
      id: 3,
      name: "NEWBASE",
      ownerName: "ALICE",
      addReason: "Hungry Catagotchi",
      isFavorite: false,
      status: "candidate",
      primaryLock: "newbie",
      score: 42,
      decayProb: 38,
      lootProb: 25,
      priorityTier: "C",
      lastCheckedAt: null,
      nextCheckAt: new Date(Date.now() + 86400000 * 7).toISOString(),
      nextCheckManual: false,
      tags: ["pets"],
      worldLockDecayed: false,
    },
  ];
}

export type { ObservationRecord };
