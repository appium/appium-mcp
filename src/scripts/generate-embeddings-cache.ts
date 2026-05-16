/**
 * Generate the embeddings cache for the currently configured model.
 *
 * Idempotent: if a valid cache already exists for the current model and the
 * fingerprint matches documents.json, this exits quickly. Otherwise it
 * embeds all chunks and writes the cache.
 *
 * Intended for the maintainer release flow:
 *   npm run build && npm run generate-cache
 * to ensure the published tarball ships a warm cache for the default model.
 */

import { queryVectorStore } from '../tools/documentation/simple-pdf-indexer.js';

const start = Date.now();
try {
  // A single query forces the cold-start path inside queryVectorStore, which
  // checks the cache and embeds+saves on miss. We don't care about results.
  await queryVectorStore('warmup', 1);
  console.log(`Embeddings cache ready (${Date.now() - start}ms)`);
} catch (err) {
  console.error('Failed to generate embeddings cache:', err);
  process.exit(1);
}
