import { useEffect, useMemo, useState } from "react";
import { addDaysIso, analyzeTraits, inferPrimaryLockFromTraits } from "@/lib/engine/analyze";
import { emptyTraits, type WorldRow, type WorldTraits } from "@/lib/types";
import { isValidWorldName, normalizeWorldName, worldNameHint } from "@/lib/validation/worldName";
import type { ObservationInput } from "@/lib/api";
import { LockPreview } from "./LockPreview";
import type { WizardFormData } from "@/lib/wizardForm";
import { initialFormData } from "@/lib/wizardForm";
import {
  EditorNameOwner,
  EditorReasonTags,
  EditorLockStatus,
  EditorOmenDecay,
  EditorProfitWaiting,
} from "./WorldEditorSections";

interface WorldEditorProps {
  initial?: Partial<WorldRow> & { traits?: Partial<WorldTraits> };
  onSave: (payload: ObservationInput) => Promise<void>;
  onCancel: () => void;
}

type EditorSection = "name" | "reason" | "locks" | "omen" | "profit" | "analysis";

const SECTIONS: { id: EditorSection; label: string }[] = [
  { id: "name", label: "Name & Owner" },
  { id: "reason", label: "Reason & Tags" },
  { id: "locks", label: "Lock Status" },
  { id: "omen", label: "Omen of Decay" },
  { id: "profit", label: "Profit of Waiting" },
  { id: "analysis", label: "Live Analysis" },
];

export function WorldEditor({ initial, onSave, onCancel }: WorldEditorProps) {
  const [activeSection, setActiveSection] = useState<EditorSection | null>(null);
  // Parse traits from initial data back into form fields
  const formFromInitial = () => {
    const f = initialFormData();
    if (!initial) return f;
    const t = initial.traits;

    f.name = initial.name ?? "";
    f.ownerName = initial.ownerName ?? "";
    f.addReason = initial.addReason ?? "";
    f.tags = (initial.tags ?? []).length > 0 ? [...(initial.tags ?? [])] : ["None"];
    f.isFavorite = initial.isFavorite ?? false;
    f.manualNextCheck = initial.nextCheckManual ?? false;
    f.manualNextCheckDate = initial.nextCheckAt?.slice(0, 10) ?? "";

    // Restore lock states from traits
    if (t) {
      if (t.newbieLockPresent || t.newbieLockDecayed) f.newbieLock = t.newbieLockDecayed ? "Decayed" : "Intact";
      if (t.smallLockPresent || t.smallLockDecayed) f.smallLock = t.smallLockDecayed ? "Decayed" : "Intact";
      if (t.worldLockPresent || t.worldLockDecayed || t.worldLockIntact) {
        f.worldLock = t.worldLockDecayed ? "Decayed" : t.worldLockIntact ? "Intact" : "None";
      }
      if (t.farmOvergrown) f.omenFarmOvergrown = true;
      if (t.semiDestroyed) f.omenSemiDestroyedBlocksFarms = true;
      // Restore extended wizard fields
      if (t.omenForgottenPets !== undefined) f.omenForgottenPets = t.omenForgottenPets;
      if (t.omenOldStuff !== undefined) f.omenOldStuff = t.omenOldStuff;
      if (t.omenOldStuffDays !== undefined) f.omenOldStuffDays = t.omenOldStuffDays;
      if (t.stuffPrice !== undefined) f.stuffPrice = t.stuffPrice as WizardFormData["stuffPrice"];
      if (t.rarity !== undefined) f.rarity = t.rarity as WizardFormData["rarity"];
      if (t.manyPortals !== undefined) f.manyPortals = t.manyPortals as WizardFormData["manyPortals"];
      if (t.amountOfRates !== undefined) f.amountOfRates = t.amountOfRates as WizardFormData["amountOfRates"];
    }

    return f;
  };

  // Staged editing: committedForm = last Done-pressed state, form = working state
  const [committedForm, setCommittedForm] = useState<WizardFormData>(formFromInitial);
  const [form, setForm] = useState<WizardFormData>(formFromInitial);

  // Re-initialize form when initial data changes (async load)
  useEffect(() => {
    const f = formFromInitial();
    setForm(f);
    setCommittedForm(f);
    setNameError(null);
    setStepError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Auto-detect rarity based on world name
  useEffect(() => {
    const name = normalizeWorldName(form.name);
    if (!name) return;
    if (name.length === 2) { setForm(prev => ({ ...prev, rarity: "expensive" })); return; }
    if (name.length === 3) { setForm(prev => ({ ...prev, rarity: "solid" })); return; }
    const chars = name.split("");
    const uniqueChars = new Set(chars);
    if (uniqueChars.size === 1) { setForm(prev => ({ ...prev, rarity: "solid" })); return; }
    if (name.length <= 6 && uniqueChars.size === 2) { setForm(prev => ({ ...prev, rarity: "solid" })); return; }
  }, [form.name]);

  // Auto-cleanup lock cascading
  useEffect(() => {
    setForm(prev => {
      let changed = false;
      let next = { ...prev };
      if (next.smallLock === "Decayed" && next.newbieLock !== "None") { next.newbieLock = "None"; changed = true; }
      if (next.worldLock !== "None" && next.newbieLock !== "None") { next.newbieLock = "None"; changed = true; }
      if (next.newbieLock !== "None" && next.worldLock !== "None") { next.worldLock = "None"; changed = true; }
      if (next.worldLock === "Decayed" && next.smallLock !== "None") { next.smallLock = "None"; changed = true; }
      return changed ? next : prev;
    });
  }, [form.newbieLock, form.smallLock, form.worldLock]);

  const updateField = <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setNameError(null);
    setStepError(null);
  };

  // Back: discard working changes, restore from committed
  const handleBack = () => {
    setForm({ ...committedForm });
    setNameError(null);
    setStepError(null);
    setActiveSection(null);
  };

  // Done: commit working changes to staged state
  const handleDone = () => {
    if (activeSection === "name") {
      const normalized = normalizeWorldName(form.name);
      if (!isValidWorldName(normalized)) { setNameError(worldNameHint()); return; }
      if (!form.ownerName.trim()) { setNameError("Owner name is required."); return; }
      setNameError(null);
    }
    if (activeSection === "locks") { const err = validateLocks(); if (err) { setStepError(err); return; } }
    setCommittedForm({ ...form });
    setActiveSection(null);
  };

  const toggleTag = (tag: string) => {
    setForm(prev => {
      if (tag === "None") { return prev; }
      const newTags = prev.tags.filter(t => t !== "None");
      const exists = newTags.includes(tag);
      const result = exists ? newTags.filter(t => t !== tag) : [...newTags, tag];
      if (result.length === 0) return { ...prev, tags: ["None"] };
      return { ...prev, tags: result };
    });
  };

  const addCustomTag = () => {
    const tag = form.customTag.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => {
        const withoutNone = prev.tags.filter(t => t !== "None");
        return { ...prev, tags: [...withoutNone, tag], customTag: "" };
      });
    }
  };

  const validateLocks = (): string | null => {
    const { newbieLock, smallLock, worldLock } = form;
    if (newbieLock === "None" && smallLock === "None" && worldLock === "None") return "At least one lock type must be selected.";
    if (newbieLock === "Intact" && smallLock === "Decayed") return "Small Lock decayed (90d) but Newbie Lock intact (30d) is inconsistent.";
    if (worldLock === "Decayed" && smallLock === "Intact") return "World Lock decayed (365d) but Small Lock intact (90d) is impossible.";
    return null;
  };

  const buildTraits = (): WorldTraits => {
    const t = emptyTraits();
    t.newbieLockPresent = form.newbieLock === "Intact";
    t.newbieLockDecayed = form.newbieLock === "Decayed";
    t.smallLockPresent = form.smallLock === "Intact";
    t.smallLockDecayed = form.smallLock === "Decayed";
    t.worldLockPresent = form.worldLock === "Intact";
    t.worldLockDecayed = form.worldLock === "Decayed";
    t.worldLockIntact = form.worldLock === "Intact";
    if (form.omenSemiDestroyedBlocksFarms) {
      t.semiDestroyed = true;
      if (form.smallLock === "None") t.smallLockDecayed = true;
    }
    t.farmOvergrown = form.omenFarmOvergrown;
    // Persist extended wizard fields
    t.omenForgottenPets = form.omenForgottenPets;
    t.omenOldStuff = form.omenOldStuff;
    t.omenOldStuffDays = form.omenOldStuffDays || undefined;
    t.stuffPrice = form.stuffPrice;
    t.rarity = form.rarity;
    t.manyPortals = form.manyPortals;
    t.amountOfRates = form.amountOfRates;
    return t;
  };

  const traits = useMemo(() => buildTraits(), [
    form.newbieLock, form.smallLock, form.worldLock,
    form.omenSemiDestroyedBlocksFarms, form.omenFarmOvergrown,
    form.omenForgottenPets, form.omenOldStuff, form.omenOldStuffDays,
    form.stuffPrice, form.rarity, form.manyPortals, form.amountOfRates,
  ]);

  const analysis = useMemo(() => analyzeTraits(traits), [traits]);

  const estimatedAbsentDays = useMemo(() => {
    let days = 0;
    if (form.omenOldStuff && form.omenOldStuffDays) days = Math.max(days, parseInt(form.omenOldStuffDays) || 0);
    if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) days = Math.max(days, 90);
    if (form.newbieLock === "Decayed") days = Math.max(days, 30);
    if (form.worldLock === "Decayed") days = Math.max(days, 365);
    if (form.omenForgottenPets) days = Math.max(days, 3);
    return days;
  }, [form.omenOldStuff, form.omenOldStuffDays, form.smallLock, form.omenSemiDestroyedBlocksFarms, form.newbieLock, form.worldLock, form.omenForgottenPets]);

  const remainingDaysUntilDecay = useMemo(() => {
    if (form.worldLock === "Intact") { const passed = Math.max(estimatedAbsentDays, form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms ? 90 : 0); return Math.max(0, 365 - passed); }
    if (form.newbieLock === "Intact") return Math.max(0, 30 - estimatedAbsentDays);
    if (form.smallLock === "Intact") return Math.max(0, 90 - estimatedAbsentDays);
    return 0;
  }, [form.worldLock, form.newbieLock, form.smallLock, estimatedAbsentDays, form.omenSemiDestroyedBlocksFarms]);

  const isDecayContradiction = useMemo(() => {
    if (form.worldLock === "Intact" && estimatedAbsentDays >= 365) return true;
    if (form.smallLock === "Intact" && estimatedAbsentDays >= 90) return true;
    if (form.newbieLock === "Intact" && estimatedAbsentDays >= 30) return true;
    return false;
  }, [form.worldLock, form.smallLock, form.newbieLock, estimatedAbsentDays]);

  const possibleDecayDate = useMemo(() => {
    if (isDecayContradiction) return "Cannot calculate (contradicting data)";
    const now = new Date();
    if (remainingDaysUntilDecay > 0) return addDaysIso(now, remainingDaysUntilDecay).slice(0, 10);
    if (form.worldLock === "Decayed") return addDaysIso(now, -365).slice(0, 10);
    if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) return addDaysIso(now, -90).slice(0, 10);
    if (form.newbieLock === "Decayed") return addDaysIso(now, -30).slice(0, 10);
    return addDaysIso(now, 30).slice(0, 10);
  }, [remainingDaysUntilDecay, form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms, isDecayContradiction]);

  const estimatedDestructionPercent = useMemo(() => {
    if (isDecayContradiction) return -1;
    let totalDays = 0;
    if (form.worldLock === "Intact" || form.worldLock === "Decayed") totalDays = 365;
    else if (form.smallLock === "Intact" || form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) totalDays = 90;
    else if (form.newbieLock === "Intact" || form.newbieLock === "Decayed") totalDays = 30;
    else totalDays = 90;
    if (totalDays === 0) return 0;
    return Math.min(100, Math.round((estimatedAbsentDays / totalDays) * 100));
  }, [form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms, estimatedAbsentDays, isDecayContradiction]);

  const claimChancePercent = useMemo(() => {
    let chance = 70;
    switch (form.rarity) { case "solid": chance -= 15; break; case "expensive": chance -= 30; break; }
    switch (form.stuffPrice) { case "weak": chance -= 2; break; case "decent": chance -= 5; break; case "solid": chance -= 8; break; case "expensive": chance -= 12; break; case "godlike": chance -= 18; break; }
    switch (form.amountOfRates) { case "small": chance -= 5; break; case "big": chance -= 15; break; }
    if (form.omenSemiDestroyedBlocksFarms) chance -= 10;
    if (form.worldLock === "Decayed") chance -= 30;
    return Math.max(5, Math.min(95, chance));
  }, [form.rarity, form.stuffPrice, form.amountOfRates, form.omenSemiDestroyedBlocksFarms, form.worldLock]);

  const adjustedScore = useMemo(() => {
    let score = analysis.score;
    switch (form.stuffPrice) { case "weak": score += 5; break; case "decent": score += 10; break; case "solid": score += 15; break; case "expensive": score += 20; break; case "godlike": score += 30; break; }
    switch (form.rarity) { case "solid": score += 10; break; case "expensive": score += 20; break; }
    if (form.manyPortals === "yes") score += 5;
    switch (form.amountOfRates) { case "small": score += 3; break; case "big": score += 8; break; }
    return Math.min(100, Math.max(0, score));
  }, [analysis, form.stuffPrice, form.rarity, form.manyPortals, form.amountOfRates]);

  const adjustedPriorityTier = adjustedScore >= 90 ? "S" : adjustedScore >= 75 ? "A" : adjustedScore >= 60 ? "B" : adjustedScore >= 40 ? "C" : "D";
  const adjustedStars = Math.max(1, Math.min(5, Math.round(adjustedScore / 20)));

  const previewLock = useMemo(() => {
    if (form.worldLock === "Intact") return "world" as const;
    if (form.smallLock === "Intact") return "small" as const;
    if (form.newbieLock === "Intact") return "newbie" as const;
    if (form.worldLock === "Decayed") return "world" as const;
    if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) return "small" as const;
    if (form.newbieLock === "Decayed") return "newbie" as const;
    return "small" as const;
  }, [form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms]);

  const autoNextCheckDays = useMemo(() => {
    let days = 30;
    if (form.worldLock === "Intact") days = 4;
    else if (form.smallLock === "Intact") days = 2;
    else if (form.newbieLock === "Intact") days = 2;
    else if (form.worldLock === "Decayed") days = 30;
    else if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) days = 14;
    else if (form.newbieLock === "Decayed") days = 7;
    switch (form.rarity) { case "solid": days = Math.max(days, 7); break; case "expensive": days = Math.max(days, 14); break; }
    switch (form.stuffPrice) { case "weak": days = Math.min(days, 10); break; case "decent": days = Math.min(days, 7); break; case "solid": days = Math.min(days, 5); break; case "expensive": days = Math.min(days, 3); break; case "godlike": days = Math.min(days, 2); break; }
    if (form.rarity === "expensive" && (form.stuffPrice === "godlike" || form.stuffPrice === "expensive")) days = Math.min(days, 1);
    return Math.max(1, days);
  }, [form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms, form.rarity, form.stuffPrice]);

  const customSummary = useMemo(() => {
    const lines = analysis.summary.split("\n");
    const filtered = lines.filter(line => !line.toLowerCase().includes("recommended recheck"));
    let recheckLine = "";
    if (form.worldLock === "Intact") recheckLine = `Recommended recheck in about 4 day(s).`;
    else if (form.smallLock === "Intact") recheckLine = `Recommended recheck in about 2 day(s).`;
    else if (form.newbieLock === "Intact") recheckLine = `Recommended recheck in about 2 day(s).`;
    else if (form.worldLock === "Decayed") recheckLine = `World Lock already decayed. No urgent recheck needed.`;
    else if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) recheckLine = `Recommended recheck in about 14 day(s).`;
    else if (form.newbieLock === "Decayed") recheckLine = `Recommended recheck in about 7 day(s).`;
    else recheckLine = `Recommended recheck in about 30 day(s).`;
    filtered.push(recheckLine);
    return filtered.join("\n\n");
  }, [analysis.summary, form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms]);

  const handleSave = async () => {
    const normalized = normalizeWorldName(form.name);
    if (!isValidWorldName(normalized)) { setNameError(worldNameHint()); return; }
    if (!form.ownerName.trim()) { setNameError("Owner name is required."); return; }
    setNameError(null);
    setSaving(true);
    try {
      const tags = form.tags.map(t => t.toLowerCase());
      const nextCheckAt = form.manualNextCheck
        ? new Date(form.manualNextCheckDate).toISOString()
        : addDaysIso(new Date(), autoNextCheckDays);
      let status = analysis.suggestedStatus;
      if (form.worldLock === "Decayed") status = "decayed";
      const omenParts: string[] = [];
      if (form.omenForgottenPets) omenParts.push("Forgotten Pets");
      if (form.omenSemiDestroyedBlocksFarms) omenParts.push("Semi-destroyed blocks/farms");
      if (form.omenOldStuff) omenParts.push(`Old Stuff (~${form.omenOldStuffDays || "?"} days)`);
      if (form.omenFarmOvergrown) omenParts.push("Farm Overgrown");
      const omenNote = omenParts.length ? `Omen: ${omenParts.join(", ")}` : "";
      await onSave({
        id: initial?.id,
        name: normalized,
        ownerName: form.ownerName.trim().toUpperCase(),
        addReason: form.addReason.trim() || "Manual edit",
        isFavorite: form.isFavorite,
        status,
        primaryLock: inferPrimaryLockFromTraits(traits),
        tags,
        note: omenNote,
        score: adjustedScore,
        decayProb: analysis.decayProb,
        lootProb: Math.round(claimChancePercent),
        autoSummary: `${customSummary}\n\nProfit estimate: ${form.stuffPrice} price, ${form.rarity} rarity. Claim chance: ${claimChancePercent}%.`,
        nextCheckAt,
        nextCheckManual: form.manualNextCheck,
        traits,
      });
    } finally {
      setSaving(false);
    }
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case "name":
        return <EditorNameOwner form={form} nameError={nameError} setNameError={setNameError} onUpdate={updateField} />;
      case "reason":
        return <EditorReasonTags form={form} onUpdate={updateField} toggleTag={toggleTag} addCustomTag={addCustomTag} />;
      case "locks":
        return <EditorLockStatus form={form} onUpdate={updateField} stepError={stepError} />;
      case "omen":
        return <EditorOmenDecay form={form} onUpdate={updateField} />;
      case "profit":
        return <EditorProfitWaiting form={form} onUpdate={updateField} />;
      case "analysis":
        return (
          <div>
            <div className="analysis-world-header">
              <h2 className="analysis-world-name">{form.name || "—"}</h2>
              <p className="analysis-world-owner muted">{form.ownerName || "—"}</p>
            </div>
            <LockPreview lock={previewLock} />
            <div className="analysis-panel">
              <div className="analysis-kpi">
                <span className={adjustedScore >= 70 ? "score-good" : adjustedScore >= 40 ? "score-mid" : "score-low"}>{adjustedScore}/100</span>
                <span>{adjustedPriorityTier}</span>
                <span>{adjustedStars}★</span>
              </div>
              <div className="analysis-details">
                <div className="analysis-row"><span className="muted">Possible Lock Decay Time:</span><strong className={isDecayContradiction ? "text-warning" : ""}>{possibleDecayDate}</strong></div>
                {remainingDaysUntilDecay > 0 && !isDecayContradiction && <div className="analysis-row"><span className="muted">Estimated time until decay:</span><strong>~{remainingDaysUntilDecay} days</strong></div>}
                <div className="analysis-row"><span className="muted">Estimated destruction:</span><strong className={isDecayContradiction ? "text-warning" : ""}>{isDecayContradiction ? "Cannot calculate" : `${estimatedDestructionPercent}%`}</strong></div>
                <div className="analysis-row"><span className="muted">Claim chance:</span><strong>{claimChancePercent}%</strong></div>
              </div>
              <pre className="analysis-summary">{customSummary}</pre>
              <div className="analysis-options">
                <label className="trait-inline"><input type="checkbox" checked={form.isFavorite} onChange={(e) => updateField("isFavorite", e.target.checked)} className="cursor-target" /> Favorite</label>
                <label className="trait-inline"><input type="checkbox" checked={form.manualNextCheck} onChange={(e) => updateField("manualNextCheck", e.target.checked)} className="cursor-target" /> Manual next check</label>
                {form.manualNextCheck && <label>Next check date <input type="date" value={form.manualNextCheckDate} onChange={(e) => updateField("manualNextCheckDate", e.target.value)} className="cursor-target" /></label>}
                {!form.manualNextCheck && <p className="muted small">Auto next check: ~{autoNextCheckDays} days ({addDaysIso(new Date(), autoNextCheckDays).slice(0, 10)})</p>}
              </div>
            </div>
          </div>
        );
      default: return null;
    }
  };

  if (activeSection) {
    return (
      <div className="world-editor">
        <div className="editor-detail-header">
          <button type="button" className="btn ghost cursor-target" onClick={handleBack}>← Back</button>
          <span className="muted">{SECTIONS.find(s => s.id === activeSection)?.label}</span>
        </div>
        <div className="editor-section-content">
          {renderSectionContent()}
        </div>
        <div className="editor-actions">
          <button type="button" className="btn ghost cursor-target" onClick={onCancel}>Cancel</button>
          {activeSection !== "analysis" && (
            <button type="button" className="btn primary cursor-target" onClick={handleDone}>Done</button>
          )}
          {activeSection === "analysis" && (
            <button type="button" className={`btn primary cursor-target ${saving ? "disabled" : ""}`} disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : initial?.id ? "Save check" : "Add world"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="world-editor">
      <div className="editor-card-list">
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="editor-card cursor-target"
            onClick={() => setActiveSection(id)}
          >
            <span className="editor-card-label">{label}</span>
            <span className="editor-card-arrow">→</span>
          </button>
        ))}
      </div>
      <div className="editor-actions">
        <button type="button" className="btn ghost cursor-target" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary cursor-target" onClick={() => setActiveSection("analysis")}>
          {initial?.id ? "Save check" : "Add world"}
        </button>
      </div>
    </div>
  );
}