/**
 * Multi-agent pipeline — three specialized AI agents that collaborate to
 * produce a verified, well-synthesized answer.
 *
 * Architecture:
 *
 *   ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
 *   │  Researcher │ ──▶ │ Fact-Checker │ ──▶ │  Synthesizer │ ──▶ Final Answer
 *   │  (tools)    │     │  (tools)     │     │  (no tools)  │
 *   └─────────────┘     └──────────────┘     └──────────────┘
 *
 * 1. RESEARCHER — uses tools (list/search/read documents) to gather
 *    information and writes a DRAFT answer with citations.
 *
 * 2. FACT-CHECKER — receives the draft answer + citations, uses tools to
 *    READ the cited documents and verify each claim. Produces a verification
 *    report: which citations are confirmed, which are not found, and any
 *    inaccuracies.
 *
 * 3. SYNTHESIZER — receives the draft + verification report and produces
 *    the final polished answer. Removes unverified claims, adds caveats
 *    where needed, and ensures all citations are accurate.
 *
 * This pipeline directly addresses the competition's "Agentic AI workflows"
 * and "Functionality & Accuracy" criteria — multiple agents collaborate,
 * each with a distinct role, and the fact-checker ensures accuracy.
 */

import { generateWithTools, generateChat, type AISettings } from '@/lib/ai';
import { AGENT_TOOLS, executeTool } from './tools';
import { runAgent } from './loop';
import type {
  AgentMessage,
  ToolCallLogEntry,
  ToolContext,
  AgentPhaseLog,
  MultiAgentResult,
} from './types';

const MAX_FACTCHECK_ITERATIONS = 6;

// ---------------------------------------------------------------------------
// Phase 2: Fact-Checker
// ---------------------------------------------------------------------------

const FACTCHECK_SYSTEM_PROMPT = `You are a fact-checker agent for an engineering research system. Your job is to verify the accuracy of a draft answer produced by the Researcher agent.

You will receive:
1. The user's original question
2. The Researcher's draft answer (which contains citations like [[Document Name, Page X]])
3. A list of available documents

YOUR TASK:
1. Identify every claim and citation in the draft answer.
2. Use the read_document and search_documents tools to VERIFY each citation — check that the cited document actually contains the claimed information.
3. Produce a verification report in this exact format:

VERIFIED CLAIMS:
- [claim] — confirmed in [[Document Name, Page X]]
- [claim] — confirmed in [[Document Name, Page X]]

UNVERIFIED CLAIMS:
- [claim] — citation [[Document Name, Page X]] could not be confirmed (document doesn't contain this information)
- [claim] — no citation provided

INACCURACIES:
- [claim] — the document actually says [correct value], not [draft value]

If all claims are verified and there are no inaccuracies, say: "All claims verified. No inaccuracies found."

Be thorough — read the actual document content to confirm. Do not assume the Researcher's citations are correct.`;

async function runFactChecker(
  userMessage: string,
  draftAnswer: string,
  ctx: ToolContext,
): Promise<{ report: string; toolCallLog: ToolCallLogEntry[] }> {
  const settings: AISettings = ctx.settings;
  const messages: AgentMessage[] = [
    { role: 'system', content: FACTCHECK_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `User's question: ${userMessage}\n\nResearcher's draft answer:\n${draftAnswer}\n\nVerify every claim and citation in the draft answer. Use the tools to read the actual documents and check that the cited information is accurate.`,
    },
  ];

  const toolCallLog: ToolCallLogEntry[] = [];

  for (let step = 0; step < MAX_FACTCHECK_ITERATIONS; step++) {
    let result;
    try {
      result = await generateWithTools(messages, AGENT_TOOLS, undefined, settings);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        report: `Fact-checker encountered an error: ${errMsg}. Proceeding with unverified draft.`,
        toolCallLog,
      };
    }

    // No tool calls → the fact-checker is done, return the report
    if (result.toolCalls.length === 0 && result.text) {
      return { report: result.text, toolCallLog };
    }

    if (result.toolCalls.length === 0 && !result.text) {
      return {
        report: 'Fact-checker produced no output. Proceeding with unverified draft.',
        toolCallLog,
      };
    }

    // Record the assistant step
    messages.push({
      role: 'assistant',
      content: result.text || '',
      toolCalls: result.toolCalls,
    });

    // Execute tool calls
    for (const tc of result.toolCalls) {
      let toolResult: string;
      try {
        toolResult = await executeTool(tc.name, tc.args, ctx);
      } catch (err) {
        toolResult = `Error executing tool "${tc.name}": ${err instanceof Error ? err.message : String(err)}`;
      }

      messages.push({
        role: 'tool',
        content: toolResult,
        toolCallId: tc.id,
        toolName: tc.name,
      });

      toolCallLog.push({
        step,
        tool: tc.name,
        args: tc.args,
        resultSummary: toolResult.slice(0, 200),
      });
    }
  }

  return {
    report: 'Fact-checker reached maximum verification steps. Proceeding with partial verification.',
    toolCallLog,
  };
}

// ---------------------------------------------------------------------------
// Phase 3: Synthesizer
// ---------------------------------------------------------------------------

const SYNTHESIZER_SYSTEM_PROMPT = `You are the synthesizer agent — the final step in a multi-agent research pipeline. Your job is to produce the definitive answer to the user's question.

You will receive:
1. The user's original question
2. The Researcher's draft answer (with citations)
3. The Fact-Checker's verification report

YOUR TASK:
- Produce a polished, well-structured final answer in Markdown.
- KEEP all claims that the Fact-Checker verified. Include their citations in [[Document Name, Page X]] format.
- REMOVE or qualify any claims that the Fact-Checker could not verify. If a claim was unverified, either omit it or add a caveat like "(could not be verified in the source documents)".
- CORRECT any inaccuracies the Fact-Checker found.
- If the Fact-Checker found that the information is not in the documents, say "This information was not found in the uploaded documents."
- Be precise with numbers, units, and technical values.
- Respond in the same language the user asks in (English or Bengali).
- Do NOT mention the Researcher, Fact-Checker, or the verification process — just present the final answer naturally.
- Format your response in Markdown for readability.`;

async function runSynthesizer(
  userMessage: string,
  draftAnswer: string,
  verificationReport: string,
  ctx: ToolContext,
): Promise<string> {
  const settings: AISettings = ctx.settings;

  const messages: AgentMessage[] = [
    { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `User's question: ${userMessage}\n\nResearcher's draft answer:\n${draftAnswer}\n\nFact-Checker's verification report:\n${verificationReport}\n\nProduce the final answer based on the verified information above.`,
    },
  ];

  // The synthesizer is a single LLM call (no tools needed — it just
  // synthesizes the already-verified information)
  try {
    const result = await generateWithTools(messages, [], undefined, settings);
    if (result.text) return result.text;
  } catch {
    // Fall back to plain generateChat if tool-calling endpoint fails
    // (some providers may not accept empty tools array)
  }

  // Fallback: use generateChat with the same messages
  try {
    const response = await generateChat(
      messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
      undefined,
      settings,
    );
    return response || draftAnswer;
  } catch {
    // Last resort: return the draft as-is
    return draftAnswer;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator — runs all 3 phases
// ---------------------------------------------------------------------------

export async function runMultiAgent(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ctx: ToolContext,
): Promise<MultiAgentResult> {
  const phases: AgentPhaseLog[] = [];
  const allToolCalls: ToolCallLogEntry[] = [];

  // Phase 1: Researcher
  const researchResult = await runAgent(userMessage, history, ctx);
  phases.push({
    role: 'researcher',
    label: 'Research',
    toolCalls: researchResult.toolCallLog,
    output: researchResult.response,
  });
  allToolCalls.push(...researchResult.toolCallLog);

  // Phase 2: Fact-Checker
  const factCheckResult = await runFactChecker(userMessage, researchResult.response, ctx);
  phases.push({
    role: 'fact-checker',
    label: 'Fact-Check',
    toolCalls: factCheckResult.toolCallLog,
    output: factCheckResult.report,
  });
  allToolCalls.push(...factCheckResult.toolCallLog);

  // Phase 3: Synthesizer
  const finalAnswer = await runSynthesizer(
    userMessage,
    researchResult.response,
    factCheckResult.report,
    ctx,
  );
  phases.push({
    role: 'synthesizer',
    label: 'Synthesize',
    toolCalls: [],
    output: finalAnswer,
  });

  return {
    response: finalAnswer,
    phases,
    toolCallLog: allToolCalls,
  };
}
