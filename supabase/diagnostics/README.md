# Production Preflight — Read-Only Diagnostics

## Usage
1. Open Supabase Dashboard → SQL Editor.
2. Paste the contents of `PRODUCTION_PREFLIGHT.sql`.
3. Run (SELECT only; no changes to data).
4. Copy the full result output and send it for review.

## What it checks
- Tables present vs expected (base + migration).
- Columns, types, nullability, defaults.
- PKs, FKs, UNIQUE, CHECK constraints.
- RLS enabled/forced + policy definitions.
- Functions + EXECUTE grants.
- Triggers.
- Duplicate data that could block new constraints.
- Key columns: raw_value, result_date, record_type, institution_id, role, status.
- Row counts (no personal data).

## Notes
- This file performs **no writes**. Safe to run on production.
- Do **not** share the output publicly if it contains schema details you consider sensitive (it contains no secrets or personal data).