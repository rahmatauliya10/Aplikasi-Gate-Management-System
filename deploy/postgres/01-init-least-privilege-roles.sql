-- ==============================================================================
-- GMS Database Least Privilege Role Initialization (TASK 6 / P1 HIGH)
-- ==============================================================================
-- Separates administrative PostgreSQL superuser from application runtime.
-- Roles:
-- 1. gms_owner       : Schema & Migration DDL Owner
-- 2. gms_app         : Application Runtime (SELECT, INSERT, UPDATE, DELETE)
-- 3. gms_backup      : Backup Operator (pg_dump read access)
-- 4. restore_operator: Isolated Restore Operator
-- ==============================================================================

-- Create gms_owner role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gms_owner') THEN
    CREATE ROLE gms_owner WITH LOGIN PASSWORD 'gms_owner_secure_pass_12345' CREATEDB;
  END IF;
END $$;

-- Create gms_app role (Used by NestJS runtime DATABASE_URL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gms_app') THEN
    CREATE ROLE gms_app WITH LOGIN PASSWORD 'gms_app_secure_pass_12345' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Create gms_backup role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gms_backup') THEN
    CREATE ROLE gms_backup WITH LOGIN PASSWORD 'gms_backup_secure_pass_12345' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Create restore_operator role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'restore_operator') THEN
    CREATE ROLE restore_operator WITH LOGIN PASSWORD 'restore_operator_secure_pass_12345' CREATEDB;
  END IF;
END $$;

-- Grant schema privileges on public schema
GRANT ALL ON SCHEMA public TO gms_owner;
GRANT USAGE ON SCHEMA public TO gms_app;
GRANT USAGE ON SCHEMA public TO gms_backup;
GRANT ALL ON SCHEMA public TO restore_operator;

-- Grant DML privileges on all tables to gms_app
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gms_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO gms_app;

-- Grant read privileges to gms_backup
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gms_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO gms_backup;

-- Set default privileges for future tables created by migrations
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO gms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO gms_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO gms_backup;
