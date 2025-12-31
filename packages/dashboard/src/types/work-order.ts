export type WorkOrderStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type WorkspaceSourceType = 'git' | 'local' | 'archive';

export interface WorkspaceSource {
  type: WorkspaceSourceType;
  url?: string;
  branch?: string;
  path?: string;
  commit?: string;
}

export interface WorkOrder {
  id: string;
  status: WorkOrderStatus;
  prompt: string;
  workspace_source: WorkspaceSource;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  result?: {
    success: boolean;
    message?: string;
    artifacts?: string[];
  };
}

export interface WorkOrderFilters {
  status?: WorkOrderStatus;
  search?: string;
}

export type SortOrder = 'asc' | 'desc';

export interface WorkOrderSortOptions {
  field: 'created_at' | 'updated_at' | 'status';
  order: SortOrder;
}
