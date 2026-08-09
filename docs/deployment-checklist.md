# GMS Production Deployment Checklist

## Pre-Deployment Requirements

### 1. Migration Checksum Reconciliation (P0-01 — BLOCKING)

Before running `prisma migrate deploy` on any database that has **previously been deployed**, you MUST run the checksum reconciliation script:

```bash
DATABASE_URL="postgresql://<user>:<pass>@<host>:<port>/<dbname>" \
  npx ts-node scripts/check-migration-checksums.ts
```

**Expected output (all green):**
```
✅ 20260714030729_init
✅ 20260715000000_add_account_password_security
✅ 20260715031355_sync_indices
✅ 20260715034029_add_user_is_deleted
✅ 20260715150000_add_user_profile_fields
✅ 20260716041815_add_system_issue
✅ 20260804170000_add_unique_constraints_and_corrections
✅ 20260806000000_add_revision_and_correction_items
✅ 20260807000000_repair_correction_enums_and_constraints
✅ 20260808000000_add_missing_columns_to_warehouse_and_incoming
✅ 20260809000000_reconcile_correction_enum_and_history
✅ 20260810000000_add_versioning_fields

--- Summary ---
✅ All migration checksums match. Safe to deploy.
```

**If ANY ❌ appears:**

- **DO NOT** run `prisma migrate deploy`
- **DO NOT** run `prisma migrate reset` or `prisma db push --force-reset`
- Contact the audit team for reconciliation guidance
- Save the full script output as deployment evidence

**Critical migration to verify:**
- `20260806000000_add_revision_and_correction_items` — this migration has had content changes across repository history (SHA `cdde2ed` → `d4fc484`). If the database was deployed with the older version, the checksum will not match.

### 2. Save Output as Evidence

Save the reconciliation output to a file:

```bash
DATABASE_URL="..." npx ts-node scripts/check-migration-checksums.ts > migration-checksum-evidence-$(date +%Y%m%d).txt 2>&1
```

This file must be archived alongside the deployment record.

### 3. CI Status

- [ ] GitHub Actions CI run is **green** on the exact SHA being deployed
- [ ] Both `fresh` and `upgraded` database matrix variants passed
- [ ] Migration checksum verification step passed in CI

### 4. Database Backup

- [ ] Pre-deployment backup created (`MANUAL_PRE_UPDATE` type)
- [ ] Backup manifest shows `localStatus: VERIFIED`
- [ ] Backup checksum recorded

---

## Deployment Steps

1. Run migration checksum reconciliation → save output
2. Create pre-deployment backup
3. Run `npx prisma migrate deploy`
4. Verify application starts successfully
5. Run smoke tests on critical paths:
   - Gate check-in
   - QC vehicle check
   - Warehouse start/complete
   - Correction submission
   - Reports view

---

## Post-Deployment Verification

- [ ] No `P2002` (unique constraint) errors in logs
- [ ] No `P2003` (foreign key) errors in logs
- [ ] Dashboard loads within acceptable time
- [ ] Correction modal preserves `initialMoisture` in checklistItems

---

## Rollback Procedure

If deployment fails:

1. **DO NOT** run `prisma migrate reset`
2. Restore from pre-deployment backup using `scripts/run-actual-restore-drill.ps1`
3. Revert application code to previous SHA
4. Restart application
