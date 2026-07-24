import { PlaneClient } from "../../src/client/plane-client";
import { GithubStateTransitionRules } from "../../src/models/Github";
import { config } from "./constants";
import { createTestClient } from "../helpers/test-utils";
import { describeIf as describe } from "../helpers/conditional-tests";

describe(!!(config.workspaceSlug && config.projectId), "Github API Tests", () => {
  let client: PlaneClient;
  let workspaceSlug: string;
  let projectId: string;
  let originalWorkspaceRules: GithubStateTransitionRules;
  let originalProjectRules: GithubStateTransitionRules;
  /** An existing state name in the test project, used for the project-tier
   * PUT (which validates every value against the project's actual states). */
  let existingStateName: string;

  beforeAll(async () => {
    client = createTestClient();
    workspaceSlug = config.workspaceSlug;
    projectId = config.projectId;

    // Capture the pre-test resolved rules so afterAll can restore them.
    originalWorkspaceRules = (await client.github.getWorkspaceConfig(workspaceSlug)).rules;
    originalProjectRules = (await client.github.getProjectConfig(workspaceSlug, projectId)).rules;

    const states = await client.states.list(workspaceSlug, projectId);
    existingStateName = states.results[0].name;
  });

  afterAll(async () => {
    try {
      await client.github.setWorkspaceConfig(workspaceSlug, originalWorkspaceRules);
      await client.github.setProjectConfig(workspaceSlug, projectId, originalProjectRules);
    } catch (error) {
      console.warn("Failed to restore github state-transition config:", error);
    }
  });

  it("should read the resolved workspace config", async () => {
    const { rules } = await client.github.getWorkspaceConfig(workspaceSlug);
    expect(rules).toBeDefined();
  });

  it("should set and re-read the workspace config override", async () => {
    const updated = await client.github.setWorkspaceConfig(workspaceSlug, { pr_opened: "In Progress" });
    expect(updated.rules.pr_opened).toBe("In Progress");

    const resolved = await client.github.getWorkspaceConfig(workspaceSlug);
    expect(resolved.rules.pr_opened).toBe("In Progress");
  });

  it("should read the fully-resolved project config", async () => {
    const { rules } = await client.github.getProjectConfig(workspaceSlug, projectId);
    expect(rules).toBeDefined();
  });

  it("should set and re-read the project config override, validated against real project states", async () => {
    const updated = await client.github.setProjectConfig(workspaceSlug, projectId, {
      pr_merged: existingStateName,
    });
    expect(updated.rules.pr_merged).toBe(existingStateName);

    const resolved = await client.github.getProjectConfig(workspaceSlug, projectId);
    expect(resolved.rules.pr_merged).toBe(existingStateName);
  });

  it("should reject a project override referencing a state that does not exist in the project", async () => {
    await expect(
      client.github.setProjectConfig(workspaceSlug, projectId, {
        pr_merged: "__no_such_state__",
      })
    ).rejects.toThrow();
  });

  it("should list github links for a work item as an array (possibly empty)", async () => {
    const links = await client.github.listWorkItemGithubLinks(workspaceSlug, projectId, config.workItemId);
    expect(Array.isArray(links)).toBe(true);
    for (const link of links) {
      expect(["branch", "pr", "commit", "issue"]).toContain(link.link_type);
      expect(typeof link.external_id).toBe("string");
    }
  });

  // Instance-tier config (getInstanceConfig/setInstanceConfig) requires
  // INSTANCE ADMIN credentials, which the shared TEST_* env vars do not
  // assert, so it is intentionally not exercised live here.
});
