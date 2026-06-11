import http from 'node:http';
import { promisify } from 'node:util';

export type OtlpRequest = {
  body: unknown;
  headers: http.IncomingHttpHeaders;
  method?: string;
  url?: string;
};

export type OtlpHttpReceiver = {
  endpoint: string;
  requests: OtlpRequest[];
  close(): Promise<void>;
};

export async function startOtlpHttpReceiver(): Promise<OtlpHttpReceiver> {
  const requests: OtlpRequest[] = [];

  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    request.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      requests.push({
        body: rawBody.length > 0 ? JSON.parse(rawBody) : undefined,
        headers: request.headers,
        method: request.method,
        url: request.url,
      });

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to start OTLP HTTP receiver');
  }

  const closeServer = promisify(server.close.bind(server));

  return {
    endpoint: `http://127.0.0.1:${address.port}/v1/traces`,
    requests,
    close: async () => {
      await closeServer();
    },
  };
}
