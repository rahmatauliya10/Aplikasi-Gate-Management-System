-- Migration: 20260811010000_fix_atomic_workflow_state_machine
-- Description: Add composite index for atomic Compare-And-Swap (CAS) transaction status updates and revision checks.

-- 1. Create composite index on (id, status, revision) for high-performance CAS updates
CREATE INDEX IF NOT EXISTS "idx_transaction_cas_status_revision" 
ON "Transaction" ("id", "status", "revision");
