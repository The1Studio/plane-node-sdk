import { WorkItemType } from "./WorkItemType";
import { BaseModel, PriorityEnum } from "./common";
import { Module } from "./Module";
import { Label } from "./Label";
import { Project } from "./Project";
import { State } from "./State";
import { User } from "./User";

/**
 * WorkItem model interfaces
 */
export interface WorkItemBase extends BaseModel {
  name: string;
  sequence_id: number;
  description_html?: string;
  project: string;
  labels?: string[];
  assignees?: string[];
  type?: string;
  estimate_point?: string;
  state?: string;
  parent?: string;
  is_draft?: boolean;
  archived_at?: string;
  completed_at?: string;
  sort_order?: number;
  target_date?: string;
  start_date?: string;
  priority?: PriorityEnum;
  description_stripped?: string;
  description_binary?: string;
}

// 1. Define expandable fields mapping (single source of truth)
type WorkItemExpandableFields = {
  type: WorkItemType;
  module: Module;
  labels: Label[];
  assignees: User[];
  state: State;
  project: Project;
};

export type WorkItemExpandableFieldName = keyof WorkItemExpandableFields;

// Smart type that expands based on what's requested
// Fallback to WorkItemBase if Expanded is never or empty array
export type WorkItem<Expanded extends WorkItemExpandableFieldName = never> = [Expanded] extends [never]
  ? WorkItemBase
  : Omit<WorkItemBase, Expanded> & {
      [K in Expanded]: K extends keyof WorkItemExpandableFields ? WorkItemExpandableFields[K] : never;
    };

/**
 * Work-item creation payload.
 *
 * Two fields are filled by the server when the request does not carry them:
 * an absent `assignees` assigns the authenticated caller, and an absent
 * `target_date` becomes today in the caller's own timezone. See
 * {@link WorkItems.create} for the full contract.
 *
 * Omitting a property and passing an explicitly empty value are NOT the same
 * thing. `JSON.stringify` drops `undefined` but keeps `null`, so an omitted
 * property reaches the server as absent (and gets the default) while an
 * explicit `[]` or `null` reaches it as a deliberate "nobody" / "no due date".
 */
export interface CreateWorkItem {
  name: string;
  description_html?: string;
  state?: string;
  /** Omit for the creator; pass `[]` to create the work item deliberately unassigned. */
  assignees?: string[];
  labels?: string[];
  parent?: string;
  estimate_point?: string;
  type?: string;
  module?: string;
  /**
   * Omit for today (in the caller's timezone). Pass `null` to create the work
   * item deliberately without a due date — `null` is accepted here precisely so
   * that opt-out is expressible; omitting the property cannot say it.
   */
  target_date?: string | null;
  start_date?: string;
  priority?: PriorityEnum;
}

export interface UpdateWorkItem {
  name?: string;
  description_html?: string;
  state?: string;
  assignees?: string[];
  labels?: string[];
  parent?: string;
  estimate_point?: string;
  type?: string;
  module?: string;
  target_date?: string;
  start_date?: string;
  priority?: PriorityEnum;
}

export interface ListWorkItemsParams {
  project?: string;
  state?: string;
  assignee?: string;
  limit?: number;
  offset?: number;
  pql?: string;
}

export interface WorkItemActivity {
  id: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  verb?: string;
  field?: string;
  old_value?: string;
  new_value?: string;
  comment?: string;
  attachments?: string[];
  old_identifier?: string;
  new_identifier?: string;
  epoch?: number;
  project: string;
  workspace: string;
  issue?: string;
  issue_comment?: string;
  actor?: string;
}

export interface WorkItemSearch {
  issues: WorkItemSearchItem[];
}

export interface WorkItemSearchItem {
  id: string; // Issue ID
  name: string; // Issue name
  sequence_id: string; // Issue sequence ID
  project__identifier: string; // Project identifier
  project_id: string; // Project ID
  workspace__slug: string; // Workspace slug
}

/**
 * Filter condition for advanced search.
 * Either a leaf condition (e.g. { state_id: "..." }) or a group with "and"/"or" keys.
 */
export type AdvancedSearchFilter = {
  and?: AdvancedSearchFilter[];
  or?: AdvancedSearchFilter[];
  [key: string]: unknown;
};

/**
 * Request body for advanced work item search.
 */
export interface AdvancedSearchWorkItem {
  query?: string;
  filters?: AdvancedSearchFilter;
  limit?: number;
}

/**
 * Result item from advanced work item search.
 */
export interface AdvancedSearchResult {
  id: string;
  name: string;
  sequence_id: number;
  project_identifier: string;
  project_id: string;
  workspace_id: string;
  type_id?: string | null;
  state_id?: string | null;
  priority?: string | null;
  target_date?: string | null;
  start_date?: string | null;
}
