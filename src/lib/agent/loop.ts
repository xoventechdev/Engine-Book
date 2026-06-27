/**
 * The agentic research loop.
 *
 * Implements the core "Agentic AI" workflow:
 *
 *   1. PLAN  — the LLM receives the user's question + tool definitions and
 *              decides which tools to call (or answers directly).
 *   2. ACT   — the requested tools are executed server-side (search documents,
 *              read PDFs, list available files, etc.).
 *   3. OBSERVE — tool results are appended to the conversation.
 *   4. REFLECT — the LLM reviews the results and either calls more tools
 *              or produces a final cited answer.
 *
 * This loop repeats up to MAX_ITERATIONS times. Each iteration is one full
 * plan→act→observe→reflect cycle.
 *
 * The returned `toolCallLog` lets the UI show the agent's reasoning steps
 * (which tools it called and what it found) — making the agentic workflow
 * visible to the user and the competition judges.
 */

import { generateWithTools, type AISettings } from '@/lib/ai';
import { AGENT_TOOLS, executeTool } from './tools';
import type {
  AgentMessage,
  ToolCallLogEntry,
  ToolContext,
} from './types';

const MAX_ITERATIONS = 10;

const AGENT_SYSTEM_PROMPT = `You are an expert engineering research assistant with access to tools for analyzing technical documents. You help engineers understand BMS, HVAC, Electrical, Fire Alarm, MEP, and other engineering documents.

You have access to the following tools:
- list_documents: List all documents in the current project with their IDs, names, types, and sizes.
- search_documents: Search for keywords across all non-PDF documents. Returns matching passages with source citations.
- read_document: Read the full text of a specific document (by ID). For PDFs, this uses AI vision to extract text.

RESEARCH WORKFLOW (follow this every time):
1. ALWAYS start by calling list_documents to see what documents are available.
2. Use search_documents to find relevant passages for the user's question. Try different keywords if the first search returns nothing.
3. If search returns no results or you need more detail, call read_document on specific documents (especially PDFs, which are not searchable).
4. After gathering enough information from the tools, provide a comprehensive, well-structured answer.

CITATION FORMAT:
For every fact you state from a document, include a citation in this exact format: [[Document Name, Page X]]
If the answer is not in the documents, say "This information was not found in the uploaded documents."

RULES:
- Be precise with numbers, units, and technical values. Do not guess or fabricate information.
- If a tool returns an error, try a different approach (different keywords, different document).
- You can call multiple tools in a single step if it helps you research faster.
- Always cite your sources — don't present information without indicating where it came from.
- Respond in the same language the user asks in (English or Bengali).
- Format your final answer in Markdown for readability.
- Do NOT mention the tools themselves in your answer — just present the findings naturally.`;

export interface AgentResult {
  /** The final answer text (with citations). */
  response: string;
  /** Step-by-step log of which tools the agent called — for the UI. */
  toolCallLog: ToolCallLogEntry[];
}

/**
 * Runs the agentic research loop for a user's question.
 *
 * @param userMessage   The user's question.
 * @param history       Previous conversation turns (user/assistant only).
 * @param ctx           Tool context (project ID, owner ID, AI settings).
 * @returns             The final answer + a log of tool calls made.
 */
export async function runAgent(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ctx: ToolContext,
): Promise<AgentResult> {
  // Build the initial conversation: system prompt → history → new question
  const messages: AgentMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const toolCallLog: ToolCallLogEntry[] = [];
  const settings: AISettings = ctx.settings;

  for (let step = 0; step < MAX_ITERATIONS; step++) {
    // PLAN + REFLECT — ask the LLM what to do next
    let result;
    try {
      result = await generateWithTools(messages, AGENT_TOOLS, undefined, settings);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // If this is the first step, we have no fallback — rethrow
      if (step === 0) throw err;
      // Otherwise, try to synthesize from what we have
      return {
        response: `I encountered an error while researching: ${errMsg}\n\nHere is what I found so far:\n\n${messages.filter((m) => m.role === 'assistant' && m.content).map((m) => m.content).join('\n\n')}`,
        toolCallLog,
      };
    }

    // If the LLM is done (no tool calls, has text) → return the answer
    if (result.toolCalls.length === 0 && result.text) {
      return { response: result.text, toolCallLog };
    }

    // If the LLM produced nothing at all → we're stuck
    if (result.toolCalls.length === 0 && !result.text) {
      return {
        response: 'I was unable to generate a response. Please try rephrasing your question.',
        toolCallLog,
      };
    }

    // ACT — record the assistant's step (text + tool calls) in the conversation
    messages.push({
      role: 'assistant',
      content: result.text || '',
      toolCalls: result.toolCalls,
    });

    // OBSERVE — execute each tool call and feed results back
    for (const tc of result.toolCalls) {
      let toolResult: string;
      try {
        toolResult = await executeTool(tc.name, tc.args, ctx);
      } catch (err) {
        toolResult = `Error executing tool "${tc.name}": ${err instanceof Error ? err.message : String(err)}`;
      }

      // Add the tool result to the conversation
      messages.push({
        role: 'tool',
        content: toolResult,
        toolCallId: tc.id,
        toolName: tc.name,
      });

      // Log for the UI
      toolCallLog.push({
        step,
        tool: tc.name,
        args: tc.args,
        resultSummary: toolResult.slice(0, 200),
      });
    }

    // If the LLM also produced text alongside tool calls, and this is the
    // last allowed iteration, return that text as the answer.
    if (step === MAX_ITERATIONS - 1 && result.text) {
      return {
        response: result.text + '\n\n*(Note: reached maximum research depth)*',
        toolCallLog,
      };
    }
  }

  // Max iterations reached without a final answer — synthesize from tool results
  const assistantTexts = messages
    .filter((m) => m.role === 'assistant' && m.content)
    .map((m) => m.content);

  return {
    response:
      assistantTexts.length > 0
        ? `Based on my research:\n\n${assistantTexts.join('\n\n')}`
        : 'I reached the maximum number of research steps but was unable to find a complete answer. Please try rephrasing your question or uploading more relevant documents.',
    toolCallLog,
  };
}
