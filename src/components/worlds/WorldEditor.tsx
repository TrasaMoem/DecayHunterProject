import { useEffect, useMemo, useState } from "react";
import {
  addDaysIso,
  analyzeTraits,
  inferPrimaryLockFromTraits,
  traitsFromPartial,
} from "@/lib/engine/analyze";
import { emptyTraits, type WorldRow, type WorldTraits } from "@/lib/types";
import { isValidWorldName, normalizeWorldName, worldNameHint } from "@/lib/validation/worldName";
import { TraitEditor } from "./TraitEditor";
import type { ObservationInput } from "@/lib/api";

interface WorldEditorProps {
  initial?: Partial<WorldRow> & { traits?: Partial<WorldTraits> };
  onSave: (payload: ObservationInput) => Promise<void>;
  onCancel: () => void;
}

export function WorldEditor({ initial, onSave, onCancel }: WorldEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [addReason, setAddReason] = useState(initial?.addReason ?? "");
  const [note, setNote] = useState("");
  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join(", "));
  const [isFavorite, setIsFavorite] = useState(initial?.isFavorite ?? false);
  const [traits, setTraits] = useState<WorldTraits>(
    traitsFromPartial(initial?.traits as Partial<WorldTraits>),
  );
  const [manualNextCheck, setManualNextCheck] = useState(initial?.nextCheckManual ?? false);
  const [manualNextCheckDate, setManualNextCheckDate] = useState(
    initial?.nextCheckAt?.slice(0, 10) ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const analysis = useMemo(() => analyzeTraits(traits), [traits]);
  useEffect(() => {
    if (!initial) return;
  
    setName(initial.name ?? "");
    setOwnerName(initial.ownerName ?? "");
    setAddReason(initial.addReason ?? "");
    setNote("");
    setTagsRaw((initial.tags ?? []).join(", "));
    setIsFavorite(initial.isFavorite ?? false);
  
    setTraits(
      traitsFromPartial(initial.traits as Partial<WorldTraits>)
    );
  
    setManualNextCheck(initial.nextCheckManual ?? false);
    setManualNextCheckDate(
      initial.nextCheckAt?.slice(0, 10) ?? ""
    );
  }, [initial]);

  useEffect(() => {
    if (!manualNextCheck && !manualNextCheckDate) {
      setManualNextCheckDate(addDaysIso(new Date(), analysis.suggestedNextCheckDays).slice(0, 10));
    }
  }, [analysis.suggestedNextCheckDays, manualNextCheck, manualNextCheckDate]);

  const submit = async () => {
    const normalized = normalizeWorldName(name);
    if (!isValidWorldName(normalized)) {
      setNameError(worldNameHint());
      return;
    }
    if (!ownerName.trim()) {
      setNameError("Owner name is required.");
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      const tags = tagsRaw
        .split(/[,#\s]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const nextCheckAt = manualNextCheck
        ? new Date(manualNextCheckDate).toISOString()
        : addDaysIso(new Date(), analysis.suggestedNextCheckDays);

      let status = analysis.suggestedStatus;
      if (traits.worldLockDecayed) status = "decayed";

      await onSave({
        id: initial?.id,
        name: normalized,
        ownerName: ownerName.trim().toUpperCase(),
        addReason: addReason.trim() || "Manual add",
        isFavorite,
        status,
        primaryLock: inferPrimaryLockFromTraits(traits),
        tags,
        note,
        score: analysis.score,
        decayProb: analysis.decayProb,
        lootProb: analysis.lootProb,
        autoSummary: analysis.summary,
        nextCheckAt,
        nextCheckManual: manualNextCheck,
        traits,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="world-editor">
      <div className="world-editor__grid">
        <label>
          World name
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            placeholder="STORAGE"
          />
        </label>
        <label>
          Owner
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value.toUpperCase())}
            placeholder="FRANK123"
          />
        </label>
        <label className="span-2">
          Why added
          <input
            value={addReason}
            onChange={(e) => setAddReason(e.target.value)}
            placeholder="Small decay on owner farm…"
          />
        </label>
        <label className="span-2">
          Tags
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="storage, farm, smalllock"
          />
        </label>
        <label className="span-2">
          Check note
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nothing changed since last visit…"
          />
        </label>
        <label className="trait-inline">
          <input
            type="checkbox"
            checked={isFavorite}
            onChange={(e) => setIsFavorite(e.target.checked)}
          />
          Favorite
        </label>
        <label className="trait-inline">
          <input
            type="checkbox"
            checked={manualNextCheck}
            onChange={(e) => setManualNextCheck(e.target.checked)}
          />
          Manual next check (override auto)
        </label>
        {manualNextCheck && (
          <label>
            Next check date
            <input
              type="date"
              value={manualNextCheckDate}
              onChange={(e) => setManualNextCheckDate(e.target.value)}
            />
          </label>
        )}
      </div>

      {nameError && <p className="form-error">{nameError}</p>}

      <TraitEditor traits={traits} onChange={setTraits} />

      <aside className="analysis-panel">
        <h3>Live analysis</h3>
        <div className="analysis-kpi">
          <span>{analysis.score}/100</span>
          <span>{analysis.priorityTier}</span>
          <span>{analysis.stars}★</span>
        </div>
        <p>
          <strong>Decay:</strong> {analysis.decayProb}% · <strong>Loot (simple):</strong>{" "}
          {analysis.lootProb}%
        </p>
        {!manualNextCheck && (
          <p className="muted">Auto next check: ~{analysis.suggestedNextCheckDays} days</p>
        )}
        <pre className="analysis-summary">{analysis.summary}</pre>
      </aside>

      <div className="editor-actions">
        <button
          type="button"
          className="btn ghost cursor-target"
          onClick={onCancel}
        >
        Cancel
      </button>

  <button
    type="button"
    className={`btn primary cursor-target ${saving ? "disabled" : ""}`}
    disabled={saving}
    onClick={() => void submit()}
  >
    {saving ? "Saving…" : initial?.id ? "Save check" : "Add world"}
  </button>
</div>
    </div>
  );
}

export function blankTraits(): WorldTraits {
  return emptyTraits();
}
