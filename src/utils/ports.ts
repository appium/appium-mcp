import net from 'node:net';

/**
 * Ports handed out by {@link findFreePort} during the lifetime of this process.
 *
 * Binding to port 0 asks the OS for a free port, but the OS releases it the
 * instant we close the probe socket. Two session creations running in parallel
 * can therefore be assigned the same "free" port before either driver actually
 * binds it. Tracking what we've already handed out lets concurrent embedded
 * sessions get distinct ports even within that race window.
 */
const reservedPorts = new Set<number>();

/**
 * Ask the OS for a currently-free TCP port by binding to port 0 on loopback.
 */
function probeEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port =
        address && typeof address === 'object' ? address.port : undefined;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
        } else if (!port) {
          reject(new Error('Failed to determine a free port'));
        } else {
          resolve(port);
        }
      });
    });
  });
}

/**
 * Allocate a free TCP port that has not already been handed out by this process.
 *
 * Used to assign driver ports (e.g. `systemPort`, `wdaLocalPort`,
 * `mjpegServerPort`) for embedded sessions so that parallel sessions running in
 * the same MCP process don't collide on the drivers' fixed default ports.
 *
 * @param maxAttempts - How many times to retry if the OS hands back a port we
 * have already reserved for another session.
 */
export async function findFreePort(maxAttempts = 50): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = await probeEphemeralPort();
    if (!reservedPorts.has(port)) {
      reservedPorts.add(port);
      return port;
    }
  }
  throw new Error(
    `Unable to allocate a free port after ${maxAttempts} attempts`
  );
}

/**
 * Release a port previously reserved by {@link findFreePort} so it can be reused.
 *
 * Call this once session creation settles: on success the driver has bound the
 * port (the OS itself now prevents reuse), and on failure the port is genuinely
 * free again — either way the reservation has served its only purpose of guarding
 * the creation window, and keeping it would leak the entry and waste the port.
 */
export function releaseReservedPort(port: number): void {
  reservedPorts.delete(port);
}

/** Release several reserved ports at once (see {@link releaseReservedPort}). */
export function releaseReservedPorts(ports: Iterable<number>): void {
  for (const port of ports) {
    reservedPorts.delete(port);
  }
}

/** Snapshot of currently-reserved ports — for diagnostics and tests. */
export function reservedPortCount(): number {
  return reservedPorts.size;
}
