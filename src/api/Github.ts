import { BaseResource } from "./BaseResource";
import { Configuration } from "../Configuration";
import { Link } from "../models/Link";
import { PaginatedResponse } from "../models/common";
import { GithubStateConfigResponse, GithubStateTransitionRules, WorkItemGithubLink } from "../models/Github";

// `github_ext` mounts at `/api/` (fork touch-point 2), not the versioned
// `/api/v1/` prefix every other resource defaults to. `listWorkItemGithubLinks`
// on the other hand reuses the existing CORE `/api/v1/.../links/` endpoint (no
// dedicated github-links endpoint ships in this release). Rather than
// permanently overriding the shared `apiBasePath` field for the whole class
// (which would break that reuse), this resource clears it to `""` in its
// constructor and spells the full prefix on every endpoint literal below.
const GITHUB_EXT_BASE = "/api/github";
const CORE_API_V1_BASE = "/api/v1";

/** Matches the mirrored `IssueLink.title` written by `github_ext`'s link writer: `"GitHub {link_type}: {external_id}"`. */
const GITHUB_LINK_TITLE_RE = /^GitHub (branch|pr|commit|issue): (.+)$/;

function parseGithubLink(link: Link): WorkItemGithubLink | null {
  const match = typeof link.title === "string" ? GITHUB_LINK_TITLE_RE.exec(link.title) : null;
  if (!match) return null;
  const [, linkType, externalId] = match;
  return {
    id: link.id,
    issue: link.issue,
    link_type: linkType as WorkItemGithubLink["link_type"],
    external_id: externalId,
    url: link.url,
    metadata: (link as { metadata?: Record<string, unknown> }).metadata ?? {},
    created_at: link.created_at,
  };
}

/**
 * GitHub integration (`github_ext`) API resource.
 *
 * Handles the three-tier PR-lifecycle -> work-item state transition config
 * (instance -> workspace -> project) and a read-only, client-side view over
 * GitHub-originated work-item links. See `models/Github.ts` for full field
 * semantics. The HMAC-verified webhook receiver (`POST /api/github/webhook/`)
 * is not part of this SDK surface.
 */
export class Github extends BaseResource {
  constructor(config: Configuration) {
    super(config);
    this.apiBasePath = "";
  }

  /**
   * Read the instance-wide default rules (`scope="global"` row, merged over
   * the built-in defaults). Requires instance-admin credentials.
   */
  async getInstanceConfig(): Promise<GithubStateConfigResponse> {
    return this.get<GithubStateConfigResponse>(`${GITHUB_EXT_BASE}/config/`);
  }

  /**
   * Upsert the instance-wide default rules. Requires instance-admin
   * credentials — this single row is shared by every workspace on the
   * instance.
   */
  async setInstanceConfig(rules: GithubStateTransitionRules): Promise<GithubStateConfigResponse> {
    return this.put<GithubStateConfigResponse>(`${GITHUB_EXT_BASE}/config/`, { rules });
  }

  /**
   * Read the RESOLVED rules visible to a workspace: built-in defaults ->
   * instance override -> this workspace's override. Any workspace member
   * may call this.
   */
  async getWorkspaceConfig(workspaceSlug: string): Promise<GithubStateConfigResponse> {
    return this.get<GithubStateConfigResponse>(`${GITHUB_EXT_BASE}/${workspaceSlug}/config/`);
  }

  /**
   * Upsert this workspace's override row. Shape-validated only (state names
   * are not checked against any project's states at this tier — that
   * happens at the project tier). Requires workspace-admin credentials.
   */
  async setWorkspaceConfig(
    workspaceSlug: string,
    rules: GithubStateTransitionRules
  ): Promise<GithubStateConfigResponse> {
    return this.put<GithubStateConfigResponse>(`${GITHUB_EXT_BASE}/${workspaceSlug}/config/`, { rules });
  }

  /**
   * Read the fully-RESOLVED effective rules for a project: built-in
   * defaults -> instance override -> workspace override -> this project's
   * override. Any workspace member may call this.
   */
  async getProjectConfig(workspaceSlug: string, projectId: string): Promise<GithubStateConfigResponse> {
    return this.get<GithubStateConfigResponse>(`${GITHUB_EXT_BASE}/${workspaceSlug}/projects/${projectId}/config/`);
  }

  /**
   * Upsert this project's override row. Unlike the instance/workspace tiers,
   * every state name in `rules` must exist among this project's states (400
   * otherwise). Requires workspace-admin credentials.
   */
  async setProjectConfig(
    workspaceSlug: string,
    projectId: string,
    rules: GithubStateTransitionRules
  ): Promise<GithubStateConfigResponse> {
    return this.put<GithubStateConfigResponse>(`${GITHUB_EXT_BASE}/${workspaceSlug}/projects/${projectId}/config/`, {
      rules,
    });
  }

  /**
   * List the GitHub-originated links on a work item.
   *
   * There is no dedicated `github_ext` links endpoint in this release —
   * `WorkItemGithubLink` rows are only ever mirrored into the CORE
   * `IssueLink` table (for display in Plane's existing Links panel), which
   * this method reads via the same endpoint `client.links.list()` uses, then
   * reconstructs `link_type` / `external_id` client-side from the mirror's
   * `title` field (written as `"GitHub {link_type}: {external_id}"`).
   *
   * This is a best-effort heuristic, not a guaranteed contract: only rows
   * whose `title` matches that exact format are returned (regular links a
   * user added by hand — even ones pointing at a `github.com` URL — are
   * excluded unless their title happens to collide with the format).
   */
  async listWorkItemGithubLinks(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<WorkItemGithubLink[]> {
    const data = await this.get<PaginatedResponse<Link> | Link[]>(
      `${CORE_API_V1_BASE}/workspaces/${workspaceSlug}/projects/${projectId}/work-items/${issueId}/links/`
    );
    const links = Array.isArray(data) ? data : data.results;
    return links.map(parseGithubLink).filter((link): link is WorkItemGithubLink => link !== null);
  }
}
