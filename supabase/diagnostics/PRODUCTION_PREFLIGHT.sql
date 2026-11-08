-- ============================================================================
-- SPORT PERFORMANCE — PRODUCTION PREFLIGHT (READ-ONLY)
-- Target project: vyhmdgpiprwqjbakxypb
-- Purpose: inspect existing Supabase database before applying migration.
-- SAFETY: SELECT only. No CREATE/ALTER/DROP/INSERT/UPDATE/DELETE.
--         No secrets or personal data are returned.
-- Usage: paste into Supabase SQL Editor and run. The SINGLE result set below
--        is the primary output. Supplemental NOTICE messages provide detail
--        for table-dependent checks (duplicates, exact counts).
-- ============================================================================

-- ============================================================================
-- UNIFIED RESULT SET (all 13 sections in one result)
-- Columns: section | object_name | status | details
-- ============================================================================
select * from (

  -- -----------------------------------------------------------------------
  -- Section 1: Tables present vs expected
  -- -----------------------------------------------------------------------
  select '1.Tables'::text as section,
         t.expected as object_name,
         case when it.table_name is not null then 'EXISTS' else 'MISSING' end as status,
         coalesce(it.table_type, 'not found') as details
  from (values
    ('institutions'),('profiles'),('students'),('attendance'),('tests'),('test_results'),
    ('sessions'),('coach_notes'),('audit_log'),('account_requests'),('barme_families'),
    ('barme_versions'),('injuries'),('measurements'),('infrastructure'),('import_batches'),
    ('undo_batches'),('outbox'),('conflicts'),('quarantine')
  ) as t(expected)
  left join information_schema.tables it
    on it.table_schema='public' and it.table_name=t.expected

  union all

  -- -----------------------------------------------------------------------
  -- Section 2: Key columns
  -- -----------------------------------------------------------------------
  select '2.Columns'::text,
         (expected.tbl || '.' || expected.col) as object_name,
         case when c.column_name is not null then 'EXISTS' else 'MISSING' end,
         coalesce(c.data_type || ' | nullable=' || c.is_nullable || ' | default=' || coalesce(c.column_default,'none'), 'not found')
  from (values
    ('test_results','raw_value'),('test_results','result_date'),('test_results','converted_score'),
    ('test_results','barme_version_id'),('test_results','score_status'),('test_results','score_match'),
    ('attendance','record_type'),('attendance','absence_reason'),('attendance','status'),
    ('coach_notes','owner_id'),('coach_notes','institution_id'),
    ('profiles','role'),('profiles','status'),('profiles','institution_id'),('profiles','permissions'),
    ('students','student_code'),('students','deleted_at'),('students','created_via'),
    ('audit_log','institution_id'),('audit_log','actor_id'),('audit_log','entity_type'),
    ('audit_log','entity_id'),('audit_log','old_value'),('audit_log','new_value')
  ) as expected(tbl, col)
  left join information_schema.columns c
    on c.table_schema='public' and c.table_name=expected.tbl and c.column_name=expected.col

  union all

  -- -----------------------------------------------------------------------
  -- Section 3: Primary keys
  -- -----------------------------------------------------------------------
  select '3.PK'::text,
         tc.table_name,
         case when tc.constraint_name is not null then 'EXISTS' else 'MISSING' end,
         coalesce(tc.constraint_name, 'no PK')
  from (select distinct table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE') t
  left join information_schema.table_constraints tc
    on tc.table_schema='public' and tc.table_name=t.table_name and tc.constraint_type='PRIMARY KEY'

  union all

  -- -----------------------------------------------------------------------
  -- Section 4: Foreign keys
  -- -----------------------------------------------------------------------
  select '4.FK'::text,
         (tc.table_name || ' -> ' || ccu.table_name),
         'EXISTS',
         (kcu.column_name || ' -> ' || ccu.column_name)
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
  where tc.table_schema='public' and tc.constraint_type='FOREIGN KEY'

  union all

  -- -----------------------------------------------------------------------
  -- Section 5: UNIQUE constraints
  -- -----------------------------------------------------------------------
  select '5.UNIQUE'::text,
         (tc.table_name || '.' || tc.constraint_name),
         'EXISTS',
         string_agg(kcu.column_name, ', ' order by kcu.ordinal_position)
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  where tc.table_schema='public' and tc.constraint_type='UNIQUE'
  group by tc.table_name, tc.constraint_name

  union all

  -- -----------------------------------------------------------------------
  -- Section 6: CHECK constraints
  -- -----------------------------------------------------------------------
  select '6.CHECK'::text,
         (tc.table_name || '.' || tc.constraint_name),
         'EXISTS',
         cc.check_clause
  from information_schema.table_constraints tc
  join information_schema.check_constraints cc
    on tc.constraint_name = cc.constraint_name and tc.table_schema = cc.constraint_schema
  where tc.table_schema='public' and tc.constraint_type='CHECK'

  union all

  -- -----------------------------------------------------------------------
  -- Section 7: RLS enabled / forced
  -- -----------------------------------------------------------------------
  select '7.RLS'::text,
         t.tablename,
         case when t.rowsecurity then 'ENABLED' else 'DISABLED' end,
         'force_rls=' || coalesce(c.relforcerowsecurity::text, 'unknown')
  from pg_tables t
  left join pg_class c on c.relname = t.tablename
  left join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
  where t.schemaname='public'

  union all

  -- -----------------------------------------------------------------------
  -- Section 8: RLS policies
  -- -----------------------------------------------------------------------
  select '8.POLICIES'::text,
         (tablename || '.' || policyname),
         cmd,
         coalesce(qual, '') || ' | WITH CHECK: ' || coalesce(with_check, '')
  from pg_policies
  where schemaname='public'

  union all

  -- -----------------------------------------------------------------------
  -- Section 9: Functions
  -- -----------------------------------------------------------------------
  select '9.FUNCTIONS'::text,
         p.proname,
         case when p.prosecdef then 'SECURITY_DEFINER' else 'SECURITY_INVOKER' end,
         'args=' || pg_get_function_identity_arguments(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'

  union all

  -- -----------------------------------------------------------------------
  -- Section 10: EXECUTE grants
  -- -----------------------------------------------------------------------
  select '10.GRANTS'::text,
         (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'),
         coalesce(grantee.rolname, 'PUBLIC'),
         ace.privilege_type || ' | grantable=' || ace.is_grantable::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as ace on true
  left join pg_roles grantee on grantee.oid = ace.grantee
  where n.nspname='public'

  union all

  -- -----------------------------------------------------------------------
  -- Section 11: Triggers
  -- -----------------------------------------------------------------------
  select '11.TRIGGERS'::text,
         (event_object_table || '.' || trigger_name),
         action_timing || ' ' || event_manipulation,
         action_statement
  from information_schema.triggers
  where trigger_schema='public'

  union all

  -- -----------------------------------------------------------------------
  -- Section 12: Duplicate data check (existence + approximate count)
  -- Uses pg_stat_user_tables (always exists) — no direct table reference.
  -- Exact duplicate queries are in the supplemental DO blocks below.
  -- -----------------------------------------------------------------------
  select '12.DUP_CHECK'::text,
         t.tbl,
         case when to_regclass('public.' || t.tbl) is null then 'TABLE_MISSING'
              else 'EXISTS' end,
         'approx_rows=' || coalesce(s.n_live_tup::text, 'N/A')
  from (values
    ('students'),('attendance'),('test_results'),('profiles'),('account_requests')
  ) as t(tbl)
  left join pg_stat_user_tables s
    on s.schemaname='public' and s.relname=t.tbl

  union all

  -- -----------------------------------------------------------------------
  -- Section 13: Row counts (approximate from pg_stat)
  -- -----------------------------------------------------------------------
  select '13.ROWCOUNT'::text,
         t.tbl,
         case when to_regclass('public.' || t.tbl) is null then 'TABLE_MISSING'
              else 'EXISTS' end,
         'approx_rows=' || coalesce(s.n_live_tup::text, '0')
  from (values
    ('institutions'),('profiles'),('students'),('attendance'),('tests'),
    ('test_results'),('sessions'),('coach_notes'),('audit_log'),('account_requests'),
    ('barme_versions'),('injuries'),('measurements'),('infrastructure'),('import_batches'),
    ('undo_batches'),('outbox'),('conflicts'),('quarantine')
  ) as t(tbl)
  left join pg_stat_user_tables s
    on s.schemaname='public' and s.relname=t.tbl

) AS unified
order by section, object_name;

-- ============================================================================
-- SUPPLEMENTAL: Exact duplicate checks (DO blocks — results in Messages tab)
-- These use dynamic EXECUTE so they never fail on missing tables.
-- ============================================================================

do $$ declare r record; begin
  if to_regclass('public.students') is null then
    raise notice 'DUP students: TABLE_MISSING';
  else
    for r in select institution_id, student_code, count(*) as c from public.students group by institution_id, student_code having count(*)>1 loop
      raise notice 'DUP students: inst=% code=% count=%', r.institution_id, r.student_code, r.c;
    end loop;
    raise notice 'DUP students: check complete';
  end if;
end $$;

do $$ declare r record; begin
  if to_regclass('public.attendance') is null then
    raise notice 'DUP attendance: TABLE_MISSING';
  else
    for r in select student_id, attendance_date, record_type, count(*) as c from public.attendance group by student_id, attendance_date, record_type having count(*)>1 loop
      raise notice 'DUP attendance: student=% date=% type=% count=%', r.student_id, r.attendance_date, r.record_type, r.c;
    end loop;
    raise notice 'DUP attendance: check complete';
  end if;
end $$;

do $$ declare r record; begin
  if to_regclass('public.test_results') is null then
    raise notice 'DUP test_results: TABLE_MISSING';
  elseif not exists (select 1 from information_schema.columns where table_schema='public' and table_name='test_results' and column_name='result_date') then
    raise notice 'DUP test_results: result_date column MISSING';
  else
    for r in select institution_id, student_id, test_id, result_date, count(*) as c from public.test_results group by institution_id, student_id, test_id, result_date having count(*)>1 loop
      raise notice 'DUP test_results: inst=% student=% test=% date=% count=%', r.institution_id, r.student_id, r.test_id, r.result_date, r.c;
    end loop;
    raise notice 'DUP test_results: check complete';
  end if;
end $$;

do $$ declare c bigint; begin
  if to_regclass('public.profiles') is null then
    raise notice 'profiles: TABLE_MISSING';
  else
    select count(*) into c from public.profiles where role='platform_owner';
    raise notice 'profiles: platform_owner count = %', c;
  end if;
end $$;

do $$ declare r record; begin
  if to_regclass('public.account_requests') is null then
    raise notice 'account_requests: TABLE_MISSING';
  else
    for r in select user_id, count(*) as c from public.account_requests where status='pending' group by user_id having count(*)>1 loop
      raise notice 'DUP account_requests: user=% count=%', r.user_id, r.c;
    end loop;
    raise notice 'account_requests: duplicate check complete';
  end if;
end $$;

-- ============================================================================
-- END OF PREFLIGHT (READ-ONLY)
-- ============================================================================