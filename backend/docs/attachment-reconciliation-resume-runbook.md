# Attachment reconciliation resume runbook

## Scope and safety

This procedure applies only to a quarantine execution that has a valid versioned manifest and a matching `ATTACHMENT_RECONCILE_INTENT` audit record. It never performs permanent purge, deletes transaction history, or automatically registers legacy quarantine files. Historical attachment access remains read-only.

Do not run this procedure against a production filesystem or database without a separately approved maintenance window, disposable rehearsal, and operator authorization. A stale lock is fail-closed: do not delete or replace it until the owner and maintenance state have been independently verified.

## Preconditions

1. Confirm the execution ID matches `reconcile-<13-digit timestamp>-<5–32 lowercase alphanumeric suffix>` (the CLI form may use the `cli-` prefix).
2. Confirm `quarantine/<executionId>/manifest.json` exists under the configured upload root.
3. Confirm the manifest inventory hash validates and the original intent audit binds the same execution ID, inventory hash, `ATTACHMENT_RECONCILE` module, and quarantine mode.
4. Confirm the operator is an authenticated `ADMIN` and has an approved reason for resuming.
5. Confirm no other maintenance lock is active. Never bypass the lock with a production fallback.

## Resume procedure

1. Review the manifest and audit record without editing either file.
2. Call `POST /api/attachments/reconcile/resume/<executionId>` with an authenticated administrator session, or use an approved equivalent control-plane procedure.
3. The service acquires the owner-bound maintenance lock before reading the manifest, validates the original intent binding, and rechecks all attachment, correction-evidence, and system-issue references immediately before each quarantine move.
4. If a reference appears, the source is retained and the manifest records `CONFLICT`; do not override the conflict based only on a prior scan.
5. If the operation remains `PARTIAL` or `auditPending`, preserve the manifest and audit evidence and investigate the recorded per-file errors before retrying.
6. A successful response requires `state=COMPLETED` and `auditPending=false`. Verify the outcome audit record before reporting completion.

## Lock handling

The lock contains an owner token, process ID, and creation time. Release is owner-safe and idempotent. If the lock is present, the system reports an active/stale-lock condition and does not remove it automatically. Escalate stale locks to the designated operator; after independent verification, use the approved operational lock-recovery procedure and record the decision in the maintenance evidence.

## Evidence to retain

- execution ID, actor, reason, and inventory hash;
- pre-resume and post-resume manifest copies with timestamps;
- intent, resume-intent, per-file outcome, and final audit identifiers;
- conflicts, source/destination fingerprints, and any query or filesystem errors;
- lock owner verification and operator approval;
- test environment, command, result, and any skipped PostgreSQL, UAT, topology, or DR evidence.

## Known limits

A filesystem operation and its database audit are not one atomic transaction. Hard-link publication is no-overwrite and fails closed for unsupported cross-filesystem operations, but crash/power-loss behavior and Windows directory durability require environment-specific rehearsal evidence. Legacy quarantine directories without a validated manifest remain untouched.

## Completion gate

Do not claim the storage lifecycle is fully verified until real-filesystem interruption/resume, collision, symlink/reparse, permission, EXDEV, reference-race, audit retry, and Windows-supported evidence are recorded. Unit tests alone do not constitute production recovery or DR evidence.

## Rollback boundary

There is no automatic overwrite rollback. If a destination collision or identity mismatch occurs, retain both names, preserve the manifest, and escalate for review. Do not manually delete, rename, or restore evidence outside the approved control-plane procedure.

## Business and production gates

Business KPI thresholds, SLA applicability, release sign-off, PostgreSQL concurrency evidence, trusted-proxy topology, browser/UAT evidence, DR drills, deployment, migration, purge, and production restore remain separate gates and are not satisfied by this runbook or its tests.

**Last reviewed:** 2026-10-19

**Owner:** GMS platform/operations owner (assign before operational use)

**Approval:** Separate operational approval required before use outside disposable test environments.

## References

- `backend/scripts/attachment-recovery.js`
- `backend/scripts/reconcile-attachments.js`
- `backend/src/attachments/attachments.service.ts`
- `backend/src/attachments/attachments.controller.ts`
- `backend/test/attachment-recovery.spec.ts`

## Change record

| Date | Change | Evidence |
| --- | --- | --- |
| 2026-10-19 | Added owner-safe lock release, resumable manifest validation, reference revalidation hook, and resume endpoint contract. | Targeted Jest/build checks; production and PostgreSQL evidence intentionally not run. |

## Operator checklist

- [ ] Disposable or approved non-production environment confirmed
- [ ] Execution ID and manifest validated
- [ ] Intent audit binding validated
- [ ] Admin identity and reason recorded
- [ ] Lock ownership/staleness reviewed
- [ ] Reference revalidation enabled
- [ ] Resume outcome audit confirmed
- [ ] Conflicts/errors escalated
- [ ] No permanent purge performed
- [ ] Evidence bundle stored
- [ ] Production/DR/UAT claims kept separate

**Never use this document as authorization for a production restore, purge, migration, or deployment.**

