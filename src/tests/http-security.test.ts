import {createServer} from 'node:net';

import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';
import {FastMCP} from 'fastmcp';
import {z} from 'zod';

import {createHttpOriginPolicy} from '../http-security.js';

test('allows the request-less stdio authentication hook', async () => {
  await expect(createHttpOriginPolicy('').authenticate()).resolves.toEqual({});
});

describe.each(['', 'https://trusted.example,http://localhost:3000'])(
  'HTTP Origin protection with allowlist %j',
  (origins) => {
    const policy = createHttpOriginPolicy(origins);
    const server = new FastMCP({
      name: 'origin-regression',
      version: '1.0.0',
      authenticate: policy.authenticate,
    });
    let endpoint: string;
    let sessionId: string;
    let calls = 0;
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'test', version: '1'}},
    };
    const invoke = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {name: 'probe', arguments: {}},
    };
    const headers = {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'};

    beforeAll(async () => {
      const reservation = createServer();
      await new Promise<void>((resolve, reject) => {
        reservation.once('error', reject);
        reservation.listen(0, '127.0.0.1', resolve);
      });
      const address = reservation.address();
      if (!address || typeof address === 'string') {
        throw new Error('Missing test port');
      }
      const port = address.port;
      await new Promise<void>((resolve, reject) => reservation.close((error) => (error ? reject(error) : resolve())));
      endpoint = `http://127.0.0.1:${port}/sse`;
      server.addTool({name: 'probe', parameters: z.object({}), execute: async () => String(++calls)});
      await server.start({
        transportType: 'httpStream',
        httpStream: {host: '127.0.0.1', port, endpoint: '/sse', cors: policy.cors},
      });
      const response = await fetch(endpoint, {method: 'POST', headers, body: JSON.stringify(initialize)});
      expect(response.status).toBe(200);
      sessionId = response.headers.get('mcp-session-id') ?? '';
      expect(sessionId).toBeTruthy();
      await response.text();
    });

    afterAll(async () => server.stop());

    test.each([
      'https://evil.example',
      'http://localhost:9000',
      'https://trusted.example.evil.example',
      'http://trusted.example',
      'https://trusted.example:444',
      'null',
      '',
    ])('rejects initialization from Origin %j', async (origin) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {...headers, Origin: origin},
        body: JSON.stringify(initialize),
      });
      expect(response.status).toBe(403);
      expect(response.headers.has('access-control-allow-origin')).toBe(false);
      expect(response.headers.has('mcp-session-id')).toBe(false);
      await response.text();
    });

    test.each(['POST', 'GET', 'DELETE'])('rejects %s even with an existing session', async (method) => {
      const before = calls;
      const response = await fetch(endpoint, {
        method,
        headers: {...headers, Origin: 'https://evil.example', 'Mcp-Session-Id': sessionId},
        ...(method === 'POST' ? {body: JSON.stringify(invoke)} : {}),
      });
      expect(response.status).toBe(403);
      await response.text();
      expect(calls).toBe(before);
    });

    test('does not grant preflight permission', async () => {
      const response = await fetch(endpoint, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,mcp-session-id',
        },
      });
      expect(response.headers.has('access-control-allow-origin')).toBe(false);
      if (!origins) {
        expect(response.headers.has('access-control-allow-headers')).toBe(false);
      }
      await response.text();
    });

    test.each(['https://trusted.example', 'http://localhost:3000'])(
      'only grants configured origin %s',
      async (origin) => {
        const preflight = await fetch(endpoint, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,mcp-session-id',
          },
        });
        expect(preflight.headers.get('access-control-allow-origin')).toBe(origins ? origin : null);
        if (origins) {
          expect(preflight.headers.get('access-control-allow-headers')).toMatch(/mcp-session-id/i);
          expect(preflight.headers.get('vary')).toMatch(/origin/i);
        }
        await preflight.text();
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {...headers, Origin: origin, 'Mcp-Session-Id': sessionId},
          body: JSON.stringify(invoke),
        });
        expect(response.status).toBe(origins ? 200 : 403);
        expect(response.headers.get('access-control-allow-origin')).toBe(origins ? origin : null);
        await response.text();
        const initialized = await fetch(endpoint, {
          method: 'POST',
          headers: {...headers, Origin: origin},
          body: JSON.stringify(initialize),
        });
        expect(initialized.status).toBe(origins ? 200 : 403);
        const browserSession = initialized.headers.get('mcp-session-id');
        await initialized.text();
        if (origins) {
          expect(browserSession).toBeTruthy();
          expect(initialized.headers.get('access-control-expose-headers')).toMatch(/mcp-session-id/i);
          const deleted = await fetch(endpoint, {
            method: 'DELETE',
            headers: {...headers, Origin: origin, 'Mcp-Session-Id': browserSession ?? ''},
          });
          expect(deleted.status).toBe(200);
          await deleted.text();
        }
      },
    );

    test('allows native client tool calls and preserves the session after rejected DELETE', async () => {
      const before = calls;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {...headers, 'Mcp-Session-Id': sessionId},
        body: JSON.stringify(invoke),
      });
      expect(response.status).toBe(200);
      await response.text();
      expect(calls).toBe(before + 1);
    });
  },
);

test.each([
  '*',
  'null',
  'https://*.example',
  'https://trusted.example/',
  'https://trusted.example/path',
  'https://user:pass@trusted.example',
  'https://trusted.example?x=1',
  'https://trusted.example#x',
  'file:///tmp',
  'https://trusted.example,',
])('rejects invalid allowlist %s', (raw) => {
  expect(() => createHttpOriginPolicy(raw)).toThrow('APPIUM_MCP_ALLOWED_ORIGINS');
});
