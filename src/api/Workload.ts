import { BaseResource } from "./BaseResource";
import { Configuration } from "../Configuration";
import { HttpError } from "../errors/HttpError";
import { WorkloadParentHasChildrenError } from "../errors/WorkloadParentHasChildrenError";
import {
  GetWorkloadParams,
  UpdateWorkloadEstimate,
  WorkloadEstimate,
  WorkloadEstimatesBulkResponse,
  WorkloadEstimateWrite,
  WorkloadMatrix,
  WorkloadRollupsBulkResponse,
} from "../models/Workload";

const BULK_WORK_ITEM_IDS_CAP = 500;

function toCsvQueryParams(params: GetWorkloadParams): Record<string, string> {
  const query: Record<string, string> = {
    granularity: params.granularity,
    date_from: params.date_from,
    date_to: params.date_to,
  };
  if (params.project_ids?.length) query.project_ids = params.project_ids.join(",");
  if (params.assignee_ids?.length) query.assignee_ids = params.assignee_ids.join(",");
  if (params.state_group?.length) query.state_group = params.state_group.join(",");
  return query;
}

function requireWorkItemIds(workItemIds: string[]): void {
  if (!workItemIds.length) {
    throw new Error("workItemIds must not be empty");
  }
  if (workItemIds.length > BULK_WORK_ITEM_IDS_CAP) {
    throw new Error(`Too many workItemIds (max ${BULK_WORK_ITEM_IDS_CAP}, got ${workItemIds.length})`);
  }
}

/**
 * Workload API resource
 *
 * Handles the workload matrix (hours per assignee per period), per-work-item
 * hour estimates, and parent-work-item rollups (hours/progress/due-date
 * rolled up from a work item's countable sub-items). See `models/Workload.ts`
 * for full field semantics.
 */
export class Workload extends BaseResource {
  constructor(config: Configuration) {
    super(config);
  }

  /**
   * Workspace-scoped workload matrix: hours per assignee per period.
   * Counts LEAF work items only — parents with countable sub-items never
   * appear as rows (use `getWorkloadRollups` for parent totals).
   */
  async getWorkspaceWorkload(workspaceSlug: string, params: GetWorkloadParams): Promise<WorkloadMatrix> {
    return this.get<WorkloadMatrix>(`/workspaces/${workspaceSlug}/workload/`, toCsvQueryParams(params));
  }

  /**
   * Project-scoped workload matrix. Same shape and leaf-only counting as
   * {@link getWorkspaceWorkload}, narrowed to a single project.
   */
  async getProjectWorkload(
    workspaceSlug: string,
    projectId: string,
    params: GetWorkloadParams
  ): Promise<WorkloadMatrix> {
    return this.get<WorkloadMatrix>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/workload/`,
      toCsvQueryParams(params)
    );
  }

  /**
   * Retrieve a single work item's hour estimate.
   *
   * For a PARENT work item (>= 1 countable sub-item), `hours` is always
   * `null` and the response includes `is_parent: true` + a populated
   * `rollup`. For a leaf work item, `hours` is the stored estimate (or
   * `null` if unset) and `rollup` is absent.
   */
  async getWorkItemEstimate(workspaceSlug: string, projectId: string, workItemId: string): Promise<WorkloadEstimate> {
    return this.get<WorkloadEstimate>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/issues/${workItemId}/workload-estimate/`
    );
  }

  /**
   * Set a work item's hour estimate. `hours` must be in `0..10000`.
   *
   * A successful PUT is only reachable on a leaf work item, so the response
   * (unlike {@link getWorkItemEstimate}) never includes `is_parent`/`rollup`.
   *
   * @throws {WorkloadParentHasChildrenError} If `workItemId` is a parent
   *   work item (>= 1 countable sub-item) — estimates can only be set on
   *   leaf work items. `error.errorCode === "PARENT_HAS_CHILDREN"`.
   */
  async updateWorkItemEstimate(
    workspaceSlug: string,
    projectId: string,
    workItemId: string,
    data: UpdateWorkloadEstimate
  ): Promise<WorkloadEstimateWrite> {
    const endpoint = `/workspaces/${workspaceSlug}/projects/${projectId}/issues/${workItemId}/workload-estimate/`;
    try {
      return await this.put<WorkloadEstimateWrite>(endpoint, data);
    } catch (error) {
      if (
        error instanceof HttpError &&
        (error.response as { error_code?: string })?.error_code === "PARENT_HAS_CHILDREN"
      ) {
        const body = error.response as { error?: string; error_code: string };
        throw new WorkloadParentHasChildrenError(body.error ?? error.message, error.statusCode ?? 400, error.response);
      }
      throw error;
    }
  }

  /**
   * Delete a work item's stored hour estimate. Unlike `updateWorkItemEstimate`,
   * this is allowed on parent work items too (cleanup of legacy rows).
   */
  async deleteWorkItemEstimate(workspaceSlug: string, projectId: string, workItemId: string): Promise<void> {
    return this.httpDelete(
      `/workspaces/${workspaceSlug}/projects/${projectId}/issues/${workItemId}/workload-estimate/`
    );
  }

  /**
   * Bulk-fetch stored hour estimates across a workspace.
   *
   * Returns `{ <workItemId>: hours }`; work items with no stored estimate
   * are omitted, and PARENT work item ids are always omitted (a parent's
   * estimate lives in its rollup, not here — use `getWorkloadRollups`).
   *
   * @param workItemIds 1..500 ids (server caps at 500; empty array throws).
   */
  async getWorkItemEstimatesBulk(workspaceSlug: string, workItemIds: string[]): Promise<WorkloadEstimatesBulkResponse> {
    requireWorkItemIds(workItemIds);
    return this.get<WorkloadEstimatesBulkResponse>(`/workspaces/${workspaceSlug}/workload-estimates/`, {
      issue_ids: workItemIds.join(","),
    });
  }

  /**
   * Bulk-fetch parent rollups across a workspace.
   *
   * Returns `{ <workItemId>: rollup }` for ids that ARE parents (>= 1
   * countable sub-item); leaf ids, and ids the caller cannot access, are
   * both simply omitted (indistinguishable by design — mirrors
   * `getWorkItemEstimatesBulk`'s access semantics).
   *
   * @param workItemIds 1..500 ids (server caps at 500; empty array throws).
   */
  async getWorkloadRollups(workspaceSlug: string, workItemIds: string[]): Promise<WorkloadRollupsBulkResponse> {
    requireWorkItemIds(workItemIds);
    return this.get<WorkloadRollupsBulkResponse>(`/workspaces/${workspaceSlug}/workload-rollups/`, {
      issue_ids: workItemIds.join(","),
    });
  }
}
