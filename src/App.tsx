import { useCallback, useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import {
  exportDatabase,
  getStats,
  importDatabase,
  listWorlds,
  saveWorldWithObservation,
  type ObservationInput,
} from "@/lib/api";
import type { StatsSnapshot, WorldRow, WorldTraits } from "@/lib/types";
import { traitsFromPartial } from "@/lib/engine/analyze";
import { WorldsTable } from "@/components/worlds/WorldsTable";
import { WorldCubesGrid } from "@/components/worlds/WorldCubesGrid";
import { WorldEditor } from "@/components/worlds/WorldEditor";
import { QuickAddWizard } from "@/components/worlds/QuickAddWizard";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { formatShortDate } from "@/lib/ui";
import { getWorldDetail } from "@/lib/api";
import TargetCursor from "@/components/TargetCursor/TargetCursor";
import Silk from "@/components/Silk/Silk";

function AppShell() {
  const navigate = useNavigate();
  const [worlds, setWorlds] = useState<WorldRow[]>([]);
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editorInitial, setEditorInitial] = useState<Partial<WorldRow> & { traits?: Partial<WorldTraits> } | undefined>();
  const [selected, setSelected] = useState<WorldRow | null>(null);
  
  useEffect(() => {
    if (!selected) {
      if (!showAdd) setEditorInitial(undefined);
      return;
    }
    void getWorldDetail(selected.id).then((detail) => {
      const latest = detail.observations[0];
      setEditorInitial({
        ...detail.world,
        traits: latest?.traits,
      });
    });
  }, [selected, showAdd]);

  useEffect(() => {
    if (showAdd && !selected) {
      setEditorInitial(undefined);
    }
  }, [showAdd, selected]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [w, s] = await Promise.all([listWorlds(), getStats()]);
      setWorlds(w);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = async (payload: ObservationInput) => {
    await saveWorldWithObservation(payload);
    setShowAdd(false);
    setSelected(null);
    await refresh();
    navigate("/table");
  };

  const toggleFavorite = async (world: WorldRow) => {
    await saveWorldWithObservation({
      id: world.id,
      name: world.name,
      ownerName: world.ownerName,
      addReason: world.addReason,
      isFavorite: !world.isFavorite,
      status: world.status,
      primaryLock: world.primaryLock,
      tags: world.tags,
      note: "Favorite toggled",
      score: world.score,
      decayProb: world.decayProb,
      lootProb: world.lootProb,
      autoSummary: "Favorite flag updated.",
      nextCheckAt: world.nextCheckAt,
      nextCheckManual: world.nextCheckManual,
      traits: traitsFromPartial({}),
    });
    await refresh();
  };

  const exportData = async () => {
    try {
      const bundle = await exportDatabase();
      const path = await save({
        filters: [{ name: "PW Decay Hunter", extensions: ["pwh.json"] }],
        defaultPath: `pw-decay-export-${new Date().toISOString().slice(0, 10)}.pwh.json`,
      });
      if (!path) return;
      await writeTextFile(path, JSON.stringify(bundle, null, 2));
    } catch {
      const blob = new Blob([JSON.stringify(await exportDatabase(), null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pw-decay-export.pwh.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const importData = async () => {
    try {
      const path = await open({
        filters: [{ name: "PW Decay Hunter", extensions: ["pwh.json", "json"] }],
        multiple: false,
      });
      if (!path || typeof path !== "string") return;
      const raw = await readTextFile(path);
      await importDatabase(JSON.parse(raw));
    } catch {
      alert("Import requires the desktop app (Tauri) build.");
      return;
    }
    await refresh();
  };

  const dueWorlds = worlds.filter(
    (w) =>
      w.nextCheckAt &&
      new Date(w.nextCheckAt).getTime() <= Date.now() &&
      !w.worldLockDecayed &&
      w.status !== "archived",
  );

  return (
    <>
      <Silk
      speed={20}
      scale={1.5}
      color="#10263d"
      noiseIntensity={1}
      rotation={0.2}
      />

      <TargetCursor
      targetSelector=".cursor-target"
      spinDuration={4}
      hideDefaultCursor={true}
      parallaxOn={true}
      cursorColor="#38bdf8"
      cursorColorOnTarget="#ff6b6b"
      />

      <div className="app">
      <header className="app-header">
        <div>
          <h1>PW Decay Hunter</h1>
          <p className="muted">Expert notebook for Pixel Worlds decay hunting</p>
        </div>
        <div className="header-actions">
        <button type="button" className="btn ghost cursor-target" onClick={() => void exportData()}>
            Export
          </button>
          <button type="button" className="btn ghost cursor-target" onClick={() => void importData()}>
            Import
          </button>
          <button type="button" className="btn primary cursor-target" onClick={() => setShowAdd(true)}>
            + Quick add
          </button>
        </div>
      </header>

      {stats && (
        <div className="today-banner">
          <strong>Check today:</strong> {stats.dueTodayCount} worlds
          {stats.overdueCount > 0 && (
            <span className="due-text"> · {stats.overdueCount} overdue</span>
          )}
        </div>
      )}

      <nav className="tabs">
        <NavLink to="/table">Table</NavLink>
        <NavLink to="/cubes">Cubes</NavLink>
        <NavLink to="/today">Today</NavLink>
        <NavLink to="/stats">Stats</NavLink>
      </nav>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, owner, tags, score…"
        />
      </div>

      {loading && <p className="muted">Loading…</p>}

      <Routes>
        <Route
          path="/"
          element={
            <WorldsTable
              worlds={worlds}
              query={query}
              onSelect={setSelected}
              onToggleFavorite={(w) => void toggleFavorite(w)}
            />
          }
        />
        <Route
          path="/table"
          element={
            <WorldsTable
              worlds={worlds}
              query={query}
              onSelect={setSelected}
              onToggleFavorite={(w) => void toggleFavorite(w)}
            />
          }
        />
        <Route
          path="/cubes"
          element={
            <WorldCubesGrid
              worlds={worlds.filter((w) => matchQuery(w, query))}
              onSelectWorld={setSelected}
            />
          }
        />
        <Route
          path="/today"
          element={
            <WorldsTable
              worlds={dueWorlds}
              query={query}
              onSelect={setSelected}
              onToggleFavorite={(w) => void toggleFavorite(w)}
            />
          }
        />
        <Route path="/stats" element={<StatsView stats={stats} worlds={worlds} />} />
      </Routes>

      {showAdd && !selected && (
        <div className="modal-backdrop" onClick={() => { setShowAdd(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Quick add world</h2>
            </div>
            <QuickAddWizard
              onSave={handleSave}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        </div>
      )}
      {selected && !showAdd && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.name}</h2>
              <button
                type="button"
                className="btn ghost cursor-target"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <WorldEditor
              initial={editorInitial ?? selected ?? undefined}
              onSave={handleSave}
              onCancel={() => setSelected(null)}
            />
          </div>
        </div>
      )}
            </div>
          </>
        );
      }

function matchQuery(world: WorldRow, q: string): boolean {
  if (!q) return true;
  const hay = `${world.name} ${world.ownerName} ${world.tags.join(" ")}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function StatsView({ stats, worlds }: { stats: StatsSnapshot | null; worlds: WorldRow[] }) {
  if (!stats) return <p className="muted">No stats yet.</p>;
  const top = [...worlds].sort((a, b) => b.score - a.score).slice(0, 5);
  return (
    <div className="stats-grid">
      <StatCard label="Total worlds" value={String(stats.totalWorlds)} />
      <StatCard label="Checked today" value={String(stats.checkedToday)} />
      <StatCard label="Average score" value={stats.averageScore.toFixed(1)} />
      <StatCard label="Small Lock decay (checks)" value={String(stats.smallLockDecayCount)} />
      <StatCard label="Worlds with pets" value={String(stats.worldsWithPets)} />
      <StatCard label="World Lock decayed (stats)" value={String(stats.worldLockDecayCount)} />
      <StatCard
        label="Most promising"
        value={stats.topWorldName ? `${stats.topWorldName} (${stats.topWorldScore})` : "—"}
      />
      <div className="stat-card wide">
        <h3>Top 5 by score</h3>
        <ul>
          {top.map((w) => (
            <li key={w.id}>
              {w.name} — {w.score} ({w.priorityTier}) · next {formatShortDate(w.nextCheckAt)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default AppShell;
