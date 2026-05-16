/**
 * RAG retrieval eval harness for the Appium documentation tool.
 *
 * Usage (after `npm run build`):
 *   node dist/scripts/eval-documentation-rag.js [--quiet] [--save] [--top-chunks=N]
 *
 * What it does:
 *   1. Loads the eval dataset (src/scripts/rag-eval-dataset.json).
 *   2. For each query, calls the existing queryVectorStore() with `topChunks`
 *      chunks (default 30), dedupes by source (preserving rank), and matches
 *      the resulting source list against expectedSources.
 *   3. Reports Recall@{1,3,5,10} and MRR, broken down by difficulty.
 *   4. Persists results to src/scripts/eval-results/<ISO>.json plus a
 *      `latest.json` so successive runs can be diffed.
 *
 * Notes:
 *   - The first run after a server restart pays the embedding cold start
 *     (~30-60s for the current corpus).
 *   - Match strategy: a retrieved source matches an expected source if its
 *     `relativePath` ends with the expected path (case-sensitive).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { queryVectorStore } from '../tools/documentation/simple-pdf-indexer.js';

interface EvalQuery {
  id: string;
  query: string;
  expectedSources: string[];
  difficulty: 'easy' | 'medium' | 'vague';
  category?: string;
}

interface EvalDataset {
  version: number;
  description: string;
  matchMode?: 'endsWith' | 'exact';
  queries: EvalQuery[];
}

interface PerQueryResult {
  id: string;
  query: string;
  difficulty: EvalQuery['difficulty'];
  category?: string;
  expectedSources: string[];
  retrievedSources: string[];
  matchedAtRank: number | null;
  matchedSource: string | null;
  recallAt1: 0 | 1;
  recallAt3: 0 | 1;
  recallAt5: 0 | 1;
  recallAt10: 0 | 1;
  reciprocalRank: number;
}

interface AggregateMetrics {
  count: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
}

interface EvalRun {
  timestamp: string;
  datasetVersion: number;
  topChunks: number;
  overall: AggregateMetrics;
  byDifficulty: Record<string, AggregateMetrics>;
  perQuery: PerQueryResult[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = new Set(process.argv.slice(2));
const QUIET = args.has('--quiet');
const NO_SAVE = !args.has('--save');
const topChunksArg = process.argv.find((a) => a.startsWith('--top-chunks='));
const TOP_CHUNKS = topChunksArg ? Number(topChunksArg.split('=')[1]) : 30;

function resolveDatasetPath(): string {
  // When compiled, this file lives in dist/scripts/. We look for the dataset
  // beside it first (copy-docs build step), then fall back to src/scripts/.
  const candidates = [
    path.resolve(__dirname, 'rag-eval-dataset.json'),
    path.resolve(__dirname, '../../src/scripts/rag-eval-dataset.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(
    `Could not find rag-eval-dataset.json in any of: ${candidates.join(', ')}`
  );
}

function resolveResultsDir(): string {
  // Always write results into the source tree so they're easy to diff/commit.
  const candidates = [
    path.resolve(__dirname, '../../src/scripts/eval-results'),
    path.resolve(__dirname, 'eval-results'),
  ];
  const dir = candidates[0];
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function matches(retrievedRelPath: string, expected: string): boolean {
  return retrievedRelPath === expected || retrievedRelPath.endsWith(expected);
}

function dedupeBySource(
  chunks: Array<{ relativePath: string | undefined }>
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const c of chunks) {
    const src = c.relativePath;
    if (!src || seen.has(src)) {
      continue;
    }
    seen.add(src);
    ordered.push(src);
  }
  return ordered;
}

function evalQuery(
  retrievedSources: string[],
  expectedSources: string[]
): {
  matchedAtRank: number | null;
  matchedSource: string | null;
} {
  for (let i = 0; i < retrievedSources.length; i++) {
    const hit = expectedSources.find((e) => matches(retrievedSources[i], e));
    if (hit) {
      return { matchedAtRank: i + 1, matchedSource: retrievedSources[i] };
    }
  }
  return { matchedAtRank: null, matchedSource: null };
}

function aggregate(results: PerQueryResult[]): AggregateMetrics {
  if (results.length === 0) {
    return {
      count: 0,
      recallAt1: 0,
      recallAt3: 0,
      recallAt5: 0,
      recallAt10: 0,
      mrr: 0,
    };
  }
  const n = results.length;
  const sum = (k: keyof PerQueryResult): number =>
    results.reduce((acc, r) => acc + (r[k] as number), 0);
  return {
    count: n,
    recallAt1: sum('recallAt1') / n,
    recallAt3: sum('recallAt3') / n,
    recallAt5: sum('recallAt5') / n,
    recallAt10: sum('recallAt10') / n,
    mrr: sum('reciprocalRank') / n,
  };
}

function fmt(n: number): string {
  return n.toFixed(3);
}

function rankStr(rank: number | null): string {
  return rank === null ? ' - ' : String(rank).padStart(3, ' ');
}

function printPerQueryTable(results: PerQueryResult[]): void {
  const rows = results.map((r) => ({
    id: r.id,
    diff: r.difficulty,
    rank: rankStr(r.matchedAtRank),
    query: r.query.length > 56 ? r.query.slice(0, 53) + '...' : r.query,
    matched: r.matchedSource ?? '(none of expected found in top results)',
  }));

  const widths = {
    id: 4,
    diff: 7,
    rank: 4,
    query: Math.max(...rows.map((r) => r.query.length), 5),
    matched: Math.max(...rows.map((r) => r.matched.length), 7),
  };

  const header = `${'id'.padEnd(widths.id)} | ${'diff'.padEnd(widths.diff)} | ${'rank'.padStart(widths.rank)} | ${'query'.padEnd(widths.query)} | matched`;
  const sep = '-'.repeat(header.length + 10);

  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(widths.id)} | ${r.diff.padEnd(widths.diff)} | ${r.rank.padStart(widths.rank)} | ${r.query.padEnd(widths.query)} | ${r.matched}`
    );
  }
  console.log(sep);
}

function printAggregate(label: string, m: AggregateMetrics): void {
  const tag = `${label} (n=${m.count})`.padEnd(20);
  console.log(
    `${tag}  R@1=${fmt(m.recallAt1)}  R@3=${fmt(m.recallAt3)}  R@5=${fmt(m.recallAt5)}  R@10=${fmt(m.recallAt10)}  MRR=${fmt(m.mrr)}`
  );
}

async function runEval(): Promise<void> {
  const datasetPath = resolveDatasetPath();
  const dataset: EvalDataset = JSON.parse(
    fs.readFileSync(datasetPath, 'utf-8')
  );

  if (!QUIET) {
    console.log(`\n=== Appium RAG eval ===`);
    console.log(`Dataset: ${datasetPath}`);
    console.log(
      `Queries: ${dataset.queries.length}   |   topChunks: ${TOP_CHUNKS}   |   match: endsWith\n`
    );
  }

  const perQuery: PerQueryResult[] = [];

  for (const q of dataset.queries) {
    const docs = await queryVectorStore(q.query, TOP_CHUNKS);
    const retrievedSources = dedupeBySource(
      docs.map((d) => ({
        relativePath:
          (d.metadata?.relativePath as string | undefined) ??
          (d.metadata?.filename as string | undefined) ??
          (d.metadata?.source as string | undefined),
      }))
    );

    const { matchedAtRank, matchedSource } = evalQuery(
      retrievedSources,
      q.expectedSources
    );

    perQuery.push({
      id: q.id,
      query: q.query,
      difficulty: q.difficulty,
      category: q.category,
      expectedSources: q.expectedSources,
      retrievedSources,
      matchedAtRank,
      matchedSource,
      recallAt1: matchedAtRank !== null && matchedAtRank <= 1 ? 1 : 0,
      recallAt3: matchedAtRank !== null && matchedAtRank <= 3 ? 1 : 0,
      recallAt5: matchedAtRank !== null && matchedAtRank <= 5 ? 1 : 0,
      recallAt10: matchedAtRank !== null && matchedAtRank <= 10 ? 1 : 0,
      reciprocalRank: matchedAtRank !== null ? 1 / matchedAtRank : 0,
    });
  }

  if (!QUIET) {
    printPerQueryTable(perQuery);
  }

  const overall = aggregate(perQuery);
  const byDifficulty: Record<string, AggregateMetrics> = {};
  for (const d of ['easy', 'medium', 'vague'] as const) {
    byDifficulty[d] = aggregate(perQuery.filter((r) => r.difficulty === d));
  }

  console.log('');
  printAggregate('overall', overall);
  for (const d of ['easy', 'medium', 'vague'] as const) {
    printAggregate(d, byDifficulty[d]);
  }
  console.log('');

  if (!NO_SAVE) {
    const run: EvalRun = {
      timestamp: new Date().toISOString(),
      datasetVersion: dataset.version,
      topChunks: TOP_CHUNKS,
      overall,
      byDifficulty,
      perQuery,
    };
    const dir = resolveResultsDir();
    const stamp = run.timestamp.replace(/[:.]/g, '-');
    const outPath = path.join(dir, `${stamp}.json`);
    const latestPath = path.join(dir, 'latest.json');
    fs.writeFileSync(outPath, JSON.stringify(run, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(run, null, 2));
    console.log(`Saved: ${path.relative(process.cwd(), outPath)}`);
    console.log(`       ${path.relative(process.cwd(), latestPath)}\n`);
  }
}

try {
  await runEval();
} catch (err) {
  console.error('Eval failed:', err);
  process.exit(1);
}
