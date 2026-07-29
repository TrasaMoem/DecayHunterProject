import type { WorldRow } from "@/lib/types";
import { formatShortDate, isDue, starsFromScore, statusColor } from "@/lib/ui";

interface WorldsTableProps {
  worlds: WorldRow[];
  query: string;
  onSelect: (world: WorldRow) => void;
  onToggleFavorite: (world: WorldRow) => void;
}

function matchWorld(world: WorldRow, q: string): boolean {
  if (!q) return true;

  const hay = [
    world.name,
    world.ownerName,
    world.addReason,
    world.status,
    world.primaryLock,
    world.priorityTier,
    String(world.score),
    String(world.decayProb),
    String(world.lootProb),
    ...world.tags,
  ]
    .join(" ")
    .toLowerCase();

  return hay.includes(q.toLowerCase());
}

function scoreColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#fbbf24";
  return "#ef4444";
}

function lootColor(pct: number): string {
  if (pct >= 60) return "#22c55e";
  if (pct >= 30) return "#fbbf24";
  return "#94a3b8";
}

export function WorldsTable({
  worlds,
  query,
  onSelect,
  onToggleFavorite,
}: WorldsTableProps) {
  const filtered = worlds.filter((w) => matchWorld(w, query));

  return (
    <div className="table-wrap">
      <table className="worlds-table">
        <thead>
          <tr>
            <th />
            <th>World</th>
            <th>Tier</th>
            <th>Score</th>
            <th>Stars</th>
            <th>Decay</th>
            <th>Loot</th>
            <th>Why added</th>
            <th>Last check</th>
            <th>Next check</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
        {filtered.map((world) => {
  const overdue = isDue(world.nextCheckAt);
  const stars = starsFromScore(world.score);

  return (
    <tr
      key={world.id}
      onClick={() => onSelect(world)}
      className="cursor-target table-world-row"
    >
      <td>
        <button
          type="button"
          className={`fav-btn ${world.isFavorite ? "on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(world);
          }}
          aria-label="Toggle favorite"
        >
          ★
        </button>
      </td>

      <td>
        <div className="world-cell">
          <span
            className="status-dot"
            style={{ background: statusColor(world.status, overdue) }}
          />

          <div>
            <strong>{world.name}</strong>
            <div className="muted small">
              {world.ownerName}
            </div>
          </div>
        </div>
      </td>

      <td>{world.priorityTier}</td>

      <td style={{ color: scoreColor(world.score), fontWeight: 600 }}>
        {world.score}
      </td>

      <td>
        <span className="muted small" style={{ fontSize: "1rem", letterSpacing: "0.05em" }}>
          {stars}
        </span>
      </td>

      <td>{world.decayProb}%</td>

      <td style={{ color: lootColor(world.lootProb) }}>
        {world.lootProb}%
      </td>

      <td className="reason-cell">
        {world.addReason}
      </td>

      <td>
        {formatShortDate(world.lastCheckedAt)}
      </td>

      <td className={overdue ? "due-text" : ""}>
        {formatShortDate(world.nextCheckAt)}
      </td>

      <td>
        {world.status}
      </td>
    </tr>
  );
})}
        </tbody>
      </table>

      {!filtered.length && (
        <p className="empty-panel muted">
          No worlds match your filters.
        </p>
      )}
    </div>
  );
}
