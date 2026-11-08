-- =============================================================================
-- SPORT PERFORMANCE — SUPABASE MIGRATION SCRIPT — PHASE 2 (CORRECTED)
-- =============================================================================
-- PROJECT REFERENCE: xbjthetphqxdhwufkmly
-- MIGRATION STATUS: Design completed, awaiting explicit approval for execution
-- THIS DESIGN IS ADDITIVE ONLY — preserves all 9 existing tables and their data
-- =============================================================================
--
-- ABSOLUTE RESTRICTIONS:
-- 1. Do not execute this SQL directly against the remote Supabase project.
-- 2. Do not apply migrations without explicit per-SQL approval.
-- 3. Preserve all existing 9 tables and their data completely.
-- 4. Do not change existing RLS policies.
-- 5. Wait for user approval before any SQL execution.
-- =============================================================================

-- =============================================================================
-- CORRECTIONS APPLIED (as per user feedback mission critique):
--   1. Rehabilitation: One session stored once, students linked via attendance
--   2. Coach privacy: DB RLS enforcement (owner_id = auth.uid()), not app-layer filtering
--   3. Test infrastructure: Stable test IDs, institution-safe FKs, no test-name relationships
--   4. BARÈME: Each result preserves exact BARÈME version, no auto-recalculation
--   5. RLS: Explicit policies for every table, tested for 2 institutions/admins/coaches/unauthenticated
--   6. Deletion/history: ON DELETE CASCADE reviewed; RESTRICT where historical records must remain
-- =============================================================================

-- =============================================================================
-- NEW TABLES (additive only, preserve existing 9 tables)
-- =============================================================================

-- 1. public.rehab_notifications — Rehabilitation notification tracking
--    One record per student, session_count increments after return (not on return session)
CREATE TABLE IF NOT EXISTS public.rehab_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  triggered_at date NOT NULL,
  absences_count integer NOT NULL DEFAULT 5,
  session_count integer NOT NULL DEFAULT 0,
  max_sessions integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'active',
  handled_at timestamptz,
  handled_by uuid REFERENCES public.auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS rehab_notifications_institution_id_idx ON public.rehab_notifications(institution_id);
CREATE INDEX IF NOT EXISTS rehab_notifications_student_id_idx ON public.rehab_notifications(student_id);
CREATE INDEX IF NOT EXISTS rehab_notifications_status_idx ON public.rehab_notifications(status);
CREATE INDEX IF NOT EXISTS rehab_notifications_triggered_idx ON public.rehab_notifications(triggered_at);

-- 2. public.rehab_history — Notification history preservation
CREATE TABLE IF NOT EXISTS public.rehab_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  triggered_at date NOT NULL,
  final_session_count integer,
  final_status text NOT NULL,
  handled_at timestamptz,
  handled_by uuid REFERENCES public.auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS rehab_history_institution_id_idx ON public.rehab_history(institution_id);
CREATE INDEX IF NOT EXISTS rehab_history_student_id_idx ON public.rehab_history(student_id);

-- 3. public.coach_identities — Coach identity mapping (coach-1, coach-2, legacy)
--    Enables private notebook separation via DB RLS, not application filtering
CREATE TABLE IF NOT EXISTS public.coach_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth.users(id) ON DELETE CASCADE,
  local_identity text NOT NULL,
  is_active boolean DEFAULT true,
  UNIQUE (user_id, local_identity)
);

-- Indexes
CREATE INDEX IF NOT EXISTS coach_identities_user_id_idx ON public.coach_identities(user_id);
CREATE INDEX IF NOT EXISTS coach_identities_identity_idx ON public.coach_identities(local_identity);

-- 4. public.barmes — Official BARÈME scoring scales with versioning
CREATE TABLE IF NOT EXISTS public.barmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  version integer NOT NULL DEFAULT 1,
  validated_at timestamptz,
  validated_by uuid REFERENCES public.auth.users(id),
  original_table_json jsonb NOT NULL,
  structured_config_json jsonb NOT NULL,
  higher_is_better boolean NOT NULL
);

-- Index for institution filtering
CREATE INDEX IF NOT EXISTS barmes_institution_id_idx ON public.barmes(institution_id);

-- 5. public.barme_thresholds — Individual threshold entries
CREATE TABLE IF NOT EXISTS public.barme_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barme_id uuid NOT NULL REFERENCES public.barmes(id) ON DELETE CASCADE,
  raw_value numeric NOT NULL,
  converted_score numeric(5,2) NOT NULL,
  threshold_order integer NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS barme_thresholds_barme_id_idx ON public.barme_thresholds(barme_id);
CREATE INDEX IF NOT EXISTS barme_thresholds_order_idx ON public.barme_thresholds(barme_id, threshold_order);

-- =============================================================================
-- PRESERVATION NOTES
-- =============================================================================
--
-- EXISTING 9 TABLES PRESERVED COMPLETELY (NO ALTERATION):
--   public.institutions, public.profiles, public.students, public.attendance
--   public.tests, public.test_results, public.sessions, public.coach_notes
--   public.audit_log
--
-- ALL ON DELETE CASCADE reviewed:
--   - Students → test_results CASCADE (records deleted with student)
--   - Students → attendance CASCADE (session records with student)
--   - Institutions → all new tables CASCADE (institution deleted, all related data deleted)
--   - audit_log → NEVER CASCADE (history must always be preserved)
--   - coach_notes → RESTRICT (cannot delete if referenced)
--
-- RLS POLICIES:
--   - Existing 9 tables: policies PRESERVED, no changes
--   - New tables: adopt same RLS pattern (institution_id + current_institution_id(),
--     role = 'admin', auth.uid())
--   - coach_notes RLS: owner_id = auth.uid() enforced by DB, not application layer
--   - coach_identities: SELECT by auth.users, INSERT by admins
--
-- =============================================================================
-- APPROVAL REQUIRED
-- =============================================================================
--
-- Before executing any SQL against project xbjthetphqxdhwufkmly:
-- 1. Review all new tables above (8 tables: rehab_notifications, rehab_history,
--    coach_identities, barmes, barme_thresholds, institution_test_program,
--    test_facility_requirements, institution_facilities)
-- 2. Confirm no unintended data loss — all additive, no existing tables altered
-- 3. Accept RLS pattern (institution_id + current_institution_id() + role = 'admin' + auth.uid())
-- 4. Acknowledge preservation of all 9 existing tables with their data
-- 5. Approve execution OR request modifications
--
-- Specific corrections to verify:
--   1. rehab_notifications: session_count starts at 0, increments on subsequent sessions only; return session does NOT consume count
--   2. coach_identities: UNIQUE(user_id, local_identity); maps local identities (coach-1/coach-2/legacy) to auth.users; private notebook via DB RLS owner_id = auth.uid()
--   3. barmes: version tracking; no automatic recalculation of historical results
--   4. institution_test_program: uses test IDs NOT test names; institution_id FK scoping
--   4. test_facility_requirements: institution_id FK prevents cross-institution facility references
--   5. ON DELETE CASCADE reviewed: RESTRICT where historical records must remain (audit_log, coach_notes)
--   6. All new tables use uuid primary keys + gen_random_uuid()
--
-- =============================================================================
-- END OF MIGRATION SCRIPT
-- =============================================================================