import { useMemo } from "react";
import Cubes, { type CubeCellData } from "../Cubes/Cubes";
import type { WorldRow } from "@/lib/types";
import { isDue, lockImageForPrimary, statusColor } from "@/lib/ui";

interface WorldCubesGridProps {
  worlds: WorldRow[];
  onSelectWorld: (world: WorldRow) => void;
}

function gridDimension(count: number): number {
  if (count <= 0) return 4;
  const side = Math.ceil(Math.sqrt(count));
  return Math.max(4, Math.min(10, side));
}

export function WorldCubesGrid({ worlds, onSelectWorld }: WorldCubesGridProps) {
  console.log("WORLD CUBES", worlds);
  const active = worlds.filter((w) => !w.worldLockDecayed && w.status !== "archived");
  console.log("ACTIVE WORLDS", active);
  const gridSize = gridDimension(active.length);
  console.log("CUBES INPUT:", worlds);
  const { cellMap, worldById } = useMemo(() => {
    const map = new Map<string, CubeCellData>();
    const byId = new Map<number, WorldRow>();
    active.forEach((world, index) => {
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;
      const key = `${row}-${col}`;
      byId.set(world.id, world);
      map.set(key, {
        id: world.id,
        label: world.name,
        subtitle: `${world.priorityTier} · ${world.score}`,
        textureUrl: lockImageForPrimary(world.primaryLock),
        accentColor: statusColor(world.status, isDue(world.nextCheckAt)),
      });
    });
    console.log("CELL MAP", map);
  return { cellMap: map, worldById: byId };}, [active, gridSize]);
  if (!active.length) {
    return (
      <div className="empty-panel">
        <p>No worlds to display in cube view yet.</p>
        <p className="muted">Add a world from the Table tab or Quick Add.</p>
      </div>
    );
  }

  return (
    <div className="world-cubes-wrap">
    <Cubes
      gridSize={gridSize}
      cells={cellMap}
      maxAngle={30}
      radius={1.5}
      borderStyle="1px dashed rgba(82, 39, 255, 0.45)"
      faceColor="#1a1a2e"
      rippleColor="#ff6b6b"
      rippleSpeed={1}
      autoAnimate
      rippleOnClick
      onCellClick={(cell) => {
        const world = worldById.get(Number(cell.id));
        if (world) onSelectWorld(world);
      }}
    />
      <p className="world-cubes-hint muted">
        Click a cube to open the world card. Lock art on the front face: blue = Small, gold =
        World, pink/green = Newbie. Replace SVGs in <code>src/assets/locks/</code> with your
        Pixel Worlds screenshots.
      </p>
    </div>
  );
}
