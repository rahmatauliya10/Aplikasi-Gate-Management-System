-- ==============================================================================
-- GMS Existing Database Role & Ownership Reconciliation (P0-02 -> P0-08)
-- ==============================================================================
-- Safely normalizes roles, reassigns GMS application object ownership to gms_owner,
-- revokes schema CREATE from gms_app/PUBLIC, and sets gms_owner default privileges.
-- ==============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_user text := COALESCE(nullif(current_setting('gms.owner_user', true), ''), 'gms_owner');
  owner_pass text := nullif(current_setting('gms.owner_password', true), '');
  app_user text := COALESCE(nullif(current_setting('gms.app_user', true), ''), 'gms_app');
  app_pass text := nullif(current_setting('gms.app_password', true), '');
  backup_user text := COALESCE(nullif(current_setting('gms.backup_user', true), ''), 'gms_backup');
  backup_pass text := nullif(current_setting('gms.backup_password', true), '');
  restore_user text := COALESCE(nullif(current_setting('gms.restore_user', true), ''), 'restore_operator');
  restore_pass text := nullif(current_setting('gms.restore_password', true), '');

  r record;
BEGIN
  -- 1. Create or normalize gms_owner
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = owner_user) THEN
    IF owner_pass IS NULL THEN
      RAISE EXCEPTION 'gms.owner_password is required to create %', owner_user;
    END IF;
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', owner_user, owner_pass);
  ELSE
    IF owner_pass IS NOT NULL THEN
      EXECUTE format('ALTER ROLE %I WITH PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', owner_user, owner_pass);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', owner_user);
    END IF;
  END IF;

  -- 2. Create or normalize gms_app
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = app_user) THEN
    IF app_pass IS NULL THEN
      RAISE EXCEPTION 'gms.app_password is required to create %', app_user;
    END IF;
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', app_user, app_pass);
  ELSE
    IF app_pass IS NOT NULL THEN
      EXECUTE format('ALTER ROLE %I WITH PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', app_user, app_pass);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', app_user);
    END IF;
  END IF;

  -- 3. Create or normalize gms_backup
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = backup_user) THEN
    IF backup_pass IS NULL THEN
      RAISE EXCEPTION 'gms.backup_password is required to create %', backup_user;
    END IF;
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', backup_user, backup_pass);
  ELSE
    IF backup_pass IS NOT NULL THEN
      EXECUTE format('ALTER ROLE %I WITH PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', backup_user, backup_pass);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', backup_user);
    END IF;
  END IF;

  -- 4. Create or normalize restore_operator
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = restore_user) THEN
    IF restore_pass IS NULL THEN
      RAISE EXCEPTION 'gms.restore_password is required to create %', restore_user;
    END IF;
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', restore_user, restore_pass);
  ELSE
    IF restore_pass IS NOT NULL THEN
      EXECUTE format('ALTER ROLE %I WITH PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', restore_user, restore_pass);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', restore_user);
    END IF;
  END IF;

  -- 5. Revoke unexpected role memberships from gms_app, gms_backup, gms_owner
  FOR r IN (
    SELECT member_role.rolname AS member_name, granted_role.rolname AS granted_name
    FROM pg_auth_members m
    JOIN pg_roles member_role ON member_role.oid = m.member
    JOIN pg_roles granted_role ON granted_role.oid = m.roleid
    WHERE member_role.rolname IN (owner_user, app_user, backup_user, restore_user)
  ) LOOP
    EXECUTE format('REVOKE %I FROM %I', r.granted_name, r.member_name);
    RAISE NOTICE 'Revoked unexpected membership % from %', r.granted_name, r.member_name;
  END LOOP;

  -- 6. Transfer Ownership of Tables (relkind = 'r')
  FOR r IN (
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I', r.relname, owner_user);
  END LOOP;

  -- 7. Transfer Ownership of Sequences (relkind = 'S')
  FOR r IN (
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
  ) LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO %I', r.relname, owner_user);
  END LOOP;

  -- 8. Transfer Ownership of Views (relkind = 'v')
  FOR r IN (
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
  ) LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO %I', r.relname, owner_user);
  END LOOP;

  -- 9. Transfer Ownership of Materialized Views (relkind = 'm')
  FOR r IN (
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'm'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
  ) LOOP
    EXECUTE format('ALTER MATERIALIZED VIEW public.%I OWNER TO %I', r.relname, owner_user);
  END LOOP;

  -- 10. Transfer Ownership of Custom Enums / Composite Types
  FOR r IN (
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    LEFT JOIN pg_class tc ON tc.oid = t.typrelid
    WHERE n.nspname = 'public'
      AND (
        t.typtype = 'e'
        OR (t.typtype = 'c' AND tc.relkind = 'c')
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
      )
  ) LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO %I', r.typname, owner_user);
  END LOOP;

  -- 11. Schema Permissions: Revoke CREATE from PUBLIC, app, backup; Grant to owner
  EXECUTE format('REVOKE ALL ON SCHEMA public FROM PUBLIC');
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM PUBLIC, %I, %I', app_user, backup_user);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', owner_user);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I, %I', app_user, backup_user);
  EXECUTE format('GRANT ALL ON SCHEMA public TO %I', restore_user);

  -- 12. DML Permissions on All Existing Tables and Sequences
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app_user);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_user);

  EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', backup_user);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', backup_user);

  -- 13. Set Default Privileges FOR ROLE gms_owner
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', owner_user, app_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', owner_user, app_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO %I', owner_user, backup_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', owner_user, backup_user);

  -- 14. Explicitly revoke UPDATE and DELETE on immutable audit and history tables for gms_app
  FOR r IN (
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('ActivityLog', 'TransactionCorrection', 'TransactionCorrectionItem', 'TransactionStatusHistory')
  ) LOOP
    EXECUTE format('REVOKE UPDATE, DELETE ON TABLE public.%I FROM %I', r.tablename, app_user);
  END LOOP;

  RAISE NOTICE 'Database roles, ownership, and privileges reconciled successfully for %', current_database();
END $$;
