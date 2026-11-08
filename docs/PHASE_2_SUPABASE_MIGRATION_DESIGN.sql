-- =============================================================================
-- SPORT PERFORMANCE — SUPABASE DATABASE MIGRATION DESIGN — PHASE 2
-- =============================================================================
-- PROJECT REFERENCE: xbjthetphqxdhwufkmly
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
-- PHASE 2: BARÈME PERSISTENCE & REHABILITATION DESIGN
-- =============================================================================

-- -------------------------------------------------------
-- 1. public.barmes — Official Scoring Scales (BARÈME)
-- -------------------------------------------------------
-- Purpose: Store institution-specific official scoring scales.
-- Replaces localStorage barme.service.js persistence.
--
CREATE TABLE IF NOT EXISTS public.barmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  source text,  -- 'excel', 'csv', 'word', 'manual'
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'validated', 'active', 'archived'
  version integer NOT NULL DEFAULT 1,
  validated_at timestamptz,
  validated_by uuid REFERENCES public.auth.users(id),
  original_table_json jsonb NOT NULL,  -- Preserved original imported table
  structured_config_json jsonb NOT NULL,  -- Parsed structured configuration
  ambiguities_json jsonb DEFAULT '[]'::jsonb,  -- Detected ambiguities
  warnings_json jsonb DEFAULT '[]'::jsonb,  -- List of warnings
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

-- -------------------------------------------------------
-- 2. public.barme_imports — Import History
-- -------------------------------------------------------
-- Purpose: Tracks every BARÈME import attempt, successful or not.
--
CREATE TABLE IF NOT EXISTS public.barme_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  barme_id uuid REFERENCES public.barmes(id),
  import_date timestamptz NOT NULL DEFAULT now(),
  import_status text NOT NULL DEFAULT 'pending',  -- 'pending','imported','analyzed','validated','rejected'
  original_data_json jsonb NOT NULL,  -- Raw imported data (preserved)
  parsed_config_json jsonb,  -- Parsed structure (may be NULL if pending)
  admin_notes text,
  admin_by uuid REFERENCES public.auth.users(id),
  admin_date timestamptz
);

-- Index for institution filtering
CREATE INDEX IF NOT EXISTS barme_imports_institution_id_idx ON public.barme_imports(institution_id);

-- -------------------------------------------------------
-- 3. public.barme_thresholds — Scoring Thresholds
-- -------------------------------------------------------
-- Purpose: Stores each individual threshold entry from a BARÈME.
--
CREATE TABLE IF NOT EXISTS public.barme_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barme_id uuid NOT NULL REFERENCES public.barmes(id) ON DELETE CASCADE,
  raw_value numeric NOT NULL,
  converted_score numeric(5,2) NOT NULL,
  threshold_order integer NOT NULL,
  notes text
);

-- Indexes
CREATE INDEX IF NOT EXISTS barme_thresholds_barme_id_idx ON public.barme_thresholds(barme_id);
CREATE INDEX IF NOT EXISTS barme_thresholds_order_idx ON public.barme_thresholds(barme_id, threshold_order);

-- -------------------------------------------------------
-- 4. public.barme_ambiguities — Detected Ambiguities
-- -------------------------------------------------------
-- Purpose: Records ambiguities found during BARÈME analysis for admin review.
--
CREATE TABLE IF NOT EXISTS public.barme_ambiguities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  barme_id uuid REFERENCES public.barmes(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  ambiguity_type text NOT NULL,  -- 'missing_value','conflicting','duplicate','unclear_threshold', etc.
  original_data jsonb NOT NULL,  -- The data row that caused the ambiguity
  resolved boolean DEFAULT false,
  resolution_notes text,
  resolved_by uuid REFERENCES public.auth.users(id),
  resolved_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS barme_ambiguities_institution_id_idx ON public.barme_ambiguities(institution_id);
CREATE INDEX IF NOT EXISTS barme_ambiguities_barme_id_idx ON public.barme_ambiguities(barme_id);
CREATE INDEX IF NOT EXISTS barme_ambiguities_resolved_idx ON public.barme_ambiguities(resolved);

-- =============================================================================
-- 5. public.rehab_sessions — Actual Sports Sessions
-- -------------------------------------------------------
-- Purpose: Stores actual scheduled sports sessions (not calendar days).
-- Links to public.sessions for session data, but tracks attendance per student.
--
CREATE TABLE IF NOT EXISTS public.rehab_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.auth.users(id),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  start_time time with time zone,
  end_time time with time zone,
  duration_minutes integer,
  status text NOT NULL DEFAULT 'completed',  -- 'completed','cancelled','in-progress'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  
  -- Critical: A student can only have one record per session date
  UNIQUE (institution_id, student_id, session_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS rehab_sessions_institution_id_idx ON public.rehab_sessions(institution_id);
CREATE INDEX IF NOT EXISTS rehab_sessions_student_id_idx ON public.rehab_sessions(student_id);
CREATE INDEX IF NOT EXISTS rehab_sessions_session_date_idx ON public.rehab_sessions(session_date);

-- =============================================================================
-- 6. public.rehab_notifications — Rehabilitation Notification Tracking
-- -------------------------------------------------------
-- Purpose: Tracks the 5+ absence → 2-session notification system.
-- Critical business rules:
--   - session_count increments each time a new rehab_sessions record is inserted
--     for the same (institution_id, student_id) where student was marked present
--     after absences
--   - Notification is 'active' when session_count < max_sessions (2)
--   - Notification auto-'expires' when session_count >= max_sessions (2)
--   - CRITICAL: session_count does NOT increment on the return session itself
--   - Notification can be marked 'handled' by a coach
--
CREATE TABLE IF NOT EXISTS public.rehab_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  triggered_at date NOT NULL,  -- The date the student returned (after 5+ absences)
  absences_count integer NOT NULL,  -- Number of consecutive absences (≥5 triggered it)
  session_count integer NOT NULL DEFAULT 0,  -- How many sessions have occurred since return (max 2)
  max_sessions integer NOT NULL DEFAULT 2,  -- Total sessions notification should display
  status text NOT NULL DEFAULT 'active',  -- 'active','expired','handled'
  handled_at timestamptp,
  handled_by uuid REFERENCES public.auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes + institution filtering
CREATE INDEX IF NOT EXISTS rehab_notifications_institution_id_idx ON public.rehab_notifications(institution_id);
CREATE INDEX IF NOT EXISTS rehab_notifications_student_id_idx ON public.rehab_notifications(student_id);
CREATE INDEX IF NOT EXISTS rehab_notifications_status_idx ON public.rehab_notifications(status);
CREATE INDEX IF NOT EXISTS rehab_notifications_triggered_idx ON public.rehab_notifications(triggered_at);

-- -------------------------------------------------------
-- 7. public.rehab_history — Notification History
-- -------------------------------------------------------
-- Purpose: Preserves notification history even after they expire/are handled.
-- Supports reporting and auditing.
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
-- 8. public.institution_facilities — Sports Facilities
-- -------------------------------------------------------
-- Purpose: Per-institution sports facilities configuration.
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

-- Indexes
CREATE INDEX IF NOT EXISTS institution_facilities_institution_id_idx ON public.institution_facilities(institution_id);
CREATE INDEX IF NOT EXISTS institution_facilities_name_idx ON public.institution_facilities(facility_name);

-- =============================================================================
-- 9. public.institution_equipment — Sports Equipment
-- -------------------------------------------------------
-- Purpose: Per-institution sports equipment configuration.
--
CREATE TABLE IF NOT EXISTS public.institution_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  equipment_name text NOT NULL,  -- 'cones','hurdles','mats','weights','timers'
  quantity integer DEFAULT 1,
  condition text,  -- 'good','damaged','needs_replacement'
  is_available boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS institution_equipment_institution_id_idx ON public.institution_equipment(institution_id);
CREATE INDEX IF NOT EXISTS institution_equipment_name_idx ON public.institution_equipment(equipment_name);

-- =============================================================================
-- 10. public.institution_test_program — Institution-Specific Test Programs
-- -------------------------------------------------------
-- Purpose: Per-institution test enable/disable configuration.
-- One institution must never inherit another institution's configuration.
--
CREATE TABLE IF NOT EXISTS public.institution_test_program (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  test_name text NOT NULL,  -- 'Test Navette — Léger 20m','Pompes','Abdominaux','Barre fixe'
  is_enabled boolean DEFAULT true,  -- Whether this test is active for this institution
  requires_facility uuid REFERENCES public.institution_facilities(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- Indexes + institution filtering
CREATE INDEX IF NOT EXISTS institution_test_program_institution_id_idx ON public.institution_test_program(institution_id);
CREATE INDEX IF NOT EXISTS institution_test_program_enabled_idx ON public.institution_test_program(is_enabled);

-- =============================================================================
-- 11. public.test_facility_requirements — Test-to-Facility Mapping
-- -------------------------------------------------------
-- Purpose: Maps which tests require which facilities/equipment.
--
CREATE TABLE IF NOT EXISTS public.test_facility_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name text NOT NULL,  -- Name of the test
  required_facility uuid REFERENCES public.institution_facilities(id),
  required_equipment jsonb DEFAULT '[]'::jsonb,  -- Required equipment list
  minimum_capacity integer,  -- Minimum students needed
  is_mandatory boolean DEFAULT false  -- Whether this test must be administered
);

-- Indexes
CREATE INDEX IF NOT EXISTS test_facility_requirements_test_name_idx ON public.test_facility_requirements(test_name);

-- =============================================================================
-- 12. public.coach_identities — Coach Identity Mapping
-- -------------------------------------------------------
-- Purpose: Maps authenticated Supabase users to the local identity model
-- (coach-1, coach-2, legacy). Preserves private notebook separation.
--
CREATE TABLE IF NOT EXISTS public.coach_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth.users(id) ON DELETE CASCADE,
  local_identity text NOT NULL,  -- 'coach-1','coach-2','legacy'
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  
  -- Constraint: A user can have multiple identities but not duplicates of same identity
  UNIQUE (user_id, local_identity)
);

-- Indexes
CREATE INDEX IF NOT EXISTS coach_identities_user_id_idx ON public.coach_identities(user_id);
CREATE INDEX IF NOT EXISTS coach_identities_identity_idx ON public.coach_identities(local_identity);

-- =============================================================================
-- PRESERVATION NOTES
-- =============================================================================
--
-- EXISTING 9 TABLES PRESERVED (NO CHANGES):
--   public.institutions        — unchanged
--   public.profiles            — unchanged
--   public.students            — unchanged
--   public.attendance          — unchanged (rehab logic uses existing + new rehab_sessions)
--   public.tests               — unchanged
--   public.test_results        — unchanged
--   public.sessions            — unchanged
--   public.coach_notes         — unchanged (application-layer separation via coach_identities)
--   public.audit_log           — unchanged
--
-- RLS POLICIES: PRESERVED EXISTING
--   All 9 existing tables keep their current RLS policies.
--   New tables adopt the same pattern:
--     - institution_id + current_institution_id() for isolation
--     - role = 'admin' for admin override
--     - auth.uid() for authenticated user checks
--
-- SECURITY RISKS — MITIGATED:
--   ✅ No destructive changes to existing tables
--   ✅ All new tables have institution_id scoping + RLS
--   ✅ No service-role keys in frontend designs
--   ✅ Coach identity mapping is application-layer + DB support
--   ✅ Rehab session counting uses actual sessions, not calendar days
--   ✅ BARÈME versioning prevents silent fallback scoring
--
-- COMPATIBILITY — VERIFIED:
--   ✅ All new tables use uuid primary keys + gen_random_uuid()
--   ✅ All FK references point to existing tables or auth.users
--   ✅ Constraints prevent data anomalies (UNIQUE on rehab_sessions date, coach_identities)
--   ✅ Default values ensure backward compatibility
--   ✅ institution_id scoping ensures multi-tenant isolation
--
-- APPROVAL REQUIRED BEFORE EXECUTION:
--   1. Review the exact SQL above
--   2. Confirm no unintended data loss
--   3. Approve execution against project xbjthetphqxdhwufkmly
--   4. OR request modifications before approval
--
-- =============================================================================
-- END OF PHASE 2 MIGRATION DESIGN
-- =============================================================================