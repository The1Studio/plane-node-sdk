import { HttpError } from "./HttpError";

/**
 * Thrown by `Workload.updateWorkItemEstimate` when called against a parent
 * work item (a work item with >= 1 countable sub-item). Estimates can only
 * be set on leaf work items — read `rollup` from the parent's
 * `getWorkItemEstimate` response instead.
 *
 * Mirrors the API's `400 { "error": string, "error_code": "PARENT_HAS_CHILDREN" }`
 * response, exposing `errorCode` as a typed, programmatically-checkable field
 * instead of requiring callers to parse `message` text.
 */
export class WorkloadParentHasChildrenError extends HttpError {
  public readonly errorCode = "PARENT_HAS_CHILDREN" as const;

  constructor(message: string, statusCode: number, response?: unknown) {
    super(message, statusCode, response);
    this.name = "WorkloadParentHasChildrenError";
  }
}
