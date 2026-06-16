export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  session_id: string;
  parts: ContentPart[];
  model: string;
  provider: string;
  created_at: number;
  updated_at: number;
}

export type ContentPart = {
  type: string;
  data: Record<string, unknown>;
};

export interface Session {
  id: string;
  title: string;
  message_count: number;
  cost: number;
  is_busy: boolean;
  created_at: number;
  updated_at: number;
}

export interface Workspace {
  id: string;
  path: string;
  version?: string;
}

export interface PermissionRequest {
  id: string;
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  description: string;
  action?: string;
  params?: unknown;
  path?: string;
}

export interface SSEEnvelope {
  type: string;
  payload: {
    type: 'created' | 'updated' | 'deleted';
    payload: unknown;
  };
}
