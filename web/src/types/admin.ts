/**
 * @file admin.ts
 * @description Tipos del panel de administración del dataset: estado de la base
 * y resultado de un reset, tal como los expone `api/src/routes/admin.ts`.
 */

export type SeedProfile = "reference" | "demo";

/** Motivo por el que el reset está bloqueado; `null` cuando está disponible. */
export type DbResetReason = "disabled" | "missing_token" | null;

export interface DbStatus {
  enabled: boolean;
  reason: DbResetReason;
  profiles: SeedProfile[];
  counts: Record<string, number>;
  policy_version: string;
}

export interface ResetResult {
  profile: SeedProfile;
  counts: Record<string, number>;
  verdicts: Record<string, string>;
  approvals_pending: number;
  deleted_files: string[];
  cleared_uploads: number;
  duration_ms: number;
}
