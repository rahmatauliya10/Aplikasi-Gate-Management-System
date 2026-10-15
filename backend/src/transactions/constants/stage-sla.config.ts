/**
 * GMS Operational Stage SLA Configuration (P0 Hardening)
 *
 * Defines stage-specific Service Level Agreements (SLAs) for transaction processing.
 *
 * Business Rules:
 * 1. SLA thresholds MUST be explicitly approved per stage/process.
 * 2. If NO official SLA has been established for a stage, getStageSlaMinutes returns null.
 * 3. Unapproved/unspecified stages MUST NOT be labeled OVERDUE based on assumptions.
 * 4. Configurable via environment variables:
 *    - GMS_STAGE_SLA_JSON: JSON object mapping stage/status to minutes (e.g. {"WEIGH_IN_DONE": 45})
 *    - GMS_DEFAULT_SLA_MINUTES: Optional fallback SLA (default: undefined/null)
 */

export interface StageSlaConfig {
  [statusOrStage: string]: number; // threshold in minutes
}

/**
 * Approved default SLA limits per stage (in minutes).
 * Only stages with officially agreed operational SLAs are listed here.
 * If a status is not listed here and no env override exists, SLA is undefined (null),
 * meaning the system tracks duration without asserting an unverified OVERDUE condition.
 */
export const APPROVED_STAGE_SLA_MINUTES: StageSlaConfig = {
  // Security Gate-In to Weighbridge Gross In
  REGISTERED: 30,

  // Weighbridge In Done to QC Inspection
  WEIGH_IN_DONE: 45,

  // QC Pending Inspection
  QC_VEHICLE_PENDING: 60,
  QC_RETEST_REQUIRED: 45,
  INCOMING_CHECK_PENDING: 60,

  // Warehouse Loading / Unloading Operations
  QC_VEHICLE_PASSED: 60,
  PA_NOT_REQUIRED: 60,
  WAITING_GSP_DISPOSITION: 90,
  WAITING_GSP_CHECKLIST_DISPOSITION: 90,
  WAREHOUSE_IN_PROGRESS: 120,

  // Weighbridge Out
  WAREHOUSE_DONE: 30,
  INCOMING_CHECK_PASSED: 30,

  // Security Gate Out
  WEIGH_OUT_DONE: 20,
  QC_VEHICLE_REJECTED: 30,
};

/**
 * Returns the configured SLA threshold in minutes for a given status and process type.
 * Returns null if no official SLA threshold is active.
 *
 * Priority:
 * 1. Process-specific override from GMS_STAGE_SLA_JSON (e.g. "GSP_WAITING_GSP_DISPOSITION")
 * 2. Stage-specific override from GMS_STAGE_SLA_JSON (e.g. "WAITING_GSP_DISPOSITION")
 * 3. Process-specific entry in APPROVED_STAGE_SLA_MINUTES (e.g. "GSP_WAITING_GSP_DISPOSITION")
 * 4. Standard entry in APPROVED_STAGE_SLA_MINUTES (e.g. "WAITING_GSP_DISPOSITION")
 * 5. Environment fallback GMS_DEFAULT_SLA_MINUTES (if explicitly set)
 * 6. null (no official SLA -> do not assume overdue)
 */
export function getStageSlaMinutes(
  status: string,
  processType?: string,
): number | null {
  // Check environment JSON overrides if provided
  if (process.env.GMS_STAGE_SLA_JSON) {
    try {
      const envConfig: StageSlaConfig = JSON.parse(
        process.env.GMS_STAGE_SLA_JSON,
      );
      if (processType && envConfig[`${processType}_${status}`] !== undefined) {
        return envConfig[`${processType}_${status}`];
      }
      if (envConfig[status] !== undefined) {
        return envConfig[status];
      }
    } catch {
      // Ignore JSON parse errors, fall back to approved defaults
    }
  }

  // Check process-specific approved SLA
  if (
    processType &&
    APPROVED_STAGE_SLA_MINUTES[`${processType}_${status}`] !== undefined
  ) {
    return APPROVED_STAGE_SLA_MINUTES[`${processType}_${status}`];
  }

  // Check stage-specific approved SLA
  if (APPROVED_STAGE_SLA_MINUTES[status] !== undefined) {
    return APPROVED_STAGE_SLA_MINUTES[status];
  }

  // Check optional default SLA from env if explicitly configured
  if (process.env.GMS_DEFAULT_SLA_MINUTES) {
    const parsed = parseInt(process.env.GMS_DEFAULT_SLA_MINUTES, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // No official SLA configured for this stage
  return null;
}
