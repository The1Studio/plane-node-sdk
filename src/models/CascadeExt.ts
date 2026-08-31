import { GroupEnum } from "./State";

/**
 * Module-cascade model interfaces
 *
 * Bindings for the fork's `cascade_ext` app (`feat/module-cascade-terminal-status`),
 * which exposes module-level cascade preview/apply routes mounted at
 * `/api/cascade-ext/` (OUTSIDE the `/api/v1` prefix).
 *
 * Cascade semantics (fork `plane/cascade_ext/`):
 * - A module-cascade is a PENDING module-status change (`completed`/`cancelled`)
 *   that is applied to every eligible live work item in the module tree.
 * - Preview (`GET .../module-cascade-preview/`) does NOT mutate anything: it
 *   dry-runs the eligibility pass and returns the item set.
 * - Apply (`POST .../cascade-apply/`) performs the status change. A work item
 *   already in a terminal group PRUNES its whole subtree instead of being
 *   traversed through — a live sub-item under a terminal ancestor is LEFT
 *   live, surfaced as a rejected item with reason `under_terminal_ancestor`.
 */

/** Module statuses that a module cascade may target. */
export type CascadeModuleStatus = "completed" | "cancelled";

/**
 * Why an individual work item was excluded from (or rejected for) a module
 * cascade. `null` (preview only) means the item IS eligible for the cascade.
 */
export type CascadePreviewItemReason = null | "no_matching_state" | "no_permission";

/** Why a work item was rejected by `cascade-apply`. */
export type CascadeApplyRejectionReason =
  | "no_matching_state"
  | "no_permission"
  | "already_terminal"
  | "under_terminal_ancestor"
  | "not_in_module_tree"
  | "not_eligible";

/** Server-side cap on cascaded work items; overshooting is a refusal, not a truncation. */
export const MAX_MODULE_CASCADE_ITEMS = 100;

/**
 * One work item considered by a module cascade (preview response only).
 * `why` (named `reason` in the wire payload) is `null` exactly when
 * `eligible` is `true`.
 */
export interface ModuleCascadePreviewItem {
  id: string;
  identifier: string;
  name: string;
  /** Number of edges from the root work item of the module tree (root = 0). */
  depth: number;
  is_module_member: boolean;
  project_id: string;
  project_name: string;
  state_id: string;
  state_name: string;
  /** Current state group of the item; e.g. `backlog`, `unstarted`, `started`. */
  state_group: GroupEnum;
  /** State the cascade would move the item to (within the target state group). */
  target_state_id: string | null;
  eligible: boolean;
  reason: CascadePreviewItemReason;
}

/** Bucketed counts for a module-cascade preview. */
export interface ModuleCascadePreviewSummary {
  /** Live (non-archived) work items in the module tree. */
  total_live: number;
  eligible: number;
  ineligible: number;
  /** Live items already in a terminal state group (`completed`/`cancelled`). */
  already_terminal: number;
}

/**
 * `GET .../modules/<module_id>/cascade-preview/?status=<...>` response.
 *
 * Over the cap (`total_live > MAX_MODULE_CASCADE_ITEMS`), `over_cap` is `true`
 * and `items` is EMPTY — the real count stays in `summary.total_live`.
 */
export interface ModuleCascadePreviewResponse {
  /** The module status the cascade would apply. */
  target_group: CascadeModuleStatus;
  depth_capped: boolean;
  over_cap: boolean;
  cap: number;
  summary: ModuleCascadePreviewSummary;
  items: ModuleCascadePreviewItem[];
}

/** Body for `POST .../modules/<module_id>/cascade-apply/`. */
export interface ModuleCascadeApplyRequest {
  /** The module status to apply. Must be `completed` or `cancelled`. */
  status: CascadeModuleStatus;
  /**
   * Work items to cascade. Omitted or `null` = every eligible item; `[]` = none.
   */
  item_ids?: string[] | null;
}

/** A work item rejected by `cascade-apply`. */
export interface ModuleCascadeApplyRejection {
  id: string;
  reason: CascadeApplyRejectionReason;
}

/**
 * `POST .../modules/<module_id>/cascade-apply/` response.
 *
 * On a successful apply, `updated` holds the ids of the work items that were
 * actually moved, and `rejected` explains each item the server declined.
 */
export interface ModuleCascadeApplyResponse {
  /** The module as it was left after the cascade applied. */
  module: unknown;
  status: CascadeModuleStatus;
  updated: string[];
  rejected: ModuleCascadeApplyRejection[];
}

/**
 * The 400 (or archived-module refusal) body returned when a module cascade
 * cannot run. `error` is the human-readable message; `cap`/`total_live` are
 * present only on the over-cap refusal.
 */
export interface ModuleCascadeErrorBody {
  error: string;
  cap?: number;
  total_live?: number;
  error_code?: string;
}