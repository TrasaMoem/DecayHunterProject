import { useMemo, useState } from "react";
import { TRAIT_GROUPS, type WorldTraits } from "@/lib/types";

interface TraitEditorProps {
  traits: WorldTraits;
  onChange: (next: WorldTraits) => void;
}

export function TraitEditor({ traits, onChange }: TraitEditorProps) {
  const [customLabel, setCustomLabel] = useState("");

  const toggle = (key: keyof WorldTraits) => {
    if (key === "custom") return;
    onChange({ ...traits, [key]: !traits[key] });
  };

  const addCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, "_");
    onChange({
      ...traits,
      custom: { ...traits.custom, [key]: true },
    });
    setCustomLabel("");
  };

  const customEntries = useMemo(() => Object.entries(traits.custom), [traits.custom]);

  return (
    <div className="trait-editor">
      {TRAIT_GROUPS.map((group) => (
        <section key={group.id} className="trait-group">
          <h4>{group.label}</h4>
          <div className="trait-grid">
            {group.fields.map((field) => (
              <label key={field.key} className="trait-check">
                <input
                  type="checkbox"
                  checked={Boolean(traits[field.key])}
                  onChange={() => toggle(field.key)}
                />
                <span>{field.label}</span>
              </label>
            ))}
          </div>
        </section>
      ))}

      <section className="trait-group">
        <h4>Custom traits</h4>
        <div className="inline-form">
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Add custom signal…"
          />
          <button type="button" onClick={addCustom}>
            Add
          </button>
        </div>
        <div className="trait-grid">
          {customEntries.map(([key, on]) => (
            <label key={key} className="trait-check">
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  onChange({
                    ...traits,
                    custom: { ...traits.custom, [key]: !on },
                  })
                }
              />
              <span>{key.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
