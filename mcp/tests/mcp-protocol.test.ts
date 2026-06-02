/**
 * MCP protocol smoke test — spawns the built MCP server as a
 * subprocess, sends JSON-RPC messages over stdio, verifies it
 * responds with the expected shape and registers all 9 tools.
 *
 * Would have caught: SyntaxError on double-shebang (server couldn't
 * even initialize), missing exec-bit (server wouldn't start), and
 * any future breakage of MCP protocol compliance.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', 'dist/mcp/server.js');

interface JsonRpc {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: any;
  error?: any;
}

function spawnServerAndExchange(messages: JsonRpc[]): Promise<JsonRpc[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5_000,
    });
    const responses: JsonRpc[] = [];
    let buffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          responses.push(JSON.parse(line));
        } catch {
          // ignore non-JSON output (e.g. "ready" banner)
        }
      }
    });

    child.on('error', reject);
    child.on('exit', () => resolve(responses));

    for (const msg of messages) {
      child.stdin.write(JSON.stringify(msg) + '\n');
    }
    // Give the server time to respond, then close stdin
    setTimeout(() => child.stdin.end(), 500);
  });
}

beforeAll(() => {
  if (!existsSync(SERVER)) {
    execSync('npm run build', { cwd: join(__dirname, '..'), stdio: 'inherit' });
  }
}, 60_000);

describe('MCP server protocol', () => {
  it('responds to initialize with protocol + capabilities', async () => {
    const responses = await spawnServerAndExchange([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      },
    ]);
    const init = responses.find((r) => r.id === 1);
    expect(init, 'should receive initialize response').toBeDefined();
    expect(init?.result?.protocolVersion).toBe('2024-11-05');
    expect(init?.result?.capabilities).toBeDefined();
    expect(init?.result?.serverInfo?.name).toBe('task');
  }, 10_000);

  it('lists all 38 expected tools', async () => {
    const responses = await spawnServerAndExchange([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    const list = responses.find((r) => r.id === 2);
    expect(list, 'should receive tools/list response').toBeDefined();
    const toolNames = (list?.result?.tools ?? []).map((t: { name: string }) => t.name);
    const expected = [
      // task-lifecycle (4)
      'task__create',
      'task__read',
      'task__set_task_status',
      'task__set_title',
      // question — V0.3 structured Q&A (4)
      'task__question_add',
      'task__question_list',
      'task__question_resolve',
      'task__question_retag',
      // context (8)
      'task__set_intro',
      'task__append_plan',
      'task__resolve_question',
      'task__append_build_section',
      'task__set_build_section',
      'task__set_wrap_intro',
      'task__append_wrap_section',
      'task__set_wrap_section',
      // phase (11)
      'task__list_phases',
      'task__next_phase',
      'task__add_phase',
      'task__remove_phase',
      'task__move_phase',
      'task__set_phase_status',
      'task__set_phase_executor',
      'task__set_phase_name',
      'task__set_phase_context',
      'task__set_phase_rules',
      'task__increment_retry',
      // ac (8)
      'task__add_ac',
      'task__remove_ac',
      'task__set_ac_text',
      'task__set_evidence',
      'task__add_evidence',
      'task__set_failures',
      'task__clear_failures',
      'task__set_ac_status',
      // field (3)
      'task__list_fields',
      'task__set_field',
      'task__get_field',
    ];
    expect(toolNames.sort()).toEqual(expected.sort());
    expect(toolNames.length).toBe(38);
  }, 10_000);

  it('each tool has a description and inputSchema', async () => {
    const responses = await spawnServerAndExchange([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    const tools = responses.find((r) => r.id === 2)?.result?.tools ?? [];
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.description, `tool ${tool.name} needs description`).toBeTruthy();
      expect(tool.inputSchema, `tool ${tool.name} needs inputSchema`).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  }, 10_000);

  it('error responses include suggestions in content + _meta', async () => {
    // Invoke `read` against a non-existent task → server should return
    // an isError response with the suggestions surfaced both as a
    // text content block AND in _meta.error.suggestions for agents.
    const responses = await spawnServerAndExchange([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'task__read',
          arguments: {
            slug: 'does-not-exist',
            project_root: '/tmp/anchored-mcp-error-probe',
          },
        },
      },
    ]);
    const errResponse = responses.find((r) => r.id === 2);
    expect(errResponse, 'should receive tools/call response').toBeDefined();
    expect(errResponse?.result?.isError).toBe(true);

    // text-content surface — human-readable bulleted suggestions
    const texts = (errResponse?.result?.content ?? [])
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text);
    expect(texts.some((t: string) => /Suggestions:/.test(t))).toBe(true);

    // _meta surface — typed suggestions array for programmatic agents
    const meta = errResponse?.result?._meta?.error;
    expect(meta).toBeDefined();
    expect(meta?.name).toBe('NotFound');
    expect(Array.isArray(meta?.suggestions)).toBe(true);
    expect(meta?.suggestions.length).toBeGreaterThan(0);
  }, 10_000);
});
