/**
 * Answer-grounded RAG eval for the Appium documentation tool.
 *
 * Runs the documentation_query retrieval pipeline against a fixed set of
 * realistic queries and asks the only question that matters downstream:
 * "did the answer text actually land in the chunks an LLM would see?"
 *
 * What we measure:
 *
 *   1. answerSpanRecall@K
 *      For each query, the dataset declares short verbatim phrases lifted
 *      from the docs (`answerSpans`). We concatenate the top-K retrieved
 *      chunks and check what fraction of the spans appears in that text.
 *      "anyOf" semantics: a query that finds at least one span counts as a
 *      hit. Spans are 30-140 chars and chosen so any reasonable chunk
 *      containing the answer will include them, regardless of chunk
 *      boundaries -- so the metric is splitter-neutral.
 *
 *   2. hit@{1,3,5,10}
 *      Did any chunk at rank <= K carry any answerSpan? Direct measure of
 *      "does the LLM see the answer" at different context budgets.
 *
 *   3. MRR
 *      Mean reciprocal rank of the *first* chunk that carries an answerSpan.
 *      MRR-equivalent on content, not on file paths -- a chunk from the
 *      right file but wrong section is worth nothing here.
 *
 *   4. contextEfficiency
 *      For queries we hit, 1000 * spansCovered / totalChars(topK). Spans-per-
 *      kchar density. Low = lots of noise around the answer.
 *
 *   5. fileRecall@{5,10} (diagnostic only)
 *      Did the right *file* appear in top-K? Kept so we can spot the
 *      "right-file wrong-chunk" failure mode (right file present but no
 *      answerSpan landed).
 *
 * Match semantics: lowercase + collapse whitespace, then substring check.
 *
 * Usage (after `npm run build`):
 *   node dist/scripts/eval-documentation-rag.js \
 *        [--top-k=10] [--label=NAME] [--quiet] [--no-save]
 *
 *   --top-k=N    number of chunks to retrieve & evaluate (default 10)
 *   --label=N    label written into the saved run, useful for comparing
 *                index variants (e.g. --label=before, --label=after)
 *   --quiet      suppress the per-query log lines and table
 *   --no-save    don't persist results JSON to disk
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { queryVectorStore } from '../tools/documentation/simple-pdf-indexer.js';

interface EvalQuery {
  id: string;
  query: string;
  expectedSources: string[];
  answerSpans: string[];
  difficulty: 'easy' | 'medium' | 'vague';
  category?: string;
}

interface EvalDataset {
  version: number;
  description: string;
  matchMode: string;
  spanMatch?: { normalize: string; anyOf: boolean };
  queries: EvalQuery[];
}

interface RetrievedChunk {
  rank: number;
  text: string;
  source: string | undefined;
  charCount: number;
}

interface PerQueryResult {
  id: string;
  query: string;
  difficulty: EvalQuery['difficulty'];
  category?: string;
  expectedSources: string[];
  answerSpans: string[];
  retrievedSources: string[];
  topKChunks: number;
  topKChars: number;
  uniqueFiles: number;

  // Per-rank tracking: which ranks contain at least one answerSpan, and which
  // chunk first carried each individual span. Lets us derive recall@K cheaply.
  hitRanks: number[];
  firstHitRank: number | null;
  spansCovered: string[];
  spansMissing: string[];

  // Aggregates: per definitions in module docstring.
  answerSpanRecall: number;
  hitAnyAt1: 0 | 1;
  hitAnyAt3: 0 | 1;
  hitAnyAt5: 0 | 1;
  hitAnyAt10: 0 | 1;
  reciprocalRank: number;
  contextEfficiency: number; // spans/kchar; only meaningful when hitAny=1

  // Diagnostic: right-file recall (independent of whether the answer span
  // actually landed). Useful for spotting "right file, wrong section" cases.
  fileRecallAt5: 0 | 1;
  fileRecallAt10: 0 | 1;
}

interface AggregateMetrics {
  count: number;
  answerSpanRecall: number;
  hitAnyAt1: number;
  hitAnyAt3: number;
  hitAnyAt5: number;
  hitAnyAt10: number;
  mrr: number;
  contextEfficiency: number; // averaged over queries with a hit
  fileRecallAt5: number;
  fileRecallAt10: number;
}

interface EvalRun {
  timestamp: string;
  label: string;
  datasetVersion: number;
  topK: number;
  overall: AggregateMetrics;
  byDifficulty: Record<string, AggregateMetrics>;
  perQuery: PerQueryResult[];
}

// -- arg parsing ----------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const flagSet = new Set(args);
const QUIET = flagSet.has('--quiet');
const NO_SAVE = flagSet.has('--no-save');

function flagValue(name: string, dflt: string): string {
  const a = args.find((x) => x.startsWith(`${name}=`));
  return a ? a.split('=').slice(1).join('=') : dflt;
}

const TOP_K = Number(flagValue('--top-k', '10'));
const LABEL = flagValue('--label', 'default');

// -- paths ----------------------------------------------------------------

function resolveDatasetPath(): string {
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
    `rag-eval-dataset.json not found in: ${candidates.join(', ')}`
  );
}

function resolveResultsDir(): string {
  const dir = path.resolve(__dirname, '../../src/scripts/eval-results');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// -- matching helpers -----------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function chunkContainsSpan(chunkText: string, span: string): boolean {
  return normalize(chunkText).includes(normalize(span));
}

function endsWithExpected(retrievedRelPath: string, expected: string): boolean {
  return retrievedRelPath === expected || retrievedRelPath.endsWith(expected);
}

// -- per-query evaluation -------------------------------------------------

function evaluateQuery(
  q: EvalQuery,
  chunks: RetrievedChunk[]
): {
  hitRanks: number[];
  firstHitRank: number | null;
  spansCovered: string[];
  spansMissing: string[];
} {
  const hitRanks: number[] = [];
  const spansCovered = new Set<string>();

  for (const chunk of chunks) {
    let chunkHadHit = false;
    for (const span of q.answerSpans) {
      if (chunkContainsSpan(chunk.text, span)) {
        spansCovered.add(span);
        chunkHadHit = true;
      }
    }
    if (chunkHadHit) {
      hitRanks.push(chunk.rank);
    }
  }
  const firstHitRank = hitRanks.length > 0 ? hitRanks[0] : null;
  const spansMissing = q.answerSpans.filter((s) => !spansCovered.has(s));
  return {
    hitRanks,
    firstHitRank,
    spansCovered: [...spansCovered],
    spansMissing,
  };
}

// -- aggregation ----------------------------------------------------------

function aggregate(results: PerQueryResult[]): AggregateMetrics {
  if (results.length === 0) {
    return {
      count: 0,
      answerSpanRecall: 0,
      hitAnyAt1: 0,
      hitAnyAt3: 0,
      hitAnyAt5: 0,
      hitAnyAt10: 0,
      mrr: 0,
      contextEfficiency: 0,
      fileRecallAt5: 0,
      fileRecallAt10: 0,
    };
  }
  const n = results.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const hitResults = results.filter((r) => r.hitAnyAt10 === 1);
  return {
    count: n,
    answerSpanRecall: mean(results.map((r) => r.answerSpanRecall)),
    hitAnyAt1: mean(results.map((r) => r.hitAnyAt1)),
    hitAnyAt3: mean(results.map((r) => r.hitAnyAt3)),
    hitAnyAt5: mean(results.map((r) => r.hitAnyAt5)),
    hitAnyAt10: mean(results.map((r) => r.hitAnyAt10)),
    mrr: mean(results.map((r) => r.reciprocalRank)),
    contextEfficiency: hitResults.length
      ? mean(hitResults.map((r) => r.contextEfficiency))
      : 0,
    fileRecallAt5: mean(results.map((r) => r.fileRecallAt5)),
    fileRecallAt10: mean(results.map((r) => r.fileRecallAt10)),
  };
}

function fmt(n: number, dp: number = 3): string {
  return n.toFixed(dp);
}

function printAggregate(label: string, m: AggregateMetrics): void {
  const tag = `${label} (n=${m.count})`.padEnd(20);
  console.log(
    `${tag}  spanRecall=${fmt(m.answerSpanRecall)}  hit@1=${fmt(m.hitAnyAt1)}  hit@3=${fmt(m.hitAnyAt3)}  hit@5=${fmt(m.hitAnyAt5)}  hit@10=${fmt(m.hitAnyAt10)}  MRR=${fmt(m.mrr)}  ctxEff=${fmt(m.contextEfficiency, 2)}  fileR@5=${fmt(m.fileRecallAt5)}`
  );
}

function printPerQueryTable(results: PerQueryResult[]): void {
  const header = 'id   | diff   | fhr | spans  | hit@5 | unique | sources';
  const sep = '-'.repeat(110);
  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const r of results) {
    const fhr =
      r.firstHitRank === null ? ' - ' : String(r.firstHitRank).padStart(3, ' ');
    const spans = `${r.spansCovered.length}/${r.answerSpans.length}`;
    const matched = r.retrievedSources[0]
      ? r.retrievedSources.slice(0, 2).join(', ')
      : '(empty)';
    console.log(
      `${r.id.padEnd(4)} | ${r.difficulty.padEnd(6)} | ${fhr} | ${spans.padEnd(6)} | ${String(r.hitAnyAt5).padEnd(5)} | ${String(r.uniqueFiles).padEnd(6)} | ${matched}`
    );
  }
  console.log(sep);
}

// -- main -----------------------------------------------------------------

async function runEval(): Promise<void> {
  const datasetPath = resolveDatasetPath();
  const dataset: EvalDataset = JSON.parse(
    fs.readFileSync(datasetPath, 'utf-8')
  );

  console.log(`\n=== Appium RAG eval (answer-grounded) ===`);
  console.log(`Dataset: ${datasetPath}`);
  console.log(
    `Queries: ${dataset.queries.length}   topK: ${TOP_K}   label: ${LABEL}\n`
  );

  const perQuery: PerQueryResult[] = [];

  for (const q of dataset.queries) {
    const docs = await queryVectorStore(q.query, TOP_K);
    const chunks: RetrievedChunk[] = docs.map((d, i) => ({
      rank: i + 1,
      text: d.pageContent,
      source:
        (d.metadata?.relativePath as string | undefined) ??
        (d.metadata?.filename as string | undefined),
      charCount: d.pageContent.length,
    }));

    const retrievedSources = chunks
      .map((c) => c.source)
      .filter((s): s is string => !!s);

    const topKChars = chunks.reduce((a, c) => a + c.charCount, 0);
    const uniqueFiles = new Set(retrievedSources).size;

    const { hitRanks, firstHitRank, spansCovered, spansMissing } =
      evaluateQuery(q, chunks);

    const answerSpanRecall =
      q.answerSpans.length === 0
        ? 0
        : spansCovered.length / q.answerSpans.length;
    const hitAnyAt = (k: number): 0 | 1 =>
      hitRanks.some((r) => r <= k) ? 1 : 0;
    const reciprocalRank = firstHitRank ? 1 / firstHitRank : 0;
    const contextEfficiency =
      firstHitRank !== null && topKChars > 0
        ? (1000 * spansCovered.length) / topKChars
        : 0;

    const fileMatched = (k: number): 0 | 1 => {
      const top = retrievedSources.slice(0, k);
      return top.some((rs) =>
        q.expectedSources.some((es) => endsWithExpected(rs, es))
      )
        ? 1
        : 0;
    };

    perQuery.push({
      id: q.id,
      query: q.query,
      difficulty: q.difficulty,
      category: q.category,
      expectedSources: q.expectedSources,
      answerSpans: q.answerSpans,
      retrievedSources,
      topKChunks: chunks.length,
      topKChars,
      uniqueFiles,
      hitRanks,
      firstHitRank,
      spansCovered,
      spansMissing,
      answerSpanRecall,
      hitAnyAt1: hitAnyAt(1),
      hitAnyAt3: hitAnyAt(3),
      hitAnyAt5: hitAnyAt(5),
      hitAnyAt10: hitAnyAt(10),
      reciprocalRank,
      contextEfficiency,
      fileRecallAt5: fileMatched(5),
      fileRecallAt10: fileMatched(10),
    });

    if (!QUIET) {
      const status = hitAnyAt(5) ? 'OK' : 'MISS';
      console.log(
        `${status.padEnd(4)} ${q.id}  spans=${spansCovered.length}/${q.answerSpans.length}  fhr=${firstHitRank ?? '-'}`
      );
    }
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
      label: LABEL,
      datasetVersion: dataset.version,
      topK: TOP_K,
      overall,
      byDifficulty,
      perQuery,
    };
    const dir = resolveResultsDir();
    const stamp = run.timestamp.replace(/[:.]/g, '-');
    const outPath = path.join(dir, `${LABEL}-${stamp}.json`);
    const labelLatestPath = path.join(dir, `${LABEL}-latest.json`);
    const latestPath = path.join(dir, 'latest.json');
    fs.writeFileSync(outPath, JSON.stringify(run, null, 2));
    fs.writeFileSync(labelLatestPath, JSON.stringify(run, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(run, null, 2));
    console.log(`Saved: ${path.relative(process.cwd(), outPath)}`);
    console.log(`       ${path.relative(process.cwd(), labelLatestPath)}`);
    console.log(`       ${path.relative(process.cwd(), latestPath)}\n`);
  }
}

try {
  await runEval();
} catch (err) {
  console.error('Eval failed:', err);
  process.exit(1);
}
