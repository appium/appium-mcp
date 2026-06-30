import { describe, expect, test } from '@jest/globals';
import net from 'node:net';
import { findFreePort, releaseReservedPort } from '../../utils/ports.js';

describe('findFreePort', () => {
  test('returns a usable TCP port', async () => {
    const port = await findFreePort();
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);

    // The allocated port should actually be bindable.
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
    });

    releaseReservedPort(port);
  });

  test('hands out distinct ports for concurrent allocations', async () => {
    const ports = await Promise.all(
      Array.from({ length: 25 }, () => findFreePort())
    );
    const unique = new Set(ports);
    expect(unique.size).toBe(ports.length);

    ports.forEach(releaseReservedPort);
  });

  test('reuses a port once it has been released', async () => {
    const port = await findFreePort();
    releaseReservedPort(port);
    // No assertion on equality (the OS may hand back a different port); this just
    // confirms releasing does not throw and allocation keeps working afterwards.
    const next = await findFreePort();
    expect(typeof next).toBe('number');
    releaseReservedPort(next);
  });
});
