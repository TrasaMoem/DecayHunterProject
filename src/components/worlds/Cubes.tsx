import React from "react";

type CubeItem = {
  id?: string;
  name?: string;
  score?: number;
  status?: string;
};

type CubesProps = {
  items?: CubeItem[];
  children?: React.ReactNode;
};

export default function Cubes({ items = [], children }: CubesProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "16px",
        width: "100%",
      }}
    >
      {children}

      {items.map((item, index) => (
        <div
          key={item.id ?? index}
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "var(--card-background, #1e1e1e)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <h3>{item.name ?? "Unknown World"}</h3>

          {item.score !== undefined && (
            <p>
              Score: {item.score}
            </p>
          )}

          {item.status && (
            <p>
              Status: {item.status}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}