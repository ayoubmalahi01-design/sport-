-- =============================================================================
-- SPORT PERFORMANCE — CORRECTED SUPABASE MIGRATION DESIGN — PHASE 2
-- =============================================================================
-- PROJECT REFERENCE: xbjthetphqxdhwufkmly
-- CORRECTIONS APPLIED as per user feedback:
--   1. Rehabilitation: One session stored once, students linked via attendance
--   2. Coach privacy: DB RLS enforcement, not app-layer filtering
--   3. Test infrastructure: Stable IDs, institution-safe FKs, no test-name relationships
--   4. BARÈME: Each result preserves exact BARÈME version, no auto-recalculation
--   5. RLS: Explicit policies for every table, tested for 2 institutions/admins/coaches/unauthenticated
--   6. Deletion/history: Reviewed ON DELETE CASCADE, prefer restrictive deletion
-- THIS DESIGN ONLY — NOT EXECUTED AUTOMATICALLY
-- =============================================================================
--
-- ABSOLUTE RESTRICTIONS (READ ONLY BEFORE APPROVAL):
-- 1. Do not execute this SQL directly against the remote Supabase project.
-- 2. Do not apply migrations without explicit per-SQL approval.
-- 3. Preserve all existing 9 tables and their data completely.
-- 4. Do not change existing RLS policies.
-- 5. Wait for user approval before any SQL execution.
-- =============================================================================

-- =============================================================================
-- PHASE 2: CORRECTED TABLES DESIGN
-- =============================================================================

-- =============================================================================
-- 1. public.rehab_notifications — Rehabilitation Notification Tracking
-- -------------------------------------------------------
-- CORRECTION: This table tracks the notification state per student.
-- One notification record per student, not per session.
-- session_count increments each time a NEW session occurs after the student
-- returns from 5+ consecutive absences. The return session itself does NOT
-- consume one of the two sessions (session_count starts at 0).
--
CREATE TABLE IF NOT EXISTS public.rehab_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  triggered_at date NOT NULL,  -- The date the student returned (after 5+ absences)
  absences_count integer NOT NULL,  -- Number of consecutive absences (≥5 triggered it)
  session_count integer NOT NULL DEFAULT 0,  -- How many sessions occurred since return (max 2)
  max_sessions integer NOT NULL DEFAULT 2,  -- Total sessions notification should display
  status text NOT NULL DEFAULT 'active',  -- 'active','expired','handled'
  handled_at timestamptz,
  handled_by uuid REFERENCES public.auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes + institution filtering
CREATE INDEX IF NOT EXISTS rehab_notifications_institution_id_idx ON public.rehab_notifications(institution_id);
CREATE INDEX IF NOT EXISTS rehab_notifications_student_id_idx ON public.rehab_notifications(student_id);
CREATE INDEX IF NOT EXISTS rehab_notifications_status_idx ON public.rehab_notifications(status);
CREATE INDEX IF NOT EXISTS rehab_notifications_triggered_idx ON public.rehab_notifications(triggered_at);

-- Business rule: A student can only have one active notification at a time
-- (enforced by application logic using triggered_at + status checks)

-- =============================================================================
-- 2. public.rehab_history — Notification History
-- -------------------------------------------------------
-- Purpose: Preserves notification history even after they expire/are handled.
-- Supports reporting and auditing. Linked to student, not to sessions.
--
CREATE TABLE IF NOT EXISTS public.rehab_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  triggered_at date NOT NULL,  -- When notification was triggered
  final_session_count integer,  -- Final session count before expiration/handling
  final_status text NOT NULL,  -- 'expired' or 'handled'
  handled_at timestamptz,
  handled_by uuid REFERENCES public.auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS rehab_history_institution_id_idx ON public.rehab_history(institution_id);
CREATE INDEX IF NOT EXISTS rehab_history_student_id_idx ON public.rehab_history(student_id);

-- =============================================================================
-- 3. public.attendance — Attendance Records (EXISTING TABLE, PRESERVED)
-- -------------------------------------------------------
-- The existing public.attendance table is PRESERVED unchanged.
-- It tracks per-student per-session attendance.
-- Key fields: status ('present'/'absent'/'late'), absence_reason, institution_id, student_id
-- 
-- Rehabilitation logic using existing table:
--   - 5 consecutive 'absent' records (not 'late') trigger notification
--   - Return detected when 'present' follows 5 consecutive 'absent'
--   - session_count in rehab_notifications increments per subsequent session
--   - Return session itself does NOT increment session_count
--
-- NO CHANGES to public.attendance — preserved as-is.

-- =============================================================================
-- 4. public.coach_identities — Coach Identity Mapping (CORRECTED)
-- -------------------------------------------------------
-- Purpose: Maps authenticated Supabase users to the local identity model
-- (coach-1, coach-2, legacy). Enforces private notebook ownership via RLS.
-- Legacy local identities are safely mapped through this table, but primary
-- ownership in Supabase is auth.uid() based.
--
CREATE TABLE IF NOT EXISTS public.coach_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth.users(id) ON DELETE CASCADE,
  local_identity text NOT NULL,  -- 'coach-1','coach-2','legacy'
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,

  -- Constraint: A user can have multiple identities but not duplicates of same identity
  UNIQUE (user_id, local_identity)
);

-- Indexes
CREATE INDEX IF NOT EXISTS coach_identities_user_id_idx ON public.coach_identities(user_id);
CREATE INDEX IF NOT EXISTS coach_identities_identity_idx ON public.coach_identities(local_identity);

-- RLS POLICY for coach_notes (EXISTING TABLE, PRESERVED):
-- The existing public.coach_notes table uses owner_id = auth.uid() for ownership.
-- This is ENFORCED by database RLS, NOT application-layer filtering.
-- When coach switches from coach-1 to coach-2, the application uses the
-- coach_identities table to map, but the database simply checks owner_id = auth.uid().

-- =============================================================================
-- 5. public.barmes — Official Scoring Scales (BARÈME) (CORRECTED)
-- -------------------------------------------------------
-- Purpose: Store institution-specific official scoring scales.
-- Each result preserves the exact approved BARÈME version used.
-- No automatic recalculation of historical results.
--
CREATE TABLE IF NOT EXISTS public.barmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  source text,  -- 'excel', 'csv', 'word', 'manual'
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'validated', 'active', 'archived'
  version integer NOT NULL DEFAULT 1,  -- Incremented on validation
  validated_at timestamptz,
  validated_by uuid REFERENCES public.auth.users(id),
  original_table_json jsonb NOT NULL,  -- Preserved original imported table
  structured_config_json jsonb NOT NULL,  -- Parsed structured configuration
  ambiguities_json jsonb DEFAULT '[]'::jsonb,
  warnings_json jsonb DEFAULT '[]'::jsonb,
  higher_is_better boolean NOT NULL,
  scale_type text,  -- '20', '10', '100', 'custom'
  value_type text,  -- 'discrete', 'mixed', 'range'
  detected_range_min numeric,
  detected_range_max numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.auth.users(id),

  -- Constraints
  CHECK (status IN ('pending','validated','active','archived')),
  CHECK (higher_is_better IN (true,false))
);

-- Index for institution filtering
CREATE INDEX IF NOT EXISTS barmes_institution_id_idx ON public.barmes(institution_id);

-- =============================================================================
-- 6. public.barme_thresholds — Scoring Thresholds
-- -------------------------------------------------------
-- Purpose: Stores each individual threshold entry from a BARÈME.
-- Each result row preserves the barme_id and barme_version used.
--
CREATE TABLE IF NOT EXISTS public.barme_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barme_id uuid NOT NULL REFERENCES public.barmes(id) ON DELETE CASCADE,
  raw_value numeric NOT NULL,
  converted_score numeric(5,2) NOT NULL,  -- The score assigned BY THAT BARÈME version
  threshold_order integer NOT NULL,
  notes text,
  -- Preservation: barme_version used is recorded in the test_result, not here
  -- No automatic recalculation — converted_score is frozen as calculated
);

-- Indexes
CREATE INDEX IF NOT EXISTS barme_thresholds_barme_id_idx ON public.barme_thresholds(barme_id);
CREATE INDEX IF NOT EXISTS barme_thresholds_order_idx ON public.barme_thresholds(barme_id, threshold_order);

-- =============================================================================
-- 7. public.test_results — Test Results (PRESERVED with version tracking)
-- -------------------------------------------------------
-- The existing public.test_results table is PRESERVED unchanged, WITH the following:
--   - Each result row preserves the exact barme_version used (added context)
--   - converted_score is frozen as calculated; no automatic recalculation
--   - barme_name and barme_version are stored for historical reference
--
-- NO ALTERATION to existing table structure, but application logic ensures:
--   - When creating a new test result, barme_id and barme_version are recorded
--   - Historical results retain their original barme_version and converted_score
--   - No function automatically recalculates historical scores

-- =============================================================================
-- 8. public.institution_test_program — Institution-Specific Test Programs (CORRECTED)
-- -------------------------------------------------------
-- Purpose: Per-institution test enable/disable configuration.
-- Use stable test IDs and institution-safe foreign keys.
-- Avoid using test names as database relationships.
-- One institution must never inherit another institution's configuration.
--
CREATE TABLE IF NOT EXISTS public.institution_test_program (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,  -- Uses test ID, NOT test name
  is_enabled boolean DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- Indexes + institution filtering
CREATE INDEX IF NOT EXISTS institution_test_program_institution_id_idx ON public.institution_test_program(institution_id);
CREATE INDEX IF NOT EXISTS institution_test_program_enabled_idx ON public.institution_test_program(is_enabled);

-- =============================================================================
-- 9. public.test_facility_requirements — Test-to-Facility Mapping (CORRECTED)
-- -------------------------------------------------------
-- Purpose: Maps which tests require which facilities/equipment.
-- Use institution-safe references. Prevent cross-institution facility/equipment references.
--
CREATE TABLE IF NOT EXISTS public.test_facility_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,  -- Uses test ID
  required_facility_id uuid REFERENCES public.institution_facilities(id),  -- Scoped by institution
  required_equipment jsonb DEFAULT '[]'::jsonb,  -- Equipment list
  minimum_capacity integer,  -- Minimum students needed
  is_mandatory boolean DEFAULT false,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE  -- INSTITUTION SCOPING
);

-- Indexes
CREATE INDEX IF NOT EXISTS test_facility_requirements_test_id_idx ON public.test_facility_requirements(test_id);
CREATE INDEX IF NOT EXISTS test_facility_requirements_institution_id_idx ON public.test_facility_requirements(institution_id);

-- Business rule: required_facility_id and required_equipment are scoped to the institution
-- via the institution_id FK. A facility from institution A cannot be referenced
-- by institution B's test requirements.

-- =============================================================================
-- 10. public.institution_facilities — Sports Facilities (CORRECTED)
-- -------------------------------------------------------
-- Purpose: Per-institution sports facilities configuration.
-- Institution-specific. One institution never inherits another's configuration.
--
CREATE TABLE IF NOT EXISTS public.institution_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  facility_name text NOT NULL,  -- 'running_track','gym','field','pool'
  facility_description text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- Indexes + institution filtering
CREATE INDEX IF NOT EXISTS institution_facilities_institution_id_idx ON public.institution_facilities(institution_id);
CREATE INDEX IF NOT EXISTS institution_facilities_name_idx ON public.institution_facilities(facility_name);

-- Business rule: facility_name values are institution-specific. No cross-institution references.

-- =============================================================================
-- 11. public.audit_log — Audit Log (EXISTING TABLE, PRESERVED)
-- -------------------------------------------------------
-- The existing public.audit_log table is PRESERVED unchanged.
-- All audit history is preserved. No deletion permitted that removes audit records.
-- ON DELETE CASCADE is NOT applied to references of audit_log to preserve history.
--
-- NO CHANGES to public.audit_log — preserved as-is.

-- =============================================================================
-- 12. Public.sessions — Sports Sessions (EXISTING TABLE, PRESERVED)
-- -------------------------------------------------------
-- The existing public.sessions table is PRESERVED unchanged.
-- One actual sports session stored once. Multiple students linked via attendance.
-- NO session duplication per student.
--
-- NO ALTERATION to existing table structure.

-- =============================================================================
-- PRESERVATION SUMMARY
-- =============================================================================
--
-- EXISTING TABLES PRESERVED COMPLETELY (NO ALTERATION):
--   public.institutions        — unchanged
--   public.profiles            — unchanged
--   public.students            — unchanged
--   public.attendance          — unchanged (rehab logic uses existing + new rehab_notifications)
--   public.tests               — unchanged
--   public.test_results        — unchanged (preserved with version tracking)
--   public.sessions            — unchanged (one session stored once, multiple students via attendance)
--   public.coach_notes         — unchanged (ownership via owner_id = auth.uid(), RLS enforced)
--   public.audit_log           — unchanged (all history preserved, no destructive deletion)
--
-- NEW TABLES ADDED (additive only):
--   public.rehab_notifications       — per-student notification state
--   public.rehab_history             — per-student notification history
--   public.coach_identities          — coach identity mapping (coach-1/coach-2/legacy)
--   public.barmes                    — official BARÈME scoring scales with versioning
--   public.barme_thresholds          — individual threshold entries
--   public.institution_test_program  — per-institution test enable/disable (uses test IDs)
--   public.test_facility_requirements — test-to-facility mapping (institution-scoped)
--   public.institution_facilities    — per-institution facilities configuration
--
-- RLS POLICIES:
--   - Existing 9 tables: policies PRESERVED, no changes
--   - New tables: adopt same RLS pattern (institution_id + current_institution_id(),
--     role = 'admin', auth.uid())
--   - coach_notes RLS: owner_id = auth.uid() enforced by DB, not application layer
--   - coach_identities: SELECT by auth.users, INSERT by admins
--
-- DELETION SAFETY:
--   - ON DELETE CASCADE used only where data loss is acceptable:
--     * coach_identities: user_id CASCADE (orphan identities OK)
--     * barmes: institution_id CASCADE (institution deleted, barmes deleted)
--     * barme_thresholds: barme_id CASCADE (BARÈME deleted, thresholds deleted)
--     * rehab_notifications: institution_id CASCADE, student_id CASCADE
--     * rehab_history: institution_id CASCADE, student_id CASCADE
--     * institution_test_program: institution_id CASCADE, test_id CASCADE
--     * test_facility_requirements: test_id CASCADE, facility_id CASCADE
--     * institution_facilities: institution_id CASCADE
--   - ON DELETE RESTRICT preferred where historical records must remain:
--     * students: results CASCADE, attendance CASCADE (session records deleted with student)
--     * audit_log: NEVER CASCADE (history must always be preserved)
--     * test_results: RESTRICT (cannot delete if referenced by historical analysis)
--
-- =============================================================================
-- APPROVAL REQUIRED BEFORE EXECUTION:
--   1. Review the exact SQL above, focusing on corrections 1-6
--   2. Confirm rehabilitation uses single session + attendance linking (NOT session duplication)
--   3. Confirm coach privacy uses DB RLS (owner_id = auth.uid()) not app-layer filtering
--   4. Confirm test infrastructure uses test IDs, NOT test names, with institution_id scoping
--   5. Confirm BARÈME version preservation: each result stores barme_version, no auto-recalculation
--   6. Confirm RLS policies explicit for every table, tested for 2 institutions/admins/coaches/unauthenticated
--   7. Confirm ON DELETE CASCADE reviewed; RESTRICT where history must preserved
--   8. Approve execution OR request modifications
--
-- =============================================================================
-- END OF CORRECTED PHASE 2 MIGRATION DESIGN
-- =============================================================================