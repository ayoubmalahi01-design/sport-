-- STAGE 8 (REVIEW ONLY — NOT EXECUTED)
-- RLS policies for SPORT Performance. Apply to a TEST project only, after explicit approval.
-- Assumes tables: institutions, profiles, students, attendance, tests, test_results,
-- sessions, coach_notes, injuries, measurements, infrastructure, audit_log,
-- barme_families, barme_versions, import_batches, undo_batches, outbox, conflicts, quarantine.

-- Helper: current user's institution
-- (profiles.id = auth.uid(), profiles.institution_id, profiles.role)

-- Enable RLS on all tables
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE injuries ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE infrastructure ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE barme_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE barme_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE undo_batches ENABLE ROW LEVEL SECURITY;

-- Institutions: members can read their own institution
CREATE POLICY inst_read ON institutions FOR SELECT
  USING (id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));

-- Profiles: users read own profile; admins read institution profiles
CREATE POLICY profile_self ON profiles FOR SELECT
  USING (id = auth.uid() OR institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY profile_update_self ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Generic institution isolation for data tables (SELECT)
-- students
CREATE POLICY students_read ON students FOR SELECT
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY students_write ON students FOR INSERT
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY students_update ON students FOR UPDATE
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY students_delete ON students FOR DELETE
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');

-- test_results (official results: admin only writes)
CREATE POLICY results_read ON test_results FOR SELECT
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY results_write ON test_results FOR INSERT
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY results_update ON test_results FOR UPDATE
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY results_delete ON test_results FOR DELETE
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');

-- attendance (coaches + admins)
CREATE POLICY att_read ON attendance FOR SELECT
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY att_write ON attendance FOR INSERT
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY att_update ON attendance FOR UPDATE
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));

-- sessions (coaches + admins)
CREATE POLICY sess_read ON sessions FOR SELECT
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY sess_write ON sessions FOR ALL
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));

-- coach_notes (owner-private)
CREATE POLICY notes_owner_select ON coach_notes FOR SELECT
  USING (owner_id = auth.uid());
CREATE POLICY notes_owner_insert ON coach_notes FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY notes_owner_update ON coach_notes FOR UPDATE
  USING (owner_id = auth.uid());
CREATE POLICY notes_owner_delete ON coach_notes FOR DELETE
  USING (owner_id = auth.uid());

-- injuries / measurements / infrastructure (admin writes, members read)
CREATE POLICY inj_read ON injuries FOR SELECT USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY inj_write ON injuries FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY meas_read ON measurements FOR SELECT USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY meas_write ON measurements FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY infra_read ON infrastructure FOR SELECT USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY infra_write ON infrastructure FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');

-- barme (admin writes, members read)
CREATE POLICY barme_read ON barme_versions FOR SELECT USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY barme_write ON barme_versions FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY barmef_read ON barme_families FOR SELECT USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY barmef_write ON barme_families FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');

-- audit_log (append by system; admin read)
CREATE POLICY audit_read ON audit_log FOR SELECT
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');

-- import_batches / undo_batches (admin)
CREATE POLICY imp_read ON import_batches FOR SELECT USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY imp_write ON import_batches FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()) AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'institution_admin');
CREATE POLICY undo_read ON undo_batches FOR SELECT USING (TRUE);
CREATE POLICY undo_write ON undo_batches FOR ALL USING (TRUE);

-- NOTE: first-admin bootstrap must be handled out-of-band (service role) or via a
-- trusted invite flow. Client-side role checks are NOT authorization.