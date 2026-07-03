/**
 * Workload model interfaces
 *
 * Covers the workload matrix (hours per assignee per period), per-work-item
 * hour estimates, and parent-issue rollups (hours/progress/due-date rolled
 * up from a work item's countable sub-items).
 *
 * Rollup semantics (fork `plane/workload/rollup.py`):
 * - A rollup is computed over the FULL descendant tree (depth cap 10 per
 *   root), traversed via a recursive CTE.
 * - A descendant is "countable" when it is not soft-deleted, not archived,
 *   not a draft, and its state group is NOT `cancelled` or `triage`. A
 *   non-countable node prunes its entire subtree.
 * - `hours` / `done_hours` are summed from countable LEAF work items only
 *   (a leaf = a countable descendant with no countable children) that have
 *   an hours estimate > 0. `done_hours` is the subset of those leaves whose
 *   state group is `completed`.
 * - `percent` = round(done_hours / hours, 4), or `null` when `hours` is 0.
 * - `due_date` = the max `target_date` over ALL countable descendants
 *   (leaves AND intermediate nodes) — intentionally a wider set than the
 *   hours rollup, which is leaf-only.
 * - `leaf_count` = number of countable leaves with an hours estimate > 0.
 */

export type WorkloadGranularity = "day" | "week" | "month";

export type StateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled" | "triage";

/** Maximum hours accepted by a single work item estimate (server-enforced). */
export const MAX_WORKLOAD_ESTIMATE_HOURS = 10000;

/**
 * Params for the workload matrix endpoints (workspace- and project-scoped).
 * `project_ids` / `assignee_ids` / `state_group` are provided as arrays and
 * serialized to comma-separated query values by the SDK.
 */
export interface GetWorkloadParams {
  granularity: WorkloadGranularity;
  /** ISO date (YYYY-MM-DD), inclusive range start. */
  date_from: string;
  /** ISO date (YYYY-MM-DD), inclusive range end. */
  date_to: string;
  project_ids?: string[];
  assignee_ids?: string[];
  /** Defaults (when omitted) exclude `completed` and `cancelled` state groups. */
  state_group?: StateGroup[];
}

export interface WorkloadMatrixRow {
  assignee_id: string | null;
  assignee_name: string;
  /** Period key (matches a value in `WorkloadMatrix.periods`) -> hours. */
  buckets: Record<string, number>;
  total: number;
}

export interface WorkloadUnscheduledEntry {
  assignee_id: string | null;
  hours: number;
}

export interface WorkloadMatrixMeta {
  issues_counted: number;
  issues_unscheduled: number;
  dirty_date_count: number;
  zero_estimate_count: number;
  unscheduled_ratio: number;
  truncated: boolean;
}

/**
 * Workload matrix response. Counts LEAF work items only — parents with
 * countable sub-items never appear as rows here (their totals live in the
 * rollup endpoints instead). Default state filter excludes `completed` and
 * `cancelled` groups unless `state_group` is explicitly provided.
 */
export interface WorkloadMatrix {
  granularity: WorkloadGranularity;
  date_from: string;
  date_to: string;
  periods: string[];
  rows: WorkloadMatrixRow[];
  unscheduled: WorkloadUnscheduledEntry[];
  meta: WorkloadMatrixMeta;
}

/** Rollup rolled up from a work item's countable sub-items. */
export interface WorkloadRollup {
  hours: number;
  done_hours: number;
  /** 0..1, rounded to 4 decimals; `null` when `hours` is 0. */
  percent: number | null;
  /** ISO date, or `null` when no countable descendant has a target date. */
  due_date: string | null;
  leaf_count: number;
}

/** Stored fields shared by both the GET and PUT work-item estimate responses. */
export interface WorkloadEstimateBase {
  id?: string;
  issue?: string;
  hours: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * `GET .../workload-estimate/` response.
 *
 * For a PARENT work item (>= 1 countable sub-item): `hours` is always
 * `null` (any legacy stored estimate is never surfaced), `is_parent` is
 * `true`, and `rollup` is populated. For a leaf work item: `hours` is the
 * stored estimate (or `null` if none has been set), `is_parent` is `false`,
 * and `rollup` is absent.
 */
export interface WorkloadEstimate extends WorkloadEstimateBase {
  is_parent: boolean;
  rollup?: WorkloadRollup;
}

/**
 * `PUT .../workload-estimate/` response.
 *
 * Unlike the GET response, this does NOT include `is_parent` or `rollup` —
 * a successful PUT is only ever reachable on a leaf work item (a PUT
 * against a parent throws {@link WorkloadParentHasChildrenError} instead),
 * so the caller already knows the answer.
 */
export type WorkloadEstimateWrite = WorkloadEstimateBase;

/** Body for `PUT .../workload-estimate/`. `hours` must be in `0..MAX_WORKLOAD_ESTIMATE_HOURS`. */
export interface UpdateWorkloadEstimate {
  hours: number;
}

/** `{ <workItemId>: hours }` — parent work item ids are always omitted. */
export type WorkloadEstimatesBulkResponse = Record<string, number>;

/** `{ <workItemId>: rollup }` — only parent work item ids are present; leaf ids are omitted. */
export type WorkloadRollupsBulkResponse = Record<string, WorkloadRollup>;
