/**
 * `anchored-mcp` — MCP server exposing task-file mutations as typed tools.
 *
 * Started by Claude Code via `npx -y @chaafoo/anchored-mcp` after the plugin
 * is installed (declared in plugin/.mcp.json). Communicates over stdio
 * per the MCP protocol.
 *
 * All tools are thin wrappers around the service-layer ops in src/ops/.
 * Same code path as the CLI; different transport.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { ALL_TOOLS, type AnchoredTool } from './tools/index.js';

const server = new Server(
  {
    // serverInfo.name — matches the namespace key in .mcp.json so the
    // tool prefix in Claude Code is mcp__task__*. The package is still
    // @chaafoo/anchored-mcp; the brand stays "anchored", but the in-chat
    // namespace is the shorter "task" since every tool operates on the
    // task-file.
    name: 'task',
    version: '0.2.0',
  },
  {
    capabilities: { tools: {} },
  },
);

// ─────────────────────────────────────────────────────────────────────
// List available tools
// ─────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

// ─────────────────────────────────────────────────────────────────────
// Dispatch tool calls
// ─────────────────────────────────────────────────────────────────────

const toolsByName = new Map<string, AnchoredTool>(ALL_TOOLS.map((t) => [t.name, t]));

server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
  const { name, arguments: args } = req.params;
  const tool = toolsByName.get(name);
  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: `unknown tool: ${name}. Available: ${[...toolsByName.keys()].join(', ')}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await tool.handler(args ?? {});
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: unknown) {
    return formatErrorResponse(err);
  }
});

/**
 * Convert a thrown service-layer error into an MCP tool-error response.
 *
 * Surfaces typed-error metadata so calling agents can read recovery
 * suggestions programmatically without parsing the text message:
 *
 *   - `content[0].text` — human-readable error message
 *   - `content[1].text` — bulleted "Suggestions:" block (when present)
 *   - `_meta` — structured `{ name, suggestions: string[] }` for
 *     agents that prefer the typed surface over text parsing
 */
function formatErrorResponse(err: unknown): CallToolResult {
  const errorName = err instanceof Error ? err.name : 'Error';
  const message = err instanceof Error ? err.message : String(err);
  const suggestions =
    err && typeof err === 'object' && 'suggestions' in err
      ? (err as { suggestions: unknown }).suggestions
      : undefined;
  const suggestionsArr =
    Array.isArray(suggestions) && suggestions.every((s) => typeof s === 'string')
      ? (suggestions as string[])
      : [];

  const content: CallToolResult['content'] = [{ type: 'text', text: `${errorName}: ${message}` }];
  if (suggestionsArr.length > 0) {
    const bulleted = suggestionsArr.map((s) => `  - ${s}`).join('\n');
    content.push({
      type: 'text',
      text: `\nSuggestions:\n${bulleted}`,
    });
  }

  return {
    content,
    isError: true,
    _meta: {
      error: {
        name: errorName,
        suggestions: suggestionsArr,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Log to stderr (stdout is the MCP transport channel)
process.stderr.write('anchored-mcp v0.2.0 ready\n');
