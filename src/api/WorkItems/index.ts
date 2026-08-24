import { BaseResource } from "../BaseResource";
import { Configuration } from "../../Configuration";
import {
  WorkItem,
  CreateWorkItem,
  UpdateWorkItem,
  ListWorkItemsParams,
  WorkItemExpandableFieldName,
  WorkItemBase,
  WorkItemSearch,
  AdvancedSearchWorkItem,
  AdvancedSearchResult,
} from "../../models/WorkItem";
import { PaginatedResponse } from "../../models/common";
import { Links } from "../Links";
import { Relations } from "./Relations";
import { Attachments } from "./Attachments";
import { Comments } from "./Comments";
import { Activities } from "./Activities";
import { WorkLogs } from "./WorkLogs";

/**
 * WorkItems API resource
 * Handles all work item (issue) related operations
 */
export class WorkItems extends BaseResource {
  public links: Links;
  public relations: Relations;
  public attachments: Attachments;
  public comments: Comments;
  public activities: Activities;
  public workLogs: WorkLogs;

  constructor(config: Configuration) {
    super(config);
    this.links = new Links(config);
    this.relations = new Relations(config);
    this.attachments = new Attachments(config);
    this.comments = new Comments(config);
    this.activities = new Activities(config);
    this.workLogs = new WorkLogs(config);
  }

  /**
   * Create a new work item
   *
   * The server fills two fields when the request does not carry them:
   *
   * - no `assignees` property -> assigned to the authenticated caller. The
   *   project's own `default_assignee` still takes precedence, and a caller who
   *   is not an active project member at role >= 15 is skipped, leaving the item
   *   unassigned rather than assigning someone who cannot see it.
   * - no `target_date` property -> today, in the CALLER's own timezone, not the
   *   server's UTC date. When `start_date` is in the future the default is
   *   `start_date` instead, so a future start date can never produce the
   *   server's "Start date cannot exceed target date" error.
   *
   * An ABSENT field and an EXPLICITLY EMPTY one are different. Pass `[]` for
   * `assignees`, or `null` for `target_date`, to opt out deliberately; omitting
   * the property asks for the default. This works because `JSON.stringify`
   * drops `undefined` but preserves `null`, so both intents survive the wire.
   *
   * Updates never default: clearing either field through `update` leaves it
   * cleared. Intake creation is excluded server-side.
   */
  async create(workspaceSlug: string, projectId: string, createWorkItem: CreateWorkItem): Promise<WorkItem> {
    return this.post<WorkItem>(`/workspaces/${workspaceSlug}/projects/${projectId}/work-items/`, createWorkItem);
  }

  // method overloads
  async retrieve(workspaceSlug: string, projectId: string, workItemId: string): Promise<WorkItemBase>;

  async retrieve<E extends WorkItemExpandableFieldName>(
    workspaceSlug: string,
    projectId: string,
    workItemId: string,
    expand: E[]
  ): Promise<WorkItem<E>>;

  /**
   * Retrieve a work item by ID
   */
  async retrieve<E extends WorkItemExpandableFieldName>(
    workspaceSlug: string,
    projectId: string,
    workItemId: string,
    expand?: E[]
  ): Promise<WorkItem<E>> {
    return this.get<WorkItem<E>>(`/workspaces/${workspaceSlug}/projects/${projectId}/work-items/${workItemId}/`, {
      expand: expand?.join(","),
    });
  }

  /**
   * Update a work item
   */
  async update(
    workspaceSlug: string,
    projectId: string,
    workItemId: string,
    updateWorkItem: UpdateWorkItem
  ): Promise<WorkItem> {
    return this.patch<WorkItem>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/work-items/${workItemId}/`,
      updateWorkItem
    );
  }

  /**
   * Delete a work item
   */
  async delete(workspaceSlug: string, projectId: string, workItemId: string): Promise<void> {
    return this.httpDelete(`/workspaces/${workspaceSlug}/projects/${projectId}/work-items/${workItemId}/`);
  }

  /**
   * List work items with optional filtering
   */
  async list(
    workspaceSlug: string,
    projectId: string,
    params?: ListWorkItemsParams
  ): Promise<PaginatedResponse<WorkItem>> {
    return this.get<PaginatedResponse<WorkItem>>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/work-items/`,
      params
    );
  }

  // method overloads
  async retrieveByIdentifier(workspaceSlug: string, identifier: string): Promise<WorkItemBase>;

  async retrieveByIdentifier<E extends WorkItemExpandableFieldName>(
    workspaceSlug: string,
    identifier: string,
    expand: E[]
  ): Promise<WorkItem<E>>;

  // Implementation
  async retrieveByIdentifier<E extends WorkItemExpandableFieldName>(
    workspaceSlug: string,
    identifier: string,
    expand?: E[]
  ): Promise<WorkItem<E> | WorkItemBase> {
    return this.get<WorkItem<E>>(`/workspaces/${workspaceSlug}/work-items/${identifier}/`, {
      expand: expand?.join(","),
    });
  }

  /**
   * Search work items
   */
  async search(workspaceSlug: string, query: string, projectId?: string, params?: any): Promise<WorkItemSearch> {
    return this.get<WorkItemSearch>(`/workspaces/${workspaceSlug}/work-items/search/`, {
      ...params,
      search: query,
      project: projectId,
    });
  }

  /**
   * Perform advanced search on work items with filters.
   *
   * Supports text-based search via `query` and/or structured filters
   * using recursive AND/OR groups.
   */
  async advancedSearch(workspaceSlug: string, data: AdvancedSearchWorkItem): Promise<AdvancedSearchResult[]> {
    return this.post<AdvancedSearchResult[]>(`/workspaces/${workspaceSlug}/work-items/advanced-search/`, data);
  }
}
