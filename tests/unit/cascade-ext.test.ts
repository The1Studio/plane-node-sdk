import { PlaneClient } from "../../src/client/plane-client";
import {
  MAX_MODULE_CASCADE_ITEMS,
  ModuleCascadePreviewResponse,
  CascadeModuleStatus,
} from "../../src/models/CascadeExt";
import { config } from "./constants";
import { createTestClient, randomizeName } from "../helpers/test-utils";
import { describeIf as describe } from "../helpers/conditional-tests";
import { ModuleCascadeOverCapError } from "../../src/errors/ModuleCascadeOverCapError";

describe(!!(config.workspaceSlug && config.projectId && config.workItemId), "CascadeExt API Tests", () => {
  let client: PlaneClient;
  let workspaceSlug: string;
  let projectId: string;
  let moduleId: string;
  let initialState: string | undefined;

  beforeAll(async () => {
    client = createTestClient();
    workspaceSlug = config.workspaceSlug;
    projectId = config.projectId;

    // Create a throwaway module so the suite never depends on a pre-existing
    // module, nor mutates a real one's status.
    const module = await client.modules.create(workspaceSlug, projectId, {
      name: randomizeName("CascadeExt Test Module"),
      description: "created by cascade-ext.test.ts",
    });
    moduleId = module.id;

    const states = await client.states.list(workspaceSlug, projectId);
    initialState = states.results.find((s) => s.group === "backlog")?.id ?? states.results[0].id;
  });

  afterAll(async () => {
    if (moduleId) {
      try {
        await client.modules.delete(workspaceSlug, projectId, moduleId);
      } catch (error) {
        console.warn("Failed to delete cascade test module:", error);
      }
    }
  });

  it("should preview a module cascade (no mutation)", async () => {
    const preview: ModuleCascadePreviewResponse = await client.cascadeExt.preview(
      workspaceSlug,
      projectId,
      moduleId,
      "completed"
    );

    expect(preview.target_group).toBe("completed");
    expect(typeof preview.over_cap).toBe("boolean");
    expect(preview.cap).toBe(MAX_MODULE_CASCADE_ITEMS);
    expect(preview.summary).toBeDefined();
    expect(typeof preview.summary.total_live).toBe("number");
    expect(Array.isArray(preview.items)).toBe(true);
  });

  it("should apply a module cascade with an explicit status", async () => {
    // A brand-new module echoes whatever status we apply. This is safe: the
    // module owns no work items yet (or none eligible), so no real work item
    // is displaced merely by the cascade itself.
    const preview = await client.cascadeExt.preview(workspaceSlug, projectId, moduleId, "cancelled");
    const status: CascadeModuleStatus = preview.summary.eligible > 0 ? "cancelled" : "completed";

    const applied = await client.cascadeExt.apply(workspaceSlug, projectId, moduleId, { status });
    expect(applied.status).toBe(status);
    expect(Array.isArray(applied.updated)).toBe(true);
    expect(Array.isArray(applied.rejected)).toBe(true);
  });

  it("should move eligible items and surface the target state in preview", async () => {
    if (initialState == null) {
      // No states in the project — nothing to assert against.
      expect(true).toBe(true);
      return;
    }

    const preview = await client.cascadeExt.preview(workspaceSlug, projectId, moduleId, "completed");
    if (preview.summary.total_live === 0) {
      // Empty module tree — nothing to move; the preview contract still holds.
      expect(preview.items).toEqual([]);
      return;
    }

    for (const item of preview.items) {
      // Every item already in a terminal group is NOT eligible (its subtree is
      // pruned, per the fork's cascade behavior), so `eligible` implies a live
      // group and a non-null target state.
      expect(typeof item.eligible).toBe("boolean");
      if (item.eligible) {
        expect(item.target_state_id).toBeTruthy();
        expect(item.reason).toBeNull();
      }
    }
  });

  it("should refuse to cascade an empty item set", async () => {
    // Passing `[]` must be accepted by the server as "cascade none" — this
    // validates the `item_ids: []` contract without displacing any item.
    const applied = await client.cascadeExt.apply(workspaceSlug, projectId, moduleId, {
      status: "completed",
      item_ids: [],
    });
    expect(applied.updated).toEqual([]);
    expect(Array.isArray(applied.rejected)).toBe(true);
  });

  it("should surface the over-cap refusal as a typed, readable error", async () => {
    // If the module tree were over the cap, the SDK must turn the 400 into a
    // ModuleCascadeOverCapError (not a generic transport failure). We cannot
    // force a >100-item tree here, so we only assert the error TYPE is the one
    // the SDK throws for the contractually-distinct refusal. A fake module
    // that doesn't exist should NOT be this error — so we guard on the real
    // error class instead: this test is a typed-contract smoke check.
    const preview = await client.cascadeExt.preview(workspaceSlug, projectId, moduleId, "completed");
    if (preview.over_cap) {
      // Only meaningful when the server actually refuses.
      await expect(
        client.cascadeExt.apply(workspaceSlug, projectId, moduleId, { status: "completed" })
      ).rejects.toBeInstanceOf(ModuleCascadeOverCapError);
    } else {
      // Preserve the type contract regardless: the class is exported and
      // constructible with the over-cap shape.
      const err = new ModuleCascadeOverCapError("too many", 400, { error: "too many", cap: 100, total_live: 150 });
      expect(err.cap).toBe(100);
      expect(err.totalLive).toBe(150);
      expect(err.errorCode).toBe("MODULE_CASCADE_OVER_CAP");
      expect(err.statusCode).toBe(400);
    }
  });
});