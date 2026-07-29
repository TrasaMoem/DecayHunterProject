import type { WizardFormData, LockState } from "@/lib/wizardForm";
import { PRESET_TAGS } from "@/lib/wizardForm";

/* ─── Section 1: Name & Owner ─── */
export function EditorNameOwner({
  form, nameError, setNameError, onUpdate,
}: {
  form: WizardFormData;
  nameError: string | null;
  setNameError: (e: string | null) => void;
  onUpdate: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void;
}) {
  return (
    <div className="world-editor__grid">
      <label>
        World name
        <input
          value={form.name}
          onChange={(e) => { onUpdate("name", e.target.value.toUpperCase()); setNameError(null); }}
          placeholder="STORAGE"
          className="cursor-target"
        />
      </label>
      <label>
        Owner
        <input
          value={form.ownerName}
          onChange={(e) => onUpdate("ownerName", e.target.value.toUpperCase())}
          placeholder="FRANK123"
          className="cursor-target"
        />
      </label>
      {nameError && <p className="form-error span-2">{nameError}</p>}
    </div>
  );
}

/* ─── Section 2: Reason & Tags ─── */
export function EditorReasonTags({
  form, onUpdate, toggleTag, addCustomTag,
}: {
  form: WizardFormData;
  onUpdate: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void;
  toggleTag: (tag: string) => void;
  addCustomTag: () => void;
}) {
  return (
    <div className="world-editor__grid">
      <label className="span-2">
        Why added (optional)
        <input
          value={form.addReason}
          onChange={(e) => onUpdate("addReason", e.target.value)}
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
            onChange={(e) => onUpdate("customTag", e.target.value)}
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
  );
}

/* ─── Section 3: Lock Status ─── */
export function EditorLockStatus({
  form, onUpdate, stepError,
}: {
  form: WizardFormData;
  onUpdate: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void;
  stepError: string | null;
}) {
  const hasNewbie = form.newbieLock !== "None";
  const hasWorld = form.worldLock !== "None";
  const worldIsDecayed = form.worldLock === "Decayed";
  const smallIsDecayed = form.smallLock === "Decayed";

  return (
    <div className="world-editor__grid">
      {!hasWorld && !smallIsDecayed && (
        <label>
          Newbie Lock (30 days)
          <select
            value={form.newbieLock}
            onChange={(e) => onUpdate("newbieLock", e.target.value as LockState)}
            className="cursor-target"
          >
            <option value="None">None</option>
            <option value="Intact">Intact</option>
            <option value="Decayed">Decayed</option>
          </select>
        </label>
      )}
      {(hasWorld || smallIsDecayed) && <div className="span-2" />}
      {!worldIsDecayed && (
        <label>
          Small Locks Type (90 days)
          <select
            value={form.smallLock}
            onChange={(e) => onUpdate("smallLock", e.target.value as LockState)}
            className="cursor-target"
          >
            <option value="None">None</option>
            <option value="Intact">Intact</option>
            <option value="Decayed">Decayed</option>
          </select>
        </label>
      )}
      {worldIsDecayed && <div className="span-2" />}
      {!hasNewbie && (
        <label className="span-2">
          World Locks Type (365 days)
          <select
            value={form.worldLock}
            onChange={(e) => onUpdate("worldLock", e.target.value as LockState)}
            className="cursor-target"
          >
            <option value="None">None</option>
            <option value="Intact">Intact</option>
            <option value="Decayed">Decayed</option>
          </select>
        </label>
      )}
      {hasNewbie && <div className="span-2" />}
      {stepError && <p className="form-error span-2">{stepError}</p>}
    </div>
  );
}

/* ─── Section 4: Omen of Decay ─── */
export function EditorOmenDecay({
  form, onUpdate,
}: {
  form: WizardFormData;
  onUpdate: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void;
}) {
  return (
    <div className="trait-grid">
      <label className="trait-check">
        <input type="checkbox" checked={form.omenForgottenPets} onChange={(e) => onUpdate("omenForgottenPets", e.target.checked)} className="cursor-target" />
        Forgotten Pets
      </label>
      <label className="trait-check">
        <input type="checkbox" checked={form.omenSemiDestroyedBlocksFarms} onChange={(e) => onUpdate("omenSemiDestroyedBlocksFarms", e.target.checked)} className="cursor-target" />
        Semi-destroyed blocks/farms
      </label>
      <div className="trait-check">
        <label className="trait-inline">
          <input type="checkbox" checked={form.omenOldStuff} onChange={(e) => onUpdate("omenOldStuff", e.target.checked)} className="cursor-target" />
          Old Stuff
        </label>
        {form.omenOldStuff && (
          <input type="number" value={form.omenOldStuffDays} onChange={(e) => onUpdate("omenOldStuffDays", e.target.value)} placeholder="Min days" className="cursor-target omen-days-input" min="0" />
        )}
      </div>
      <label className="trait-check">
        <input type="checkbox" checked={form.omenFarmOvergrown} onChange={(e) => onUpdate("omenFarmOvergrown", e.target.checked)} className="cursor-target" />
        Farm Overgrown
      </label>
    </div>
  );
}

/* ─── Section 5: Profit of Waiting ─── */
export function EditorProfitWaiting({
  form, onUpdate,
}: {
  form: WizardFormData;
  onUpdate: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void;
}) {
  return (
    <div className="world-editor__grid">
      <label>
        Stuff Price
        <select value={form.stuffPrice} onChange={(e) => onUpdate("stuffPrice", e.target.value as WizardFormData["stuffPrice"])} className="cursor-target">
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
          <select value={form.rarity} onChange={(e) => onUpdate("rarity", e.target.value as WizardFormData["rarity"])} className="cursor-target">
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
        <select value={form.manyPortals} onChange={(e) => onUpdate("manyPortals", e.target.value as WizardFormData["manyPortals"])} className="cursor-target">
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </label>
      <label>
        Amount of Rates
        <select value={form.amountOfRates} onChange={(e) => onUpdate("amountOfRates", e.target.value as WizardFormData["amountOfRates"])} className="cursor-target">
          <option value="none">None</option>
          <option value="small">Small</option>
          <option value="big">Big</option>
        </select>
      </label>
    </div>
  );
}