import { useState, useMemo, useEffect, useCallback } from "react";
import { addDaysIso, analyzeTraits, inferPrimaryLockFromTraits } from "@/lib/engine/analyze";
import { emptyTraits, type AnalysisResult, type WorldRow, type WorldTraits } from "@/lib/types";
import { isValidWorldName, normalizeWorldName, worldNameHint } from "@/lib/validation/worldName";
import type { ObservationInput } from "@/lib/api";
import { getWorldDetail, listOwnerWorlds } from "@/lib/api";
import { LockPreview } from "./LockPreview";
import { WorldsTable } from "./WorldsTable";
import { WorldEditor } from "./WorldEditor";

type LockState = "None" | "Intact" | "Decayed";

interface FormData {
  name: string;
  ownerName: string;
  addReason: string;
  tags: string[];
  customTag: string;
  newbieLock: LockState;
  smallLock: LockState;
  worldLock: LockState;
  omenForgottenPets: boolean;
  omenSemiDestroyedBlocksFarms: boolean;
  omenOldStuff: boolean;
  omenOldStuffDays: string;
  omenFarmOvergrown: boolean;
  stuffPrice: "none" | "weak" | "decent" | "solid" | "expensive" | "godlike";
  rarity: "none" | "weak" | "solid" | "expensive";
  manyPortals: "no" | "yes";
  amountOfRates: "none" | "small" | "big";
  isFavorite: boolean;
  manualNextCheck: boolean;
  manualNextCheckDate: string;
}

const PRESET_TAGS = [
  "Farm", "Storage", "Shop", "Store", "Market",
  "Parkour", "Collection", "Fishing", "Main",
  "Farm-Shop", "Farm-Storage", "Shop-Storage",
  "Collection-Storage", "None"
];

const initialFormData = (): FormData => ({
  name: "",
  ownerName: "",
  addReason: "",
  tags: ["None"],
  customTag: "",
  newbieLock: "None",
  smallLock: "None",
  worldLock: "None",
  omenForgottenPets: false,
  omenSemiDestroyedBlocksFarms: false,
  omenOldStuff: false,
  omenOldStuffDays: "",
  omenFarmOvergrown: false,
  stuffPrice: "none",
  rarity: "none",
  manyPortals: "no",
  amountOfRates: "none",
  isFavorite: false,
  manualNextCheck: false,
  manualNextCheckDate: "",
});

interface QuickAddWizardProps {
  onSave: (payload: ObservationInput) => Promise<void>;
  onCancel: () => void;
}

export function QuickAddWizard({ onSave, onCancel }: QuickAddWizardProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(initialFormData());
  const [nameError, setNameError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [foundOtherWorlds, setFoundOtherWorlds] = useState<WorldRow[] | null>(null);
  const [showOtherWorlds, setShowOtherWorlds] = useState(false);
  // Track which steps have been completed (Next was pressed successfully)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  // Nested editor for viewing/editing a world from the other-worlds table
  const [editingWorld, setEditingWorld] = useState<WorldRow | null>(null);
  const [editingWorldInitial, setEditingWorldInitial] = useState<Partial<WorldRow> & { traits?: Partial<WorldTraits> } | undefined>();

  // Auto-detect rarity based on world name
  useEffect(() => {
    const name = normalizeWorldName(form.name);
    if (!name) return;

    if (name.length === 2) {
      setForm(prev => ({ ...prev, rarity: "expensive" }));
      return;
    }

    if (name.length === 3) {
      setForm(prev => ({ ...prev, rarity: "solid" }));
      return;
    }

    const chars = name.split("");
    const uniqueChars = new Set(chars);
    if (uniqueChars.size === 1) {
      setForm(prev => ({ ...prev, rarity: "solid" }));
      return;
    }

    if (name.length <= 6 && uniqueChars.size === 2) {
      setForm(prev => ({ ...prev, rarity: "solid" }));
      return;
    }
  }, [form.name]);

  // Check for other worlds of same owner
  useEffect(() => {
    if (form.ownerName.trim().length >= 3) {
      listOwnerWorlds(form.ownerName.trim().toUpperCase()).then(worlds => {
        setFoundOtherWorlds(worlds.length > 0 ? worlds : null);
      }).catch(() => {
        setFoundOtherWorlds(null);
      });
    }
  }, [form.ownerName]);

  // Determine if omen step should be skipped
  // Skip if we already have enough timeline data:
  // world lock decayed, newbie lock decayed without small intact,
  // or small lock decayed while newbie & world are none (only decayed small).
  // BUT keep step 4 dot visible in all cases — just skip it on Next.
  const skipOmenStep = useMemo(() => {
    if (form.worldLock === "Decayed") return true;
    if (form.newbieLock === "Decayed" && form.smallLock !== "Intact") return true;
    // Small lock decayed while newbie & world are both None (only decayed small)
    if (form.smallLock === "Decayed" && form.newbieLock === "None" && form.worldLock === "None") return true;
    return false;
  }, [form.worldLock, form.newbieLock, form.smallLock]);

  // Profit of Waiting step should be skipped under the same conditions as omen step
  const skipProfitStep = skipOmenStep;

  // Validate step 3 (lock selection)
  const validateLocks = (): string | null => {
    const { newbieLock, smallLock, worldLock } = form;

    if (newbieLock === "None" && smallLock === "None" && worldLock === "None") {
      return "At least one lock type must be selected. All 'None' is not allowed.";
    }

    if (newbieLock === "Intact" && smallLock === "Decayed") {
      return "Small Lock decayed (90d) but Newbie Lock intact (30d) is inconsistent.";
    }

    if (worldLock === "Decayed" && smallLock === "Intact") {
      return "World Lock decayed (365d) but Small Lock intact (90d) is impossible.";
    }

    return null;
  };

  // Auto-cleanup: when a field becomes hidden due to another field's state,
  // reset it to "None" so it doesn't cascade and block other fields.
  useEffect(() => {
    setForm(prev => {
      let changed = false;
      let next = { ...prev };

      // smallLock Decayed → newbieLock hidden → reset to None
      if (next.smallLock === "Decayed" && next.newbieLock !== "None") {
        next.newbieLock = "None";
        changed = true;
      }

      // worldLock not None → newbieLock hidden → reset to None
      if (next.worldLock !== "None" && next.newbieLock !== "None") {
        next.newbieLock = "None";
        changed = true;
      }

      // newbieLock not None → worldLock hidden → reset to None
      if (next.newbieLock !== "None" && next.worldLock !== "None") {
        next.worldLock = "None";
        changed = true;
      }

      // worldLock Decayed → smallLock hidden → reset to None
      if (next.worldLock === "Decayed" && next.smallLock !== "None") {
        next.smallLock = "None";
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [form.newbieLock, form.smallLock, form.worldLock]);

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setStepError(null);
  };

  const toggleTag = (tag: string) => {
    setForm(prev => {
      if (tag === "None") {
        const hasOtherTags = prev.tags.some(t => t !== "None");
        if (hasOtherTags) return prev;
        return prev;
      }

      const newTags = prev.tags.filter(t => t !== "None");
      const exists = newTags.includes(tag);
      const result = exists ? newTags.filter(t => t !== tag) : [...newTags, tag];

      if (result.length === 0) {
        return { ...prev, tags: ["None"] };
      }

      return { ...prev, tags: result };
    });
  };

  const addCustomTag = () => {
    const tag = form.customTag.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => {
        const withoutNone = prev.tags.filter(t => t !== "None");
        return {
          ...prev,
          tags: [...withoutNone, tag],
          customTag: "",
        };
      });
    }
  };

  // Step dot navigation: can only go to steps that are ≤ maxCompleted + 1
  const canNavigateToStep = useCallback((targetStep: number): boolean => {
    if (targetStep === step) return true;
    if (targetStep === 4 && skipOmenStep) return false;

    // Calculate max reachable step: completed steps + 1
    const maxReachable = Math.max(...Array.from(completedSteps), 0) + 1;

    // Can go backwards freely, forward only up to maxReachable
    if (targetStep < step) return true;
    if (targetStep <= maxReachable) return true;
    return false;
  }, [step, completedSteps, skipOmenStep]);

  const handleStepDotClick = (targetStep: number) => {
    if (!canNavigateToStep(targetStep)) return;
    if (targetStep === 4 && skipOmenStep) return;
    setStep(targetStep);
    setStepError(null);
  };

  const markStepCompleted = (s: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.add(s);
      return next;
    });
  };

  const handleNext = () => {
    setStepError(null);

    if (step === 1) {
      const normalized = normalizeWorldName(form.name);
      if (!isValidWorldName(normalized)) {
        setNameError(worldNameHint());
        return;
      }
      if (!form.ownerName.trim()) {
        setNameError("Owner name is required.");
        return;
      }
      setNameError(null);
      markStepCompleted(1);
      setStep(2);
      return;
    }

    if (step === 2) {
      markStepCompleted(2);
      setStep(3);
      return;
    }

    if (step === 3) {
      const lockErr = validateLocks();
      if (lockErr) {
        setStepError(lockErr);
        return;
      }
      markStepCompleted(3);
      if (skipOmenStep) {
        // Both omen and profit steps are skipped
        setStep(6);
      } else {
        setStep(4);
      }
      return;
    }

    if (step === 4) {
      markStepCompleted(4);
      if (skipProfitStep) {
        setStep(6);
      } else {
        setStep(5);
      }
      return;
    }

    if (step === 5) {
      markStepCompleted(5);
      setStep(6);
      return;
    }
  };

  const handleBack = () => {
    setStepError(null);
    if (step === 2) { setStep(1); return; }
    if (step === 3) { setStep(2); return; }
    if (step === 4) { setStep(3); return; }
    if (step === 5) {
      if (skipOmenStep) {
        setStep(3);
      } else {
        setStep(4);
      }
      return;
    }
    if (step === 6) {
      setStep(5);
      return;
    }
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
      if (form.smallLock === "None") {
        t.smallLockDecayed = true;
      }
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

  const analysis: AnalysisResult = useMemo(() => analyzeTraits(traits), [traits]);

  const adjustedScore = useMemo(() => {
    let score = analysis.score;

    switch (form.stuffPrice) {
      case "weak": score += 5; break;
      case "decent": score += 10; break;
      case "solid": score += 15; break;
      case "expensive": score += 20; break;
      case "godlike": score += 30; break;
      default: break;
    }

    switch (form.rarity) {
      case "solid": score += 10; break;
      case "expensive": score += 20; break;
      default: break;
    }

    if (form.manyPortals === "yes") score += 5;

    switch (form.amountOfRates) {
      case "small": score += 3; break;
      case "big": score += 8; break;
      default: break;
    }

    return Math.min(100, Math.max(0, score));
  }, [analysis, form.stuffPrice, form.rarity, form.manyPortals, form.amountOfRates]);

  // Calculate the estimated days since owner absence / event
  const estimatedAbsentDays = useMemo(() => {
    let days = 0;

    if (form.omenOldStuff && form.omenOldStuffDays) {
      days = Math.max(days, parseInt(form.omenOldStuffDays) || 0);
    }

    if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) {
      days = Math.max(days, 90);
    }

    if (form.newbieLock === "Decayed") {
      days = Math.max(days, 30);
    }

    if (form.worldLock === "Decayed") {
      days = Math.max(days, 365);
    }

    if (form.omenForgottenPets) {
      days = Math.max(days, 3);
    }

    return days;
  }, [
    form.omenOldStuff, form.omenOldStuffDays,
    form.smallLock, form.omenSemiDestroyedBlocksFarms,
    form.newbieLock, form.worldLock, form.omenForgottenPets,
  ]);

  // Calculate remaining days until decay
  const remainingDaysUntilDecay = useMemo(() => {
    if (form.worldLock === "Intact") {
      const passed = Math.max(estimatedAbsentDays, form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms ? 90 : 0);
      return Math.max(0, 365 - passed);
    }

    if (form.newbieLock === "Intact") {
      const passed = estimatedAbsentDays;
      return Math.max(0, 30 - passed);
    }

    if (form.smallLock === "Intact") {
      const passed = estimatedAbsentDays;
      return Math.max(0, 90 - passed);
    }

    return 0;
  }, [form.worldLock, form.newbieLock, form.smallLock, estimatedAbsentDays, form.omenSemiDestroyedBlocksFarms]);

  // Check if decay should have already happened (contradiction)
  const isDecayContradiction = useMemo(() => {
    // If estimated destruction is 100% but the lock is still marked as Intact
    if (form.worldLock === "Intact" && estimatedAbsentDays >= 365) return true;
    if (form.smallLock === "Intact" && estimatedAbsentDays >= 90) return true;
    if (form.newbieLock === "Intact" && estimatedAbsentDays >= 30) return true;
    return false;
  }, [form.worldLock, form.smallLock, form.newbieLock, estimatedAbsentDays]);

  const possibleDecayDate = useMemo(() => {
    if (isDecayContradiction) return "Cannot calculate (contradicting data)";

    const now = new Date();
    if (remainingDaysUntilDecay > 0) {
      return addDaysIso(now, remainingDaysUntilDecay).slice(0, 10);
    }
    if (form.worldLock === "Decayed") return addDaysIso(now, -365).slice(0, 10);
    if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) return addDaysIso(now, -90).slice(0, 10);
    if (form.newbieLock === "Decayed") return addDaysIso(now, -30).slice(0, 10);
    return addDaysIso(now, 30).slice(0, 10);
  }, [remainingDaysUntilDecay, form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms, isDecayContradiction]);

  // Estimated destruction % based on time progression
  const estimatedDestructionPercent = useMemo(() => {
    if (isDecayContradiction) return -1; // Signal for "cannot calculate"

    let totalDays = 0;
    if (form.worldLock === "Intact" || form.worldLock === "Decayed") totalDays = 365;
    else if (form.smallLock === "Intact" || form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) totalDays = 90;
    else if (form.newbieLock === "Intact" || form.newbieLock === "Decayed") totalDays = 30;
    else totalDays = 90;

    if (totalDays === 0) return 0;

    const passed = estimatedAbsentDays;
    const pct = Math.min(100, Math.round((passed / totalDays) * 100));
    return pct;
  }, [form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms, estimatedAbsentDays, isDecayContradiction]);

  // Claim chance
  const claimChancePercent = useMemo(() => {
    let chance = 70;

    switch (form.rarity) {
      case "solid": chance -= 15; break;
      case "expensive": chance -= 30; break;
      default: break;
    }

    switch (form.stuffPrice) {
      case "weak": chance -= 2; break;
      case "decent": chance -= 5; break;
      case "solid": chance -= 8; break;
      case "expensive": chance -= 12; break;
      case "godlike": chance -= 18; break;
      default: break;
    }

    switch (form.amountOfRates) {
      case "small": chance -= 5; break;
      case "big": chance -= 15; break;
      default: break;
    }

    if (form.omenSemiDestroyedBlocksFarms) chance -= 10;
    if (form.worldLock === "Decayed") chance -= 30;

    return Math.max(5, Math.min(95, chance));
  }, [form.rarity, form.stuffPrice, form.amountOfRates, form.omenSemiDestroyedBlocksFarms, form.worldLock]);

  const adjustedPriorityTier = useMemo(() => {
    return adjustedScore >= 90 ? "S" : adjustedScore >= 75 ? "A" : adjustedScore >= 60 ? "B" : adjustedScore >= 40 ? "C" : "D";
  }, [adjustedScore]);

  const adjustedStars = useMemo(() => {
    return Math.max(1, Math.min(5, Math.round(adjustedScore / 20)));
  }, [adjustedScore]);

  // Determine which lock to show in preview (longest-lasting intact lock)
  const previewLock = useMemo(() => {
    if (form.worldLock === "Intact") return "world" as const;
    if (form.smallLock === "Intact") return "small" as const;
    if (form.newbieLock === "Intact") return "newbie" as const;
    if (form.worldLock === "Decayed") return "world" as const;
    if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) return "small" as const;
    if (form.newbieLock === "Decayed") return "newbie" as const;
    return "small" as const;
  }, [form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms]);

  // Auto next check
  const autoNextCheckDays = useMemo(() => {
    let days = 30;
    if (form.worldLock === "Intact") days = 4;
    else if (form.smallLock === "Intact") days = 2;
    else if (form.newbieLock === "Intact") days = 2;
    else if (form.worldLock === "Decayed") days = 30;
    else if (form.smallLock === "Decayed" || form.omenSemiDestroyedBlocksFarms) days = 14;
    else if (form.newbieLock === "Decayed") days = 7;

    switch (form.rarity) {
      case "solid": days = Math.max(days, 7); break;
      case "expensive": days = Math.max(days, 14); break;
      default: break;
    }

    switch (form.stuffPrice) {
      case "weak": days = Math.min(days, 10); break;
      case "decent": days = Math.min(days, 7); break;
      case "solid": days = Math.min(days, 5); break;
      case "expensive": days = Math.min(days, 3); break;
      case "godlike": days = Math.min(days, 2); break;
      default: break;
    }

    // If world is extremely valuable (expensive name + expensive/godlike stuff), check every day
    if (form.rarity === "expensive" && (form.stuffPrice === "godlike" || form.stuffPrice === "expensive")) {
      days = Math.min(days, 1);
    }

    return Math.max(1, days);
  }, [form.worldLock, form.smallLock, form.newbieLock, form.omenSemiDestroyedBlocksFarms, form.rarity, form.stuffPrice]);

  // Build a custom summary that replaces the default "Recommended recheck" line
  const customSummary = useMemo(() => {
    const lines = analysis.summary.split("\n");
    // Filter out the "Recommended recheck" line
    const filtered = lines.filter(line => !line.toLowerCase().includes("recommended recheck"));
    // Add our own recheck line based on lock type
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

  const handleFinalSubmit = async () => {
    setSaving(true);
    try {
      const normalized = normalizeWorldName(form.name);
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
        id: undefined,
        name: normalized,
        ownerName: form.ownerName.trim().toUpperCase(),
        addReason: form.addReason.trim() || "Quick add",
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

  const btnCancel = "btn ghost cursor-target";
  const btnBack = "btn ghost cursor-target";
  const btnNext = "btn primary cursor-target";

  const renderNavButtons = (showBack: boolean) => (
    <div className="editor-actions">
      <button type="button" className={btnCancel} onClick={onCancel}>Cancel</button>
      {showBack && <button type="button" className={btnBack} onClick={handleBack}>Back</button>}
      {step < 6 && (
        <button type="button" className={btnNext} onClick={() => handleNext()}>
          Next
        </button>
      )}
      {step === 6 && (
        <button
          type="button"
          className={`${btnNext} ${saving ? "disabled" : ""}`}
          disabled={saving}
          onClick={() => void handleFinalSubmit()}
        >
          {saving ? "Saving…" : "Save world"}
        </button>
      )}
    </div>
  );

  const renderStep1 = () => (
    <div>
      <h3 className="step-title">Step 1 — Basic Info</h3>
      <div className="world-editor__grid">
        <label>
          World name
          <input
            value={form.name}
            onChange={(e) => { updateField("name", e.target.value.toUpperCase()); setNameError(null); }}
            placeholder="STORAGE"
            className="cursor-target"
          />
        </label>
        <label>
          Owner
          <input
            value={form.ownerName}
            onChange={(e) => updateField("ownerName", e.target.value.toUpperCase())}
            placeholder="FRANK123"
            className="cursor-target"
          />
        </label>
      </div>
      {nameError && <p className="form-error">{nameError}</p>}
      {renderNavButtons(false)}
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h3 className="step-title">Step 2 — Reason & Tags</h3>
      <div className="world-editor__grid">
        <label className="span-2">
          Why added (optional)
          <input
            value={form.addReason}
            onChange={(e) => updateField("addReason", e.target.value)}
            placeholder="Small decay on owner farm…"
            className="cursor-target"
          />
        </label>
        <div className="span-2">
          <label>Tags (select multiple)</label>
          <div className="tag-select-grid">
            {PRESET_TAGS.map(tag => {
              const isNone = tag === "None";
              const hasOtherTags = form.tags.some(t => t !== "None");
              const isActive = form.tags.includes(tag);
              const disabled = isNone && hasOtherTags;
              return (
                <button
                  key={tag}
                  type="button"
                  className={`tag-chip cursor-target ${isActive ? "active" : ""} ${disabled ? "disabled" : ""}`}
                  onClick={() => !disabled && toggleTag(tag)}
                >
                  {tag}
                </button>
              );
            })}
            {form.tags
              .filter(t => !PRESET_TAGS.includes(t))
              .map(customTag => (
                <button
                  key={customTag}
                  type="button"
                  className="tag-chip cursor-target active"
                  onClick={() => toggleTag(customTag)}
                >
                  {customTag} ✕
                </button>
              ))}
          </div>
          <div className="inline-form">
            <input
              value={form.customTag}
              onChange={(e) => updateField("customTag", e.target.value)}
              placeholder="Add custom tag…"
              className="cursor-target"
              onKeyDown={(e) => { if (e.key === "Enter") addCustomTag(); }}
            />
            <button type="button" className="btn cursor-target" onClick={addCustomTag}>+</button>
          </div>
          {form.tags.length > 0 && (
            <div className="selected-tags">
              <span className="muted small">Selected: {form.tags.join(", ")}</span>
            </div>
          )}
        </div>
      </div>
      {renderNavButtons(true)}
    </div>
  );

  const renderStep3 = () => {
    const hasNewbie = form.newbieLock !== "None";
    const hasWorld = form.worldLock !== "None";
    const worldIsDecayed = form.worldLock === "Decayed";
    const smallIsDecayed = form.smallLock === "Decayed";

    return (
      <div>
        <h3 className="step-title">Step 3 — Lock Status</h3>
        <div className="world-editor__grid">
          {!hasWorld && !smallIsDecayed && (
            <label>
              Newbie Lock (30 days)
              <select
                value={form.newbieLock}
                onChange={(e) => updateField("newbieLock", e.target.value as LockState)}
                className="cursor-target"
              >
                <option value="None">None</option>
                <option value="Intact">Intact</option>
                <option value="Decayed">Decayed</option>
              </select>
            </label>
          )}
          {(hasWorld || smallIsDecayed) && (
            <div className="span-2" />
          )}
          {!worldIsDecayed && (
            <label>
              Small Locks Type (90 days)
              <select
                value={form.smallLock}
                onChange={(e) => updateField("smallLock", e.target.value as LockState)}
                className="cursor-target"
              >
                <option value="None">None</option>
                <option value="Intact">Intact</option>
                <option value="Decayed">Decayed</option>
              </select>
            </label>
          )}
          {worldIsDecayed && (
            <div className="span-2" />
          )}
          {!hasNewbie && (
            <label className="span-2">
              World Locks Type (365 days)
              <select
                value={form.worldLock}
                onChange={(e) => updateField("worldLock", e.target.value as LockState)}
                className="cursor-target"
              >
                <option value="None">None</option>
                <option value="Intact">Intact</option>
                <option value="Decayed">Decayed</option>
              </select>
            </label>
          )}
          {hasNewbie && (
            <div className="span-2" />
          )}
        </div>
        {stepError && <p className="form-error">{stepError}</p>}
        {renderNavButtons(true)}
      </div>
    );
  };

  const renderStep4 = () => (
    <div>
      <h3 className="step-title">Step 4 — Omen of Decay</h3>
      {foundOtherWorlds && !showOtherWorlds && (
        <div className="omen-other-worlds">
          <p className="form-info">
            ✓ Found {foundOtherWorlds.length} other world(s) owned by {form.ownerName}.
            <button
              type="button"
              className="btn ghost cursor-target omen-view-btn"
              onClick={() => setShowOtherWorlds(true)}
            >
              View
            </button>
          </p>
        </div>
      )}
      {foundOtherWorlds === null && form.ownerName.trim().length >= 3 && (
        <div className="omen-other-worlds">
          <p className="form-info muted">No other worlds found for {form.ownerName}.</p>
        </div>
      )}
      {showOtherWorlds && foundOtherWorlds && (
        <div className="omen-worlds-list">
          <div className="omen-worlds-header">
            <span className="muted small">Other worlds by {form.ownerName}</span>
            <button
              type="button"
              className="btn ghost cursor-target"
              onClick={() => setShowOtherWorlds(false)}
            >
              Hide
            </button>
          </div>
          <WorldsTable
            worlds={foundOtherWorlds}
            query=""
            onSelect={(world) => {
              setEditingWorld(world);
              void getWorldDetail(world.id).then(detail => {
                const latest = detail.observations[0];
                setEditingWorldInitial({ ...detail.world, traits: latest?.traits });
              });
            }}
            onToggleFavorite={() => {}}
          />
        </div>
      )}
      <div className="trait-grid">
        <label className="trait-check">
          <input
            type="checkbox"
            checked={form.omenForgottenPets}
            onChange={(e) => updateField("omenForgottenPets", e.target.checked)}
            className="cursor-target"
          />
          Forgotten Pets
        </label>
        <label className="trait-check">
          <input
            type="checkbox"
            checked={form.omenSemiDestroyedBlocksFarms}
            onChange={(e) => updateField("omenSemiDestroyedBlocksFarms", e.target.checked)}
            className="cursor-target"
          />
          Semi-destroyed blocks/farms
        </label>
        <div className="trait-check">
          <label className="trait-inline">
            <input
              type="checkbox"
              checked={form.omenOldStuff}
              onChange={(e) => updateField("omenOldStuff", e.target.checked)}
              className="cursor-target"
            />
            Old Stuff
          </label>
          {form.omenOldStuff && (
            <input
              type="number"
              value={form.omenOldStuffDays}
              onChange={(e) => updateField("omenOldStuffDays", e.target.value)}
              placeholder="Min days"
              className="cursor-target omen-days-input"
              min="0"
            />
          )}
        </div>
        <label className="trait-check">
          <input
            type="checkbox"
            checked={form.omenFarmOvergrown}
            onChange={(e) => updateField("omenFarmOvergrown", e.target.checked)}
            className="cursor-target"
          />
          Farm Overgrown
        </label>
      </div>
      {renderNavButtons(true)}
    </div>
  );

  const renderStep5 = () => (
    <div>
      <h3 className="step-title">Step 5 — Profit of Waiting</h3>
      <div className="world-editor__grid">
        <label>
          Stuff Price
          <select
            value={form.stuffPrice}
            onChange={(e) => updateField("stuffPrice", e.target.value as FormData["stuffPrice"])}
            className="cursor-target"
          >
            <option value="none">None (0 bc)</option>
            <option value="weak">Weak (~250 bc)</option>
            <option value="decent">Decent (~1k bc)</option>
            <option value="solid">Solid (~5k bc)</option>
            <option value="expensive">Expensive (~20k bc)</option>
            <option value="godlike">Godlike (~50k+ bc)</option>
          </select>
        </label>
        <label>
          Rarity of the World name
          <div className="rarity-with-name">
            <select
              value={form.rarity}
              onChange={(e) => updateField("rarity", e.target.value as FormData["rarity"])}
              className="cursor-target"
            >
              <option value="none">None</option>
              <option value="weak">Weak (hard to sell)</option>
              <option value="solid">Solid (good name)</option>
              <option value="expensive">Expensive (very rare)</option>
            </select>
            {form.name && <span className="rarity-world-name">{form.name}</span>}
          </div>
        </label>
        <label>
          Many Portals
          <select
            value={form.manyPortals}
            onChange={(e) => updateField("manyPortals", e.target.value as FormData["manyPortals"])}
            className="cursor-target"
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label>
          Amount of Rates
          <select
            value={form.amountOfRates}
            onChange={(e) => updateField("amountOfRates", e.target.value as FormData["amountOfRates"])}
            className="cursor-target"
          >
            <option value="none">None</option>
            <option value="small">Small</option>
            <option value="big">Big</option>
          </select>
        </label>
      </div>
      {renderNavButtons(true)}
    </div>
  );

  const renderStep6 = () => (
    <div>
      <h3 className="step-title">Step 6 — Live Analysis</h3>

      <div className="analysis-world-header">
        <h2 className="analysis-world-name">{form.name || "—"}</h2>
        <p className="analysis-world-owner muted">{form.ownerName || "—"}</p>
      </div>

      <LockPreview lock={previewLock} />

      <div className="analysis-panel">
        <div className="analysis-kpi">
          <span className={adjustedScore >= 70 ? "score-good" : adjustedScore >= 40 ? "score-mid" : "score-low"}>
            {adjustedScore}/100
          </span>
          <span>{adjustedPriorityTier}</span>
          <span>{adjustedStars}★</span>
        </div>

        <div className="analysis-details">
          <div className="analysis-row">
            <span className="muted">Possible Lock Decay Time:</span>
            <strong className={isDecayContradiction ? "text-warning" : ""}>{possibleDecayDate}</strong>
          </div>
          {remainingDaysUntilDecay > 0 && !isDecayContradiction && (
            <div className="analysis-row">
              <span className="muted">Estimated time until World Lock decay:</span>
              <strong>~{remainingDaysUntilDecay} days</strong>
            </div>
          )}
          <div className="analysis-row">
            <span className="muted">Estimated destruction:</span>
            <strong className={isDecayContradiction ? "text-warning" : ""}>
              {isDecayContradiction ? "Cannot calculate (contradicting data)" : `${estimatedDestructionPercent}%`}
            </strong>
          </div>
          <div className="analysis-row">
            <span className="muted">Claim chance:</span>
            <strong>{claimChancePercent}%</strong>
          </div>
          <div className="analysis-row">
            <span className="muted">Priority:</span>
            <strong>{adjustedStars > 3 ? "High" : adjustedStars > 1 ? "Medium" : "Low"}</strong>
          </div>
        </div>

        <pre className="analysis-summary">{customSummary}</pre>

        <div className="analysis-options">
          <label className="trait-inline">
            <input
              type="checkbox"
              checked={form.isFavorite}
              onChange={(e) => updateField("isFavorite", e.target.checked)}
              className="cursor-target"
            />
            Favorite
          </label>
          <label className="trait-inline">
            <input
              type="checkbox"
              checked={form.manualNextCheck}
              onChange={(e) => updateField("manualNextCheck", e.target.checked)}
              className="cursor-target"
            />
            Manual next check
          </label>
          {form.manualNextCheck && (
            <label>
              Next check date
              <input
                type="date"
                value={form.manualNextCheckDate}
                onChange={(e) => updateField("manualNextCheckDate", e.target.value)}
                className="cursor-target"
              />
            </label>
          )}
          {!form.manualNextCheck && (
            <p className="muted small">
              Auto next check: ~{autoNextCheckDays} days
              ({addDaysIso(new Date(), autoNextCheckDays).slice(0, 10)})
            </p>
          )}
        </div>
      </div>

      {renderNavButtons(true)}
    </div>
  );

  const stepProgress = () => (
    <div className="step-indicator">
      {[1, 2, 3, 4, 5, 6].map(s => {
        if (s === 4 && skipOmenStep) return <div key={s} className="step-dot skipped">4</div>;
        if (s === 5 && skipProfitStep && !skipOmenStep) return <div key={s} className="step-dot skipped">5</div>;
        if (s === 5 && skipOmenStep) return <div key={s} className="step-dot skipped">5</div>;
        const isAccessible = canNavigateToStep(s);
        const isCompleted = completedSteps.has(s);
        return (
          <div
            key={s}
            className={`step-dot cursor-target ${step === s ? "active" : isCompleted ? "done" : ""} ${isAccessible ? "clickable" : ""}`}
            onClick={() => handleStepDotClick(s)}
          >
            {s}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="quick-add-wizard">
      {stepProgress()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && !skipOmenStep && renderStep4()}
      {step === 5 && !skipProfitStep && renderStep5()}
      {step === 6 && renderStep6()}

      {/* Nested editor modal for viewing a world from the other-worlds table */}
      {editingWorld && (
        <div className="nested-modal-backdrop" onClick={() => { setEditingWorld(null); setEditingWorldInitial(undefined); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingWorld.name}</h2>
              <button
                type="button"
                className="btn ghost cursor-target"
                onClick={() => { setEditingWorld(null); setEditingWorldInitial(undefined); }}
              >
                Close
              </button>
            </div>
            {editingWorldInitial && (
              <WorldEditor
                initial={editingWorldInitial ?? editingWorld ?? undefined}
                onSave={onSave}
                onCancel={() => { setEditingWorld(null); setEditingWorldInitial(undefined); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
