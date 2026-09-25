// Shared display constants for medication type badges — used by both the
// medications list and the detail/edit screen. Colors ported from
// rx-tracker-web's components/ui/MedTypeBadge.tsx (brand-blue/deep-blue/
// status-warning).
import { Brand } from "@/constants/theme";
import type { MedicationType } from "@/lib/types/medications";

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
