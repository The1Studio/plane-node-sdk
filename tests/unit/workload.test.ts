import { PlaneClient } from "../../src/client/plane-client";
import { WorkloadEstimate } from "../../src/models/Workload";
import { config } from "./constants";
import { createTestClient } from "../helpers/test-utils";
import { describeIf as describe } from "../helpers/conditional-tests";

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe(!!(config.workspaceSlug && config.projectId && config.workItemId), "Workload API Tests", () => {
  let client: PlaneClient;
  let workspaceSlug: string;
  let projectId: string;
  let workItemId: string;
  let originalEstimate: WorkloadEstimate;

  beforeAll(async () => {
    client = createTestClient();
    workspaceSlug = config.workspaceSlug;
    projectId = config.projectId;
    workItemId = config.workItemId;
    // Capture the pre-test estimate so afterAll can restore it exactly.
    originalEstimate = await client.workload.getWorkItemEstimate(workspaceSlug, projectId, workItemId);
  });

  afterAll(async () => {
    try {
      if (originalEstimate?.hours == null) {
        await client.workload.deleteWorkItemEstimate(workspaceSlug, projectId, workItemId);
      } else {
        await client.workload.updateWorkItemEstimate(workspaceSlug, projectId, workItemId, {
          hours: originalEstimate.hours,
        });
      }
    } catch (error) {
      console.warn("Failed to restore work item workload estimate:", error);
    }
  });

  it("should set and retrieve a work item's workload estimate", async () => {
    const updated = await client.workload.updateWorkItemEstimate(workspaceSlug, projectId, workItemId, {
      hours: 4.5,
    });
    // The PUT response never carries is_parent/rollup (see WorkloadEstimateWrite) —
    // a successful PUT is only reachable on a leaf work item.
    expect(updated.hours).toBe(4.5);

    const retrieved = await client.workload.getWorkItemEstimate(workspaceSlug, projectId, workItemId);
    expect(retrieved.hours).toBe(4.5);
    expect(retrieved.is_parent).toBe(false);
    expect(retrieved.rollup).toBeUndefined();
  });

  it("should delete a work item's workload estimate", async () => {
    await expect(client.workload.deleteWorkItemEstimate(workspaceSlug, projectId, workItemId)).resolves.toBeUndefined();

    const retrieved = await client.workload.getWorkItemEstimate(workspaceSlug, projectId, workItemId);
    expect(retrieved.hours).toBeNull();
  });

  it("should fetch the workspace workload matrix", async () => {
    const matrix = await client.workload.getWorkspaceWorkload(workspaceSlug, {
      granularity: "week",
      date_from: isoDate(-7),
      date_to: isoDate(30),
    });
    expect(matrix.granularity).toBe("week");
    expect(Array.isArray(matrix.periods)).toBe(true);
    expect(Array.isArray(matrix.rows)).toBe(true);
    expect(Array.isArray(matrix.unscheduled)).toBe(true);
    expect(matrix.meta).toBeDefined();
  });

  it("should fetch the project workload matrix", async () => {
    const matrix = await client.workload.getProjectWorkload(workspaceSlug, projectId, {
      granularity: "day",
      date_from: isoDate(-1),
      date_to: isoDate(7),
      state_group: ["started", "unstarted"],
    });
    expect(matrix.granularity).toBe("day");
    expect(Array.isArray(matrix.rows)).toBe(true);
  });

  it("should bulk-fetch work item estimates (omitting work items with no stored estimate)", async () => {
    const bulk = await client.workload.getWorkItemEstimatesBulk(workspaceSlug, [workItemId]);
    expect(bulk[workItemId]).toBeUndefined();

    await client.workload.updateWorkItemEstimate(workspaceSlug, projectId, workItemId, { hours: 2 });
    const bulkAfter = await client.workload.getWorkItemEstimatesBulk(workspaceSlug, [workItemId]);
    expect(bulkAfter[workItemId]).toBe(2);
  });

  it("should bulk-fetch workload rollups (omitting leaf work items)", async () => {
    const rollups = await client.workload.getWorkloadRollups(workspaceSlug, [workItemId]);
    // workItemId is a leaf in this suite's fixture (no known sub-items) — a
    // leaf id is never present in the rollups response.
    expect(rollups[workItemId]).toBeUndefined();
  });

  it("should throw for an empty bulk work item id list", async () => {
    await expect(client.workload.getWorkItemEstimatesBulk(workspaceSlug, [])).rejects.toThrow();
    await expect(client.workload.getWorkloadRollups(workspaceSlug, [])).rejects.toThrow();
  });
});
