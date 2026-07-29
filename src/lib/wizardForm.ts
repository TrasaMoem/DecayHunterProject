export type LockState = "None" | "Intact" | "Decayed";

export interface WizardFormData {
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

export const PRESET_TAGS = [
  "Farm", "Storage", "Shop", "Store", "Market",
  "Parkour", "Collection", "Fishing", "Main",
  "Farm-Shop", "Farm-Storage", "Shop-Storage",
  "Collection-Storage", "None"
];

export const initialFormData = (): WizardFormData => ({
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