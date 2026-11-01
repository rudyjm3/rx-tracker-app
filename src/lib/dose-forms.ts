// Single source of truth for the dose form dropdown and the inventory
// wording that follows from it. The inventory type/unit stored on a
// medication (inventory_type / inventory_unit) are derived from the dose
// form picked in the Medication step — they are no longer asked for twice.
// Keep in sync with rx-tracker-web/components/medications/wizard/dose-forms.ts

export const DOSE_FORM_OPTIONS = [
  { value: "tablet", label: "Tablet" },
  { value: "capsule", label: "Capsule" },
  { value: "liquid", label: "Liquid" },
  { value: "inhaler", label: "Inhaler" },
  { value: "injection", label: "Injection" },
  { value: "patch", label: "Patch" },
  { value: "drops", label: "Drops" },
  { value: "other", label: "Other" },
] as const;

export const DOSE_UNIT_OPTIONS = [
  "mg",
  "mcg",
  "g",
  "mL",
  "tsp",
  "tbsp",
  "oz",
  "IU",
  "units",
  "drops",
  "puffs",
  "patches",
] as const;

export interface InventoryWording {
  /** What is being counted, e.g. "pills" -> inventory_type. */
  type: string;
  /** The countable unit, e.g. "tablets" -> inventory_unit. */
  unit: string;
}

const DEFAULT_WORDING: InventoryWording = { type: "pills", unit: "tablets" };

const WORDING_BY_FORM: Record<string, InventoryWording> = {
  tablet: { type: "pills", unit: "tablets" },
  capsule: { type: "pills", unit: "capsules" },
  liquid: { type: "liquid", unit: "mL" },
  inhaler: { type: "inhaler", unit: "puffs" },
  injection: { type: "injections", unit: "doses" },
  patch: { type: "patches", unit: "patches" },
  drops: { type: "drops", unit: "drops" },
  other: { type: "supply", unit: "units" },
};

/** True when the form is one we know how to derive inventory wording from. */
export function hasInventoryWording(doseForm: string | null | undefined): boolean {
  return Boolean(doseForm && WORDING_BY_FORM[doseForm.trim().toLowerCase()]);
}

export function inventoryWordingForForm(
  doseForm: string | null | undefined,
): InventoryWording {
  const key = (doseForm ?? "").trim().toLowerCase();
  return WORDING_BY_FORM[key] ?? DEFAULT_WORDING;
}
