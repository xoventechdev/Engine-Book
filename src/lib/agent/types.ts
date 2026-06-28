/**
 * Agent types — provider-agnostic definitions for the agentic tool-calling
 * workflow used by the chat route.
 *
 * The agent loop (see `loop.ts`) sends a conversation + tool definitions to
 * the LLM. The LLM either responds with text (final answer) or requests one
 * or more tool calls. The loop executes the tools, appends the results to
 * the conversation, and calls the LLM again. This repeats until the LLM
 * produces a final answer or the max-iteration limit is reached.
 *
 * Each AI provider (Gemini, OpenAI, Anthropic) has a different wire format
 * for tool calling — the translators in `ai.ts` map between the universal
 * shapes defined here and each provider's native format.
 */

/** A tool definition the LLM can choose to call. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

/** A tool call requested by the LLM. */
export interface ToolCall {
  /** Unique id — generated for Gemini (which doesn't supply one), taken from
   *  the response for OpenAI/Anthropic which require it for correlation. */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** A message in the agent conversation history. */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant messages that request tool calls. */
  toolCalls?: ToolCall[];
  /** Present on tool-result messages — correlates to the ToolCall.id. */
  toolCallId?: string;
  /** Present on tool-result messages — the tool name (needed by Gemini). */
  toolName?: string;
}

/** Result of one LLM step in the agent loop. */
export interface AgentStepResult {
  /** Assistant text (may be empty if the step only requests tool calls). */
  text: string;
  /** Tool calls the model wants to execute (empty if it's done). */
  toolCalls: ToolCall[];
  /** Why the model stopped. */
  finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error';
}

/** Context passed to tool executors — everything they need to run server-side. */
export interface ToolContext {
  projectId: string;
  ownerId: string;
  settings: import('@/lib/ai').AISettings;
}

/** A log entry for the UI — shows which tool the agent called at each step. */
export interface ToolCallLogEntry {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  /** First ~200 chars of the tool result, for a quick preview in the UI. */
  resultSummary: string;
}
