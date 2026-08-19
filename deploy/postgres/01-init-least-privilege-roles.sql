-- ==============================================================================
-- GMS Database Least Privilege Role Initialization (P0 HIGH - ASVS L2 / SSDF)
-- ==============================================================================
-- Separates administrative PostgreSQL superuser from application runtime.
-- Roles:
-- 1. gms_owner       : Schema & Migration DDL Owner (NOSUPERUSER, NOCREATEDB)
-- 2. gms_app         : Application Runtime (SELECT, INSERT, UPDATE, DELETE)
-- 3. gms_backup      : Backup Operator (pg_dump read-only access)
-- 4. restore_operator: Isolated Restore Operator
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
      RAISE EXCEPTION 'gms.owner_password is required to initialize %', owner_user;
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
      RAISE EXCEPTION 'gms.app_password is required to initialize %', app_user;
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
      RAISE EXCEPTION 'gms.backup_password is required to initialize %', backup_user;
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
      RAISE EXCEPTION 'gms.restore_password is required to initialize %', restore_user;
    END IF;
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', restore_user, restore_pass);
  ELSE
    IF restore_pass IS NOT NULL THEN
      EXECUTE format('ALTER ROLE %I WITH PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', restore_user, restore_pass);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', restore_user);
    END IF;
  END IF;

  -- 5. Revoke schema creation from PUBLIC, app, and backup
  EXECUTE format('REVOKE ALL ON SCHEMA public FROM PUBLIC');
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM PUBLIC, %I, %I', app_user, backup_user);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', owner_user);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I, %I', app_user, backup_user);
  EXECUTE format('GRANT ALL ON SCHEMA public TO %I', restore_user);

  -- 6. Initial object privileges
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app_user);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_user);

  EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', backup_user);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', backup_user);

  -- 7. Set default privileges explicitly FOR ROLE gms_owner
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', owner_user, app_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', owner_user, app_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO %I', owner_user, backup_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', owner_user, backup_user);

  -- 8. Explicitly revoke UPDATE and DELETE on immutable audit and history tables for gms_app
  FOR r IN (
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('ActivityLog', 'TransactionCorrection', 'TransactionCorrectionItem', 'TransactionStatusHistory')
  ) LOOP
    EXECUTE format('REVOKE UPDATE, DELETE ON TABLE public.%I FROM %I', r.tablename, app_user);
  END LOOP;
END $$;
