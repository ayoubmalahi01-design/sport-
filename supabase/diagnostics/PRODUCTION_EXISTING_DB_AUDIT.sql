-- ============================================================================
-- SPORT PERFORMANCE — EXISTING DB AUDIT (READ-ONLY)
-- Target project: vyhmdgpiprwqjbakxypb
-- Purpose: inspect ALL existing schemas/tables/views and detect any prior data
--          or project-related objects before migration.
-- SAFETY: SELECT only. No CREATE/ALTER/DROP/INSERT/UPDATE/DELETE.
--         No secrets or personal data returned.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Server / database info
-- ----------------------------------------------------------------------------
select version() as postgres_version;
select current_database() as db, current_user as usr;

-- ----------------------------------------------------------------------------
-- 1. All schemas (non-system)
-- ----------------------------------------------------------------------------
select schema_name
from information_schema.schemata
where schema_name not in ('pg_catalog','information_schema','pg_toast','pg_temp_1','pg_toast_temp_1')
order by schema_name;

-- ----------------------------------------------------------------------------
-- 2. All tables and views in non-system schemas
-- ----------------------------------------------------------------------------
select table_schema, table_name, table_type
from information_schema.tables
where table_schema not in ('pg_catalog','information_schema','pg_toast')
order by table_schema, table_name;

-- ----------------------------------------------------------------------------
-- 3. Project-related tables (any name containing sport/perf/institution/student/etc.)
-- ----------------------------------------------------------------------------
select table_schema, table_name, table_type
from information_schema.tables
where table_schema not in ('pg_catalog','information_schema','pg_toast')
  and (table_name ilike '%sport%' or table_name ilike '%perf%' or table_name ilike '%institution%'
       or table_name ilike '%student%' or table_name ilike '%attendance%' or table_name ilike '%test%'
       or table_name ilike '%coach%' or table_name ilike '%barme%' or table_name ilike '%audit%'
       or table_name ilike '%profile%' or table_name ilike '%account%')
order by table_schema, table_name;

-- ----------------------------------------------------------------------------
-- 4. auth.users existence + count (no personal data)
-- ----------------------------------------------------------------------------
do $$ begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users: TABLE_MISSING';
  else
    raise notice 'auth.users: EXISTS';
  end if;
end $$;

select count(*) as auth_users_count from auth.users;

-- ----------------------------------------------------------------------------
-- 5. supabase_migrations.schema_migrations (if exists)
-- ----------------------------------------------------------------------------
do $$ begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'supabase_migrations.schema_migrations: TABLE_MISSING';
  else
    raise notice 'supabase_migrations.schema_migrations: EXISTS';
  end if;
end $$;

-- List applied migrations (if table exists) — version + name only, no secrets
do $$ declare r record; begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    for r in
      select version, name from supabase_migrations.schema_migrations order by version
    loop
      raise notice 'MIGRATION: version=% name=%', r.version, r.name;
    end loop;
    raise notice 'MIGRATION LIST: complete';
  else
    raise notice 'MIGRATION LIST: TABLE_MISSING';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. public.rls_auto_enable() full definition
-- ----------------------------------------------------------------------------
select pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='rls_auto_enable';

-- Its security properties
select p.proname as function_name,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner,
       (select setting from pg_settings where name='search_path') as current_search_path_setting
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='rls_auto_enable';

-- Its EXECUTE grants
select coalesce(grantee.rolname, 'PUBLIC') as grantee,
       ace.privilege_type,
       ace.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as ace on true
left join pg_roles grantee on grantee.oid = ace.grantee
where n.nspname='public' and p.proname='rls_auto_enable';

-- ----------------------------------------------------------------------------
-- 7. All functions in public schema (names + signatures + security)
-- ----------------------------------------------------------------------------
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
order by p.proname;

-- ----------------------------------------------------------------------------
-- 8. All triggers in all non-system schemas
-- ----------------------------------------------------------------------------
select trigger_schema, event_object_table, trigger_name, event_manipulation, action_timing
from information_schema.triggers
where trigger_schema not in ('pg_catalog','information_schema')
order by trigger_schema, event_object_table, trigger_name;

-- ----------------------------------------------------------------------------
-- 9. All RLS policies (all schemas)
-- ----------------------------------------------------------------------------
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname not in ('pg_catalog','information_schema')
order by schemaname, tablename, policyname;

-- ----------------------------------------------------------------------------
-- 10. All constraints (PK, FK, UNIQUE, CHECK) in non-system schemas
-- ----------------------------------------------------------------------------
select tc.table_schema, tc.table_name, tc.constraint_type, tc.constraint_name,
       kcu.column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
where tc.table_schema not in ('pg_catalog','information_schema')
order by tc.table_schema, tc.table_name, tc.constraint_type, tc.constraint_name;

-- ----------------------------------------------------------------------------
-- 11. Column details for any project-related table (all schemas)
-- ----------------------------------------------------------------------------
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema not in ('pg_catalog','information_schema')
order by table_schema, table_name, ordinal_position;

-- ----------------------------------------------------------------------------
-- 12. Extensions installed
-- ----------------------------------------------------------------------------
select extname, extversion from pg_extension order by extname;

-- ----------------------------------------------------------------------------
-- 13. Row counts for any existing public tables (approximate, no personal data)
-- ----------------------------------------------------------------------------
do $$ declare t record; c bigint; begin
  for t in
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
  loop
    execute format('select count(*) from public.%I', t.table_name) into c;
    raise notice 'ROWCOUNT public.% = %', t.table_name, c;
  end loop;
end $$;

-- ============================================================================
-- END OF AUDIT (READ-ONLY)
-- ============================================================================