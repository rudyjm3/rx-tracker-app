// Ported from rx-tracker-web's lib/types/medications.ts — kept in sync by
// hand for now since the two apps share one Supabase schema
// (supabase/schema.sql in rx-tracker-web) but live in separate repos.

export type ScheduleMode = "fixed_times" | "interval";
export type MedicationType = "prescription" | "otc" | "supplement";
export type FeedbackType = "none" | "pain" | "mood" | "both";
export type SetupStatus = "draft" | "ready" | "active";
export type RefillEntryType = "refill" | "adjustment";

export interface MedicationScheduleTime {
  id: string;
  medication_id: string;
  reminder_time: string;
  quantity_per_dose: number | null;
  group_id: string | null;
  created_at: string;
}

export interface Medication {
  id: string;
  user_id: string;
  profile_id: string | null;
  name: string;
  dose: string;
  dose_amount: number | null;
  dose_unit: string | null;
  dose_form: string | null;
  instructions: string;
  schedule_mode: ScheduleMode;
  interval_hours: number | null;
  first_dose_time: string | null;
  as_needed: boolean;
  medication_type: MedicationType;
  inventory_type: string;
  inventory_unit: string;
  starting_quantity: number | null;
  current_quantity: number | null;
  quantity_per_dose: number;
  low_supply_threshold: number;
  track_dose_feedback: boolean;
  feedback_type: FeedbackType;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  setup_status: SetupStatus;
  dashboard_enabled: boolean;
  reminders_enabled: boolean;
  adherence_enabled: boolean;
  inventory_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  medication_schedule_times?: MedicationScheduleTime[];
}

export interface MedicationGroup {
  id: string;
  user_id: string;
  profile_id: string | null;
  name: string;
  scheduled_time: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MedicationGroupMember {
  group_id: string;
  medication_id: string;
  sort_order: number;
  quantity_per_dose: number | null;
}

export interface MedicationRefill {
  id: string;
  medication_id: string;
  refill_date: string;
  amount: number;
  pills_on_hand: number;
  note: string;
  entry_type: RefillEntryType;
  started_using_at: string | null;
  carryover_quantity: number;
  created_at: string;
}

export type DoseLogStatus = "taken" | "skipped" | "missed";

export interface DoseLog {
  id: string;
  medication_id: string;
  scheduled_for_date: string;
  scheduled_time: string;
  status: DoseLogStatus;
  note: string;
  pain_level: number | null;
  mood_level: number | null;
  deducted_quantity: number | null;
  taken_at: string | null;
  feedback_edited_at: string | null;
  created_at: string;
}

export interface DosePostpone {
  id: string;
  medication_id: string;
  scheduled_for_date: string;
  scheduled_time: string;
  postponed_until: string;
  resolved_at: string | null;
  created_at: string;
}

export type PainMoodLogType = "pain" | "mood" | "both";

export interface StandalonePainMoodLog {
  id: string;
  user_id: string;
  medication_id: string | null;
  profile_id: string | null;
  log_type: PainMoodLogType;
  pain_level: number | null;
  mood_level: number | null;
  note: string;
  tags: string;
  logged_at: string;
  updated_at: string | null;
}

export interface MoodTag {
  id: string;
  user_id: string;
  name: string;
  always_show: boolean;
  sort_order: number;
  created_at: string;
}

export type SideEffectSeverity = "mild" | "moderate" | "severe";

export interface SideEffect {
  id: string;
  medication_id: string;
  occurred_date: string;
  description: string;
  severity: SideEffectSeverity;
  note: string;
  created_at: string;
}

export interface SideEffectTag {
  id: string;
  user_id: string;
  name: string;
  always_show: boolean;
  sort_order: number;
  created_at: string;
}
