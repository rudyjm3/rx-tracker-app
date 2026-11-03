// Shared display constants for medication type badges — used by both the
// medications list and the detail/edit screen. Colors ported from
// rx-tracker-web's components/ui/MedTypeBadge.tsx (brand-blue/deep-blue/
// status-warning).
import { Brand } from "@/constants/theme";
import type { Medication, MedicationType } from "@/lib/types/medications";
import { localDateString } from "@/lib/utils";

// Ported from rx-tracker-web's components/layout/NotificationBell.tsx
// severityFor — same three tiers, same thresholds, so mobile's alerts
// match web's exactly.
export type SupplySeverity = "out_of_stock" | "critical" | "low_stock" | "refill_due";

export function severityFor(current: number, threshold: number): SupplySeverity | null {
  if (current <= 0) return "out_of_stock";
  if (current <= threshold / 2) return "critical";
  if (current <= threshold) return "low_stock";
  return null;
}

export const SUPPLY_SEVERITY_LABELS: Record<SupplySeverity, string> = {
  out_of_stock: "Out of stock",
  critical: "Critically low",
  low_stock: "Low supply",
  refill_due: "Refill due",
};

export const SUPPLY_SEVERITY_COLORS: Record<SupplySeverity, string> = {
  out_of_stock: Brand.danger,
  critical: Brand.danger,
  low_stock: Brand.warning,
  refill_due: Brand.warning,
};

export const MEDICATION_TYPE_LABELS: Record<MedicationType, string> = {
  prescription: "Rx",
  otc: "OTC",
  supplement: "Supplement",
};

export const MEDICATION_TYPE_COLORS: Record<MedicationType, string> = {
  prescription: Brand.deepBlue,
  otc: Brand.blue,
  supplement: Brand.warning,
};

export const MEDICATION_TYPE_OPTIONS: MedicationType[] = ["prescription", "otc", "supplement"];

export interface SupplyAlert {
  medication: Medication;
  severity: SupplySeverity;
}

// `today` is a local YYYY-MM-DD string. A medication with no low-supply
// threshold (0) falls back to its next refill date: it alerts from that date
// until a new date is set. With a threshold, the pill count drives the alert.
export function getSupplyAlerts(medications: Medication[], today: string = localDateString()): SupplyAlert[] {
  const alerts: SupplyAlert[] = [];
  for (const medication of medications) {
    if (!medication.inventory_enabled) continue;
    // Stock-based severity needs a known count; the refill-date fallback
    // doesn't (the count can be blank when no starting quantity was entered).
    let severity =
      medication.current_quantity == null
        ? null
        : severityFor(medication.current_quantity, medication.low_supply_threshold);
    if (
      !severity &&
      medication.low_supply_threshold <= 0 &&
      medication.next_refill_date &&
      medication.next_refill_date <= today
    ) {
      severity = "refill_due";
    }
    if (severity) alerts.push({ medication, severity });
  }
  return alerts;
}
