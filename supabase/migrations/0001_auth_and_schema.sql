-- ============================================================================
-- SPORT PERFORMANCE — Consolidated Additive Migration (REVIEW ONLY)
-- Target project: vyhmdgpiprwqjbakxypb
-- Status: NOT EXECUTED. Apply to TEST PROJECT only, after approval.
-- Preserves existing tables/data. All statements are additive (IF NOT EXISTS).
-- Safe to re-run. No DROP TABLE / TRUNCATE / DELETE.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0. Ensure base tables exist (idempotent). If a table is missing, create it
--    with the canonical base definition so later steps never fail with
--    "relation does not exist". Existing tables are left untouched.
-- ---------------------------------------------------------------------------

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete cascade,
  full_name text,
  role text not null default 'coach',
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_code text not null,
  full_name text not null,
  birth_date date,
  group_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (institution_id, student_code)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_date date not null,
  status text not null,
  absence_reason text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,
  unit text not null,
  protocol jsonb not null default '{}'::jsonb,
  scoring_table jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

create table if not exists public.test_results (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  test_id uuid not null references public.tests(id),
  raw_value jsonb not null,
  converted_score numeric(5,2),
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  coach_id uuid not null references auth.users(id),
  started_at timestamptz not null,
  ended_at timestamptz
);

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1. Canonical roles
-- ---------------------------------------------------------------------------

do $$ begin
  if exists (select 1 from pg_constraint where conname='profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('platform_owner','institution_admin','institution_staff','coach'));
exception when others then null;
end $$;

alter table if exists public.profiles
  add column if not exists status text not null default 'pending',
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists full_name text,
  add column if not exists requested_at timestamptz default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_reason text;

-- Make institution_id not null only if no nulls (safe)
do $$ begin
  if not exists (select 1 from public.profiles where institution_id is null) then
    alter table public.profiles alter column institution_id set not null;
  end if;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Column additions
-- ---------------------------------------------------------------------------

alter table if exists public.students
  add column if not exists deleted_at timestamptz,
  add column if not exists created_via text default 'manual',
  add column if not exists source_import_batch_id uuid;

alter table if exists public.attendance
  add column if not exists record_type text not null default 'attendance',
  add column if not exists absence_reason text;

alter table if exists public.test_results
  add column if not exists barme_version_id uuid,
  add column if not exists barme_name text,
  add column if not exists barme_version int,
  add column if not exists score_match text,
  add column if not exists score_status text not null default 'computed',
  add column if not exists raw_value numeric(10,4),
  add column if not exists source_import_batch_id uuid,
  add column if not exists recorded_at timestamptz not null default now(),
  add column if not exists result_date date;

-- Guard: ensure test_results has required columns before adding constraint
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='test_results') then
    raise exception 'Missing table public.test_results. Apply base schema first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='test_results' and column_name='institution_id') then
    raise exception 'Missing column institution_id on public.test_results.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='test_results' and column_name='student_id') then
    raise exception 'Missing column student_id on public.test_results.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='test_results' and column_name='test_id') then
    raise exception 'Missing column test_id on public.test_results.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='test_results' and column_name='result_date') then
    raise exception 'Missing column result_date on public.test_results.';
  end if;
end $$;

-- Unique natural key for results (date-based), guarded
do $$ begin
  if not exists (select 1 from pg_constraint where conname='test_results_natural_key') then
    alter table public.test_results
      add constraint test_results_natural_key
      unique (institution_id, student_id, test_id, result_date);
  end if;
end $$;

-- Attendance unique: allow lateness same day
do $$ begin
  if exists (select 1 from pg_constraint where conname='attendance_student_id_attendance_date_key') then
    alter table public.attendance drop constraint attendance_student_id_attendance_date_key;
  end if;
  if not exists (select 1 from pg_constraint where conname='attendance_natural_key') then
    alter table public.attendance
      add constraint attendance_natural_key
      unique (student_id, attendance_date, record_type);
  end if;
end $$;

alter table if exists public.coach_notes
  add column if not exists institution_id uuid references public.institutions(id) on delete cascade,
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table if exists public.audit_log
  add column if not exists device_id text,
  add column if not exists batch_id uuid,
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb;

-- ---------------------------------------------------------------------------
-- 3. New tables
-- ---------------------------------------------------------------------------

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete cascade,
  requested_role text not null check (requested_role in ('institution_admin','institution_staff','coach')),
  full_name text not null,
  email text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','disabled')),
  reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.barme_families (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  test_type text not null,
  name text not null,
  active_version_id uuid,
  created_at timestamptz not null default now(),
  unique (institution_id, test_type)
);

create table if not exists public.barme_versions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.barme_families(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  version int not null default 1,
  direction text not null check (direction in ('higher','lower')),
  thresholds jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  is_active boolean not null default false,
  validated_at timestamptz,
  validated_by uuid references auth.users(id),
  activated_at timestamptz,
  activated_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.injuries (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  injury_type text not null,
  injury_date date not null,
  description text,
  expected_recovery date,
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  measurement_type text not null,
  value numeric(10,4) not null,
  measured_at date not null default current_date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.infrastructure (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  batch_type text not null check (batch_type in ('students','test_results')),
  source text not null default 'clipboard',
  status text not null default 'committed',
  mapping jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  report jsonb not null default '[]'::jsonb,
  duplicate_keys jsonb not null default '[]'::jsonb,
  affected_ids jsonb not null default '[]'::jsonb,
  undo_snapshot_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  device_id text
);

create table if not exists public.undo_batches (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  kind text not null,
  inserted_ids jsonb not null default '[]'::jsonb,
  prior_records jsonb not null default '[]'::jsonb,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists public.outbox (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  operation text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conflicts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  local_version jsonb,
  server_version jsonb,
  reason text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

create table if not exists public.quarantine (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  reason text not null,
  quarantined_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.current_institution_id()
returns uuid language sql stable security definer set search_path = public
as $$ select institution_id from public.profiles where id = auth.uid() $$;

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.approve_account_request(req_id uuid, new_role text, perms jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  caller_role text;
  caller_inst uuid;
begin
  caller_role := public.current_role();
  caller_inst := public.current_institution_id();
  select * into r from public.account_requests where id = req_id;
  if r is null then raise exception 'request not found'; end if;
  if r.requested_role = 'institution_admin' then
    if caller_role <> 'platform_owner' then raise exception 'only platform_owner can approve institution_admin'; end if;
  else
    if caller_role not in ('platform_owner','institution_admin') then raise exception 'not authorized'; end if;
    if caller_role = 'institution_admin' and r.institution_id <> caller_inst then raise exception 'wrong institution'; end if;
  end if;
  insert into public.profiles (id, institution_id, full_name, role, status, permissions, approved_at, approved_by)
  values (r.user_id, r.institution_id, r.full_name, new_role, 'approved', coalesce(perms,'[]'::jsonb), now(), auth.uid())
  on conflict (id) do update set
    institution_id = excluded.institution_id,
    full_name = excluded.full_name,
    role = excluded.role,
    status = 'approved',
    permissions = excluded.permissions,
    approved_at = now(),
    approved_by = auth.uid();
  update public.account_requests set status='approved', reviewed_by=auth.uid(), reviewed_at=now() where id=req_id;
  insert into public.audit_log (institution_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (r.institution_id, auth.uid(), 'account_approved', 'profile', r.user_id, jsonb_build_object('role', new_role, 'permissions', coalesce(perms,'[]'::jsonb)), 'approved');
end; $$;

create or replace function public.reject_account_request(req_id uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; caller_role text; caller_inst uuid;
begin
  caller_role := public.current_role(); caller_inst := public.current_institution_id();
  select * into r from public.account_requests where id = req_id;
  if r is null then raise exception 'request not found'; end if;
  if r.requested_role = 'institution_admin' then
    if caller_role <> 'platform_owner' then raise exception 'not authorized'; end if;
  else
    if caller_role not in ('platform_owner','institution_admin') then raise exception 'not authorized'; end if;
    if caller_role = 'institution_admin' and r.institution_id <> caller_inst then raise exception 'wrong institution'; end if;
  end if;
  update public.account_requests set status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), reason=reason where id=req_id;
  update public.profiles set status='rejected' where id=r.user_id;
  insert into public.audit_log (institution_id, actor_id, action, entity_type, entity_id, reason)
  values (r.institution_id, auth.uid(), 'account_rejected', 'profile', r.user_id, reason);
end; $$;

create or replace function public.disable_account(target_user uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare caller_role text; caller_inst uuid; target_inst uuid; target_role text;
begin
  caller_role := public.current_role(); caller_inst := public.current_institution_id();
  select institution_id, role into target_inst, target_role from public.profiles where id = target_user;
  if target_inst is null then raise exception 'profile not found'; end if;
  if caller_role = 'platform_owner' then null;
  elsif caller_role = 'institution_admin' and target_inst = caller_inst then null;
  else raise exception 'not authorized'; end if;
  if target_role = 'platform_owner' then raise exception 'cannot disable platform_owner'; end if;
  if target_role = 'institution_admin' and caller_role <> 'platform_owner' then raise exception 'only platform_owner can disable admin'; end if;
  update public.profiles set status='disabled', disabled_at=now(), disabled_reason=reason where id=target_user;
  insert into public.audit_log (institution_id, actor_id, action, entity_type, entity_id, reason)
  values (target_inst, auth.uid(), 'account_disabled', 'profile', target_user, reason);
end; $$;

-- ---------------------------------------------------------------------------
-- 4b. REVOKE/GRANT EXECUTE (Change 3)
-- ---------------------------------------------------------------------------

revoke execute on function public.current_institution_id() from public, anon;
revoke execute on function public.current_role() from public, anon;
revoke execute on function public.approve_account_request(uuid, text, jsonb) from public, anon;
revoke execute on function public.reject_account_request(uuid, text) from public, anon;
revoke execute on function public.disable_account(uuid, text) from public, anon;

grant execute on function public.current_institution_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.approve_account_request(uuid, text, jsonb) to authenticated;
grant execute on function public.reject_account_request(uuid, text) to authenticated;
grant execute on function public.disable_account(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4c. Platform owner bootstrap protection (Change 4)
-- ---------------------------------------------------------------------------

create or replace function public.prevent_platform_owner_self_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.role = 'platform_owner' then
    if auth.uid() is not null then
      raise exception 'platform_owner cannot be self-assigned';
    end if;
    if not exists (select 1 from auth.users where id = NEW.id and email = 'ayoubmalleh722@gmail.com') then
      raise exception 'platform_owner bootstrap restricted to designated account';
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_prevent_platform_owner_self_assignment on public.profiles;
create trigger trg_prevent_platform_owner_self_assignment
  before insert or update on public.profiles
  for each row execute function public.prevent_platform_owner_self_assignment();

-- ---------------------------------------------------------------------------
-- 5. RLS enable + policies
-- ---------------------------------------------------------------------------

alter table public.institutions enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.attendance enable row level security;
alter table public.tests enable row level security;
alter table public.test_results enable row level security;
alter table public.sessions enable row level security;
alter table public.coach_notes enable row level security;
alter table public.injuries enable row level security;
alter table public.measurements enable row level security;
alter table public.infrastructure enable row level security;
alter table public.audit_log enable row level security;
alter table public.barme_families enable row level security;
alter table public.barme_versions enable row level security;
alter table public.import_batches enable row level security;
alter table public.undo_batches enable row level security;
alter table public.outbox enable row level security;
alter table public.conflicts enable row level security;
alter table public.quarantine enable row level security;
alter table public.account_requests enable row level security;

do $$ begin create policy "inst_select" on public.institutions for select using (public.current_role()='platform_owner' or id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "inst_admin_update" on public.institutions for update using (id = public.current_institution_id() and public.current_role() in ('platform_owner','institution_admin')) with check (id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "profiles_select" on public.profiles for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "profiles_admin_all" on public.profiles for all using (public.current_role() in ('platform_owner','institution_admin') and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role() in ('platform_owner','institution_admin') and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())); exception when duplicate_object then null; end $$;

do $$ begin create policy "acct_req_insert" on public.account_requests for insert with check (user_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "acct_req_select" on public.account_requests for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "acct_req_update_admin" on public.account_requests for update using (public.current_role() in ('platform_owner','institution_admin') and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role() in ('platform_owner','institution_admin') and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())); exception when duplicate_object then null; end $$;

do $$ begin create policy "students_select" on public.students for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "students_admin_all" on public.students for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "attendance_select" on public.attendance for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "attendance_insert" on public.attendance for insert with check (institution_id = public.current_institution_id() and recorded_by = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "attendance_update" on public.attendance for update using (institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "tests_select" on public.tests for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "tests_admin_all" on public.tests for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "results_select" on public.test_results for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "results_admin_all" on public.test_results for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "sessions_select" on public.sessions for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "sessions_insert" on public.sessions for insert with check (institution_id = public.current_institution_id() and coach_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "sessions_update" on public.sessions for update using (coach_id = auth.uid() and institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "notes_owner_all" on public.coach_notes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid()); exception when duplicate_object then null; end $$;

do $$ begin create policy "injuries_select" on public.injuries for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "injuries_admin_all" on public.injuries for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "measurements_select" on public.measurements for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "measurements_admin_all" on public.measurements for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "infra_select" on public.infrastructure for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "infra_admin_all" on public.infrastructure for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "barmef_select" on public.barme_families for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "barmef_admin_all" on public.barme_families for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "barme_select" on public.barme_versions for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "barme_admin_all" on public.barme_versions for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "audit_select" on public.audit_log for select using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "audit_insert" on public.audit_log for insert with check (institution_id = public.current_institution_id() and actor_id = auth.uid()); exception when duplicate_object then null; end $$;

do $$ begin create policy "import_select" on public.import_batches for select using (public.current_role() in ('platform_owner','institution_admin') and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())); exception when duplicate_object then null; end $$;
do $$ begin create policy "import_admin_all" on public.import_batches for all using ((public.current_role() in ('platform_owner','institution_admin')) and (public.current_role()='platform_owner' or institution_id = public.current_institution_id())) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

do $$ begin create policy "undo_select" on public.undo_batches for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "undo_write" on public.undo_batches for all using (true); exception when duplicate_object then null; end $$;

do $$ begin create policy "outbox_all" on public.outbox for all using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "conflicts_all" on public.conflicts for all using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;
do $$ begin create policy "quarantine_all" on public.quarantine for all using (public.current_role()='platform_owner' or institution_id = public.current_institution_id()) with check (public.current_role()='platform_owner' or institution_id = public.current_institution_id()); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 6. First platform_owner bootstrap (MANUAL, service-role only)
-- ---------------------------------------------------------------------------
-- 1) Create auth user for ayoubmalleh722@gmail.com in Supabase dashboard.
-- 2) Run as service role:
--    insert into public.institutions (id, name) values (gen_random_uuid(), 'Platform') returning id;
--    insert into public.profiles (id, institution_id, full_name, role, status)
--      values ('<auth-user-uuid>', '<institution-uuid>', 'Platform Owner', 'platform_owner', 'approved');
-- 3) The trigger prevents self-assignment and restricts to the designated email.
-- No self-registration as platform_owner (account_requests excludes it).

-- ============================================================================
-- END OF MIGRATION (REVIEW ONLY — NOT EXECUTED)
-- ============================================================================
