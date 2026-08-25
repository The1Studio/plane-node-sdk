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
  /**
   * When omitted, EVERY state group is returned — including `completed` and
   * `cancelled`. An earlier version of this comment claimed the two were
   * excluded by default; the server has no such `else` branch, and silently
   * applying a filter the caller could neither see nor clear was the bug that
   * removed it.
   */
  state_group?: StateGroup[];
}

/** One work item on an assignee's row. */
export interface WorkloadTask {
  id: string;
  /** Owning project — required to build a work-item link. */
  project_id: string;
  /** `"<PROJECT>-<sequence_id>"`, e.g. `"ENG-42"`. */
  identifier: string;
  name: string;
  /**
   * THIS assignee's share of the work item's estimate, not the whole
   * estimate: a work item may carry several assignees and its hours are split
   * evenly across them, so a shared 8h item reports 4h on each of two rows.
   * `total_hours` keeps the undivided figure.
   */
  hours: number;
  total_hours: number;
  assignee_count: number;
  start_date: string | null;
  target_date: string | null;
  state_group: StateGroup;
  /** Normalised to `""` rather than null when the state has no name. */
  state_name: string;
  /**
   * The state's own colour. A FREE-FORM CSS colour string, not a guaranteed
   * hex — server-side it is an unvalidated CharField, so `""`, `"#fa0"`,
   * `"rgb(...)"` and named colours are all reachable. Do not parse it, and do
   * not assume it is non-empty.
   */
  state_color: string;
  /**
   * True when the work item has no estimate row, or one with `hours <= 0`.
   * Such an item carries `hours: 0` and `total_hours: 0` and contributes to
   * NO capacity figure — every bucket and total on the row is identical to a
   * response without it.
   *
   * **Do not infer this from `hours === 0`.** A stored zero-hour estimate is
   * a real, reachable state (counted separately in
   * `WorkloadMatrixMeta.zero_estimate_count`), so the arithmetic test
   * misclassifies it. Always present; an estimated row carries `false`.
   */
  unestimated: boolean;
  /** `target_date` is in the past and the item is not in a terminal state. */
  overdue: boolean;
}

export interface WorkloadMatrixRow {
  assignee_id: string | null;
  assignee_name: string;
  /** Period key (matches a value in `WorkloadMatrix.periods`) -> hours. */
  buckets: Record<string, number>;
  /**
   * Hours per calendar month (`"2026-08"`), independent of the requested
   * granularity. Sparse. Exists because a week bucket is keyed by the date
   * its week begins, so summing week buckets for a month credits a
   * straddling week entirely to the month it started in.
   */
  month_buckets?: Record<string, number>;
  total: number;
  /** Prorated capacity, keyed by the same periods as `buckets`. */
  capacity_buckets?: Record<string, number>;
  /** Per-period overload flag, keyed identically to `capacity_buckets`. */
  over?: Record<string, boolean>;
  /** `total` exceeds the summed `capacity_buckets` across the whole window. */
  total_over?: boolean;
  /**
   * Per-item detail, capped at 200 per assignee. Sorted with unestimated
   * items FIRST, and the cap is SHARED between the two kinds — so an
   * assignee with a large unestimated backlog can have estimated rows
   * truncated away, and `tasks[0]` is not the earliest-dated row.
   */
  tasks: WorkloadTask[];
  /** True when this row's `tasks` hit the 200-per-assignee cap. */
  tasks_truncated: boolean;
}

export interface WorkloadUnscheduledEntry {
  assignee_id: string | null;
  hours: number;
}

export interface WorkloadMatrixMeta {
  /** Estimated items only — this and `issues_unscheduled` describe hours. */
  issues_counted: number;
  issues_unscheduled: number;
  /**
   * Countable in-scope items with no usable estimate. A superset of
   * `zero_estimate_count`, which sees only stored rows with `hours <= 0` and
   * not items carrying no estimate row at all.
   */
  issues_unestimated: number;
  dirty_date_count: number;
  zero_estimate_count: number;
  unscheduled_ratio: number;
  truncated: boolean;
}

/**
 * Workload matrix response. Counts LEAF work items only — parents with
 * countable sub-items never appear as rows here (their totals live in the
 * rollup endpoints instead). There is NO default state filter: when
 * `state_group` is omitted every group is returned, `completed` and
 * `cancelled` included.
 *
 * `rows` counts PEOPLE, not work — every active, non-bot member of the
 * in-scope projects gets a row whether or not they carry anything, so
 * `rows.length` is a headcount. To ask whether this window holds any work,
 * test `rows.some((r) => r.tasks.length > 0 || r.total > 0)`; both halves are
 * needed, because `total` alone misses a member whose only work is
 * unscheduled or unestimated, and `tasks` alone misses hours whose rows were
 * cut by the 200-per-assignee cap.
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
