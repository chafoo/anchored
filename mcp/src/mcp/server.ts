#!/usr/bin/env node
/**
 * `anchored-mcp` — MCP server exposing task-file mutations as typed tools.
 *
 * Started by Claude Code via `npx -y @anchored/mcp` after the plugin
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
    name: 'anchored',
    version: '0.2.0-alpha.0',
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

const toolsByName = new Map<string, AnchoredTool>(
  ALL_TOOLS.map((t) => [t.name, t]),
);

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
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
});

// ─────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Log to stderr (stdout is the MCP transport channel)
process.stderr.write('anchored-mcp v0.2.0-alpha.0 ready\n');
