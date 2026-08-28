import type { User } from '@/types';

export interface ToolContext {
  user: User;
  conversationId?: string;
  messageId?: string;
}

export interface ToolDefinition<A = Record<string, unknown>, R = unknown> {
  name: string;
  description: string;
  /** LLM function-calling에 그대로 넘길 JSON Schema. */
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  handler: (args: A, ctx: ToolContext) => Promise<R>;
}
