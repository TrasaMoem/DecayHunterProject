import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import "./Cubes.css";
import hoverSound from "@/assets/sounds/cube-hover.mp3";

export interface CubeCellData {
  id: string | number;
  label: string;
  textureUrl: string;
  subtitle?: string;
  accentColor?: string;
}

export interface CubesProps {
  gridSize: number;
  cells: Map<string, CubeCellData>;
  cubeSize?: number;
  maxAngle?: number;
  radius?: number;
  easing?: string;
  duration?: { enter: number; leave: number };
  cellGap?: number | { row?: number; col?: number };
  borderStyle?: string;
  faceColor?: string;
  shadow?: boolean | string;
  autoAnimate?: boolean;
  rippleOnClick?: boolean;
  rippleColor?: string;
  rippleSpeed?: number;
  onCellClick?: (cell: CubeCellData, row: number, col: number) => void;
  className?: string;
}

const Cubes = ({
  gridSize,
  cells,
  cubeSize,
  maxAngle = 45,
  radius = 3,
  easing = "power3.out",
  duration = { enter: 0.3, leave: 0.6 },
  cellGap,
  borderStyle = "1px solid rgba(255,255,255,0.12)",
  faceColor = "#120F17",
  shadow = false,
  autoAnimate = true,
  rippleOnClick = true,
  rippleColor = "#5227FF",
  rippleSpeed = 2,
  onCellClick,
  className = "",
}: CubesProps) => {
  console.log("🔥 CUBES COMPONENT LOADED", {
    gridSize,
    cells: Array.from(cells.entries()),
  });
  const sceneRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const hoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastHoverRef = useRef<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userActiveRef = useRef(false);
  const simPosRef = useRef({ x: 0, y: 0 });
  const simTargetRef = useRef({ x: 0, y: 0 });
  const simRAFRef = useRef<number | null>(null);

  const colGap =
    typeof cellGap === "number"
      ? `${cellGap}px`
      : cellGap?.col !== undefined
        ? `${cellGap.col}px`
        : "4%";
  const rowGap =
    typeof cellGap === "number"
      ? `${cellGap}px`
      : cellGap?.row !== undefined
        ? `${cellGap.row}px`
        : "4%";

  const enterDur = duration.enter;
  const leaveDur = duration.leave;

  const tiltAt = useCallback(
    (rowCenter: number, colCenter: number) => {
      if (!sceneRef.current) return;
      sceneRef.current.querySelectorAll<HTMLElement>(".cube").forEach((cube) => {
        const r = +cube.dataset.row!;
        const c = +cube.dataset.col!;
        const dist = Math.hypot(r - rowCenter, c - colCenter);
        if (dist <= radius) {
          const pct = 1 - dist / radius;
          const angle = pct * maxAngle;
          gsap.to(cube, {
            duration: enterDur,
            ease: easing,
            overwrite: true,
            rotateX: -angle,
            rotateY: angle,
          });
        } else {
          gsap.to(cube, {
            duration: leaveDur,
            ease: "power3.out",
            overwrite: true,
            rotateX: 0,
            rotateY: 0,
          });
        }
      });
    },
    [radius, maxAngle, enterDur, leaveDur, easing],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      userActiveRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      const rect = sceneRef.current!.getBoundingClientRect();
      const cellW = rect.width / gridSize;
      const cellH = rect.height / gridSize;
      const colCenter = (e.clientX - rect.left) / cellW;
      const rowCenter = (e.clientY - rect.top) / cellH;
      const col = Math.floor(colCenter);
      const row = Math.floor(rowCenter);
      const key = `${row}-${col}`;

      if (cells.has(key) && lastHoverRef.current !== key) {
        lastHoverRef.current = key;

        const audio = hoverAudioRef.current;

      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
    }

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => tiltAt(rowCenter, colCenter));

      idleTimerRef.current = setTimeout(() => {
        userActiveRef.current = false;
      }, 3000);
    },
    [gridSize, tiltAt],
  );

  const resetAll = useCallback(() => {
    if (!sceneRef.current) return;
    sceneRef.current.querySelectorAll(".cube").forEach((cube) =>
      gsap.to(cube, {
        duration: leaveDur,
        rotateX: 0,
        rotateY: 0,
        ease: "power3.out",
      }),
    );
  }, [leaveDur]);

  const onClick = useCallback(
    (e: MouseEvent) => {
      if (!sceneRef.current) return;
      const rect = sceneRef.current.getBoundingClientRect();
      const cellW = rect.width / gridSize;
      const cellH = rect.height / gridSize;

      const colHit = Math.floor((e.clientX - rect.left) / cellW);
      const rowHit = Math.floor((e.clientY - rect.top) / cellH);
      const key = `${rowHit}-${colHit}`;
      const cell = cells.get(key);

      if (cell && onCellClick) {
        onCellClick(cell, rowHit, colHit);
      }

      if (!rippleOnClick || !cell) return;

      const baseRingDelay = 0.15;
      const baseAnimDur = 0.3;
      const baseHold = 0.6;
      const spreadDelay = baseRingDelay / rippleSpeed;
      const animDuration = baseAnimDur / rippleSpeed;
      const holdTime = baseHold / rippleSpeed;

      const rings: Record<number, Element[]> = {};
      sceneRef.current.querySelectorAll<HTMLElement>(".cube").forEach((cube) => {
        if (cube.classList.contains("cube--empty")) return;
        const r = +cube.dataset.row!;
        const c = +cube.dataset.col!;
        const dist = Math.hypot(r - rowHit, c - colHit);
        const ring = Math.round(dist);
        if (!rings[ring]) rings[ring] = [];
        rings[ring].push(cube);
      });

      Object.keys(rings)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((ring) => {
          const delay = ring * spreadDelay;
          const faces = rings[ring].flatMap((cube) =>
            Array.from(cube.querySelectorAll(".cube-face")),
          );
          gsap.to(faces, {
            backgroundColor: rippleColor,
            duration: animDuration,
            delay,
            ease: "power3.out",
          });
          gsap.to(faces, {
            backgroundColor: faceColor,
            duration: animDuration,
            delay: delay + animDuration + holdTime,
            ease: "power3.out",
          });
        });
    },
    [rippleOnClick, gridSize, faceColor, rippleColor, rippleSpeed, cells, onCellClick],
  );
  useEffect(() => {
    hoverAudioRef.current = new Audio(hoverSound);
    hoverAudioRef.current.volume = 1;
  
    return () => {
      hoverAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!autoAnimate || !sceneRef.current) return;
    simPosRef.current = {
      x: Math.random() * gridSize,
      y: Math.random() * gridSize,
    };
    simTargetRef.current = {
      x: Math.random() * gridSize,
      y: Math.random() * gridSize,
    };
    const speed = 0.02;
    const loop = () => {
      if (!userActiveRef.current) {
        const pos = simPosRef.current;
        const tgt = simTargetRef.current;
        pos.x += (tgt.x - pos.x) * speed;
        pos.y += (tgt.y - pos.y) * speed;
        tiltAt(pos.y, pos.x);
        if (Math.hypot(pos.x - tgt.x, pos.y - tgt.y) < 0.1) {
          simTargetRef.current = {
            x: Math.random() * gridSize,
            y: Math.random() * gridSize,
          };
        }
      }
      simRAFRef.current = requestAnimationFrame(loop);
    };
    simRAFRef.current = requestAnimationFrame(loop);
    return () => {
      if (simRAFRef.current != null) cancelAnimationFrame(simRAFRef.current);
    };
  }, [autoAnimate, gridSize, tiltAt]);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", resetAll);
    el.addEventListener("click", onClick);

    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", resetAll);
      el.removeEventListener("click", onClick);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [onPointerMove, resetAll, onClick]);

  const gridCells = Array.from({ length: gridSize });

  const sceneStyle: CSSProperties = {
    gridTemplateColumns: cubeSize
      ? `repeat(${gridSize}, ${cubeSize}px)`
      : `repeat(${gridSize}, 1fr)`,
    gridTemplateRows: cubeSize
      ? `repeat(${gridSize}, ${cubeSize}px)`
      : `repeat(${gridSize}, 1fr)`,
    columnGap: colGap,
    rowGap: rowGap,
  };

  const wrapperStyle: CSSProperties = {
    ["--cube-face-border" as string]: borderStyle,
    ["--cube-face-bg" as string]: faceColor,
    ["--cube-face-shadow" as string]:
      shadow === true ? "0 0 6px rgba(0,0,0,.5)" : shadow || "none",
    ...(cubeSize
      ? {
          width: `${gridSize * cubeSize}px`,
          height: `${gridSize * cubeSize}px`,
        }
      : {}),
  };
  console.log("CUBES RENDER", {
    gridSize,
    cells: Array.from(cells.entries())
  });
  return (
    <div className={`default-animation ${className}`} style={wrapperStyle}>
      <div ref={sceneRef} className="default-animation--scene" style={sceneStyle}>
        {gridCells.map((_, r) =>
          gridCells.map((__, c) => {
            const key = `${r}-${c}`;
            const data = cells.get(key);
            const empty = !data;
            return (
              <div
                key={key}
                className={`cube ${empty ? "cube--empty" : "cube--filled cursor-target"}`}
                data-row={r}
                data-col={c}
                style={
                  data?.accentColor
                    ? ({ ["--cube-accent" as string]: data.accentColor } as CSSProperties)
                    : undefined
                }
              >
                <div className="cube-face cube-face--top" />
                <div className="cube-face cube-face--bottom" />
                <div className="cube-face cube-face--left" />
                <div className="cube-face cube-face--right" />
                <div
                  className="cube-face cube-face--front"
                  style={
                    data
                      ? {
                          //backgroundImage: `url(${data.textureUrl})`,
                          //backgroundSize: "cover",
                          //backgroundPosition: "center",
                          backgroundImage: `url("${data.textureUrl}")`,
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {data && (
                    <div className="cube-label">
                      <span className="cube-label__name">{data.label}</span>
                      {data.subtitle && (
                        <span className="cube-label__sub">{data.subtitle}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="cube-face cube-face--back" />
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
};

export default Cubes;
