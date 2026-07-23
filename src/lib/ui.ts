import type { PrimaryLock } from "@/lib/types";
import smallLockImg from "@/assets/locks/DSL.png";
import worldLockImg from "@/assets/locks/DWL.png";
import newbieLockImg from "@/assets/locks/DNL.png";

console.log({
  smallLockImg,
  worldLockImg,
  newbieLockImg
});

export function lockImageForPrimary(primary: string): string {
  switch (primary as PrimaryLock) {
    case "world":
      return worldLockImg;
    case "newbie":
      return newbieLockImg;
    default:
      return smallLockImg;
  }
}

export function statusColor(status: string, overdue: boolean): string {
  if (overdue) return "#ef4444";

  switch (status) {
    case "watching":
      return "#22c55e";

    case "due":
      return "#f97316";

    case "decayed":
      return "#a855f7";

    case "archived":
      return "#64748b";

    case "candidate":
      return "#38bdf8";

    default:
      return "#38bdf8";
  }
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isDue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now();
}

export function starsFromScore(score: number): string {
  const n = Math.max(1, Math.min(5, Math.round(score / 20)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}
