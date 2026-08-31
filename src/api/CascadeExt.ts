import { BaseResource } from "./BaseResource";
import { Configuration } from "../Configuration";
import { HttpError } from "../errors/HttpError";
import { ModuleCascadeOverCapError } from "../errors/ModuleCascadeOverCapError";
import {
  ModuleCascadeApplyRequest,
  ModuleCascadeApplyResponse,
  ModuleCascadeErrorBody,
  ModuleCascadePreviewResponse,
  CascadeModuleStatus,
} from "../models/CascadeExt";

// `cascade_ext` mounts at `/api/cascade-ext/` (fork touch-point,
// `feat/module-cascade-terminal-status`), NOT the versioned `/api/v1/` prefix
// every other resource defaults to. Following the `Github` (`github_ext`)
// precedent: rather than overriding the shared `apiBasePath` field for the
// whole class, this resource clears it to `""` in its constructor and spells
// the full prefix on every endpoint literal below.
const CASCADE_EXT_BASE = "/api/cascade-ext";

/**
 * Module-cascade API resource
 *
 * Handles the fork's module-level cascade endpoints (`cascade_ext` app,
 * `feat/module-cascade-terminal-status`): previewing which work items a
 * pending module status change would affect, and applying that change to
 * them.
 *
 * IMPORTANT — base path: `cascade_ext` mounts at `/api/cascade-ext/`,
 * OUTSIDE the `/api/v1` prefix that the rest of this SDK composes against
 * (`BaseResource.buildUrl` = `${baseUrl}${apiBasePath}${endpoint}` with the
 * default `apiBasePath = "/api/v1"`). If the default base path were left in
 * place, every request would hit `/api/v1/cascade-ext/...` and 404.
 */
export class CascadeExt extends BaseResource {
  constructor(config: Configuration) {
    super(config);
    this.apiBasePath = "";
  }

  /**
   * Preview a module cascade WITHOUT mutating anything.
   *
   * Dry-runs the eligibility pass for applying `status` to the module's live
   * work-item tree and returns the affected items. `over_cap` on the response
   * means the module tree exceeds {@link MAX_MODULE_CASCADE_ITEMS} live items;
   * in that case `items` is EMPTY and the real count is in
   * `response.summary.total_live`.
   *
   * NOTE — the query param is a MODULE status (`status`), NOT `group` as on
   * the per-issue cascade routes.
   */
  async preview(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    status: CascadeModuleStatus
  ): Promise<ModuleCascadePreviewResponse> {
    return this.get<ModuleCascadePreviewResponse>(
      `${CASCADE_EXT_BASE}/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/cascade-preview/`,
      { status }
    );
  }

  /**
   * Apply a module cascade: move the eligible work items in the module tree to
   * the target module status.
   *
   * `body.item_ids` omitted/null = every eligible item; `[]` = none. The
   * response reports exactly which items were `updated` and which were
   * `rejected` (with a reason).
   *
   * @throws {ModuleCascadeOverCapError} If the server refuses the cascade —
   *   module tree over the cascade cap, or the module is archived. The refusal
   *   writes NOTHING (the module status included). Do NOT retry the cascade;
   *   fall back to a plain module status PATCH instead. `.cap` and
   *   `.totalLive` surface the counts from the server's `{ error, cap,
   *   total_live }` body when present.
   */
  async apply(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    body: ModuleCascadeApplyRequest
  ): Promise<ModuleCascadeApplyResponse> {
    const endpoint = `${CASCADE_EXT_BASE}/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/cascade-apply/`;
    try {
      return await this.post<ModuleCascadeApplyResponse>(endpoint, body);
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 400) {
        const response = error.response as ModuleCascadeErrorBody | undefined;
        const message = response?.error ?? error.message;
        throw new ModuleCascadeOverCapError(message, error.statusCode, response);
      }
      throw error;
    }
  }
}