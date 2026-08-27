/**
 * GitHub integration (`github_ext`) model interfaces.
 *
 * Covers the three-tier PR-lifecycle -> work-item state transition config
 * (instance -> workspace -> project, most-specific-wins) and the read-only,
 * client-side view over GitHub-originated work-item links.
 */

/**
 * The only three PR-lifecycle events the state-transition config accepts.
 * Closed union (not a bare `string`) because the server rejects any other
 * key with a 400 — see `GithubStateTransitionRules`.
 */
export const GITHUB_STATE_EVENT_KEYS = ["pr_opened", "pr_ready_for_review", "pr_merged"] as const;

export type GithubStateEventKey = (typeof GITHUB_STATE_EVENT_KEYS)[number];

/**
 * `{ <event>: <state name> }`. Partial at every scope tier — a stored
 * override may set any subset of the three events; unset events fall
 * through to the next tier down (see `GithubStateConfigResponse`).
 */
export type GithubStateTransitionRules = Partial<Record<GithubStateEventKey, string>>;

/** Built-in defaults, used when no tier has overridden a given event. */
export const GITHUB_STATE_DEFAULT_RULES: Readonly<Record<GithubStateEventKey, string>> = {
  pr_opened: "In Progress",
  pr_ready_for_review: "In Review",
  pr_merged: "Done",
};

/**
 * Response shape for all three config GET/PUT tiers.
 *
 * A **GET is always the RESOLVED view**, not merely the stored row: the
 * server merges `GITHUB_STATE_DEFAULT_RULES` -> the instance `scope="global"`
 * override -> the workspace override -> the project override, most-specific
 * tier wins per-event. A GET at the instance tier therefore reflects only
 * defaults + the global override; a GET at the project tier reflects the
 * fully-resolved effective rules for that project.
 *
 * A **PUT** upserts only the override row for the tier addressed — it does
 * not affect the other tiers' stored rows, but the object it returns is the
 * newly-stored (partial) override, not a resolved view.
 */
export interface GithubStateConfigResponse {
  rules: GithubStateTransitionRules;
}

/** Body for every tier's `PUT .../config/`. */
export interface UpdateGithubStateConfig {
  rules: GithubStateTransitionRules;
}

/**
 * The GitHub object kinds a work-item link can point to. Matches the fork's
 * `WorkItemGithubLink.LINK_TYPE_CHOICES` — `"issue"` is a reserved choice on
 * the model; only `"branch"` / `"pr"` / `"commit"` are written by the
 * current link-parsing pipeline.
 */
export type GithubLinkType = "branch" | "pr" | "commit" | "issue";

/**
 * A GitHub-originated work-item link, reconstructed client-side from a core
 * `IssueLink` row (see `Github.listWorkItemGithubLinks` for the important
 * caveats on this reconstruction).
 */
export interface WorkItemGithubLink {
  id: string;
  issue: string;
  link_type: GithubLinkType;
  /** GitHub-side identity of the link (branch name / PR number / commit sha). */
  external_id: string;
  url: string;
  /** Passthrough of the mirrored `IssueLink.metadata` (e.g. `identifier`, `closing_word`). */
  metadata: Record<string, unknown>;
  created_at: Date;
}
