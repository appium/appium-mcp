/**
 * Simple Markdown Indexer
 *
 * A simplified implementation for indexing Markdown documents into an in-memory vector store
 * using LangChain's RecursiveCharacterTextSplitter and MemoryVectorStore.
 * The vector store is persisted to a file for use across different script executions.
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { fs } from '@appium/support';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Initialize embeddings using sentence-transformers (no API key required)
import { SentenceTransformersEmbeddings } from './sentence-transformers-embeddings.js';
import log from '../../logger.js';

let embeddings: SentenceTransformersEmbeddings | null = null;

/**
 * Initialize embeddings lazily when needed
 * Uses sentence-transformers exclusively (no API key required)
 */
function getEmbeddings(): SentenceTransformersEmbeddings {
  if (embeddings) {
    return embeddings;
  }

  try {
    // Use local sentence-transformers (no API key required)
    log.info('Using local sentence-transformers embeddings');
    const modelName =
      process.env.SENTENCE_TRANSFORMERS_MODEL || 'Xenova/bge-small-en-v1.5';
    // BGE models benefit from a query instruction prefix to align the
    // embedding space between short questions and longer document passages.
    // Applied to embedQuery() only; embedDocuments() is unchanged.
    const queryInstruction = modelName.includes('bge')
      ? 'Represent this sentence for searching relevant passages: '
      : '';
    embeddings = new SentenceTransformersEmbeddings({
      modelName,
      queryInstruction,
    });
    log.info(`Using sentence-transformers model: ${modelName}`);
  } catch (error) {
    throw new Error(
      `Failed to initialize embeddings: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }

  return embeddings;
}

// Path to store the documents
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCUMENTS_PATH = path.join(__dirname, './uploads/documents.json');

// Global variable to store the in-memory vector store
let memoryVectorStore: MemoryVectorStore | null = null;
/**
 * Exclude certain directories from being indexed to avoid irrelevant content and reduce noise in the vector store.
 */
const EXCLUDED_MARKDOWN_DIRECTORIES = new Set(['appium-skills']);

/**
 * Embeddings cache: vectors persisted alongside documents.json so the
 * server doesn't re-embed all chunks on every cold start.
 *
 * Invariants:
 *   - One cache file per model, so multiple models can coexist on disk.
 *   - Fingerprint embeds (modelName, chunkCount, contentHash of documents).
 *     Any drift in the corpus or model means the cache invalidates and gets
 *     re-embedded automatically.
 */
const CACHE_VERSION = 1;

interface EmbeddingsCacheFingerprint {
  modelName: string;
  chunkCount: number;
  contentHash: string;
}

interface EmbeddingsCacheFile {
  version: number;
  fingerprint: EmbeddingsCacheFingerprint;
  embeddings: number[][];
}

function sanitizeForFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function getEmbeddingsCachePath(modelName: string): string {
  return path.join(
    __dirname,
    'uploads',
    `embeddings-${sanitizeForFilename(modelName)}.json`
  );
}

function computeContentHash(documents: Document[]): string {
  const hash = crypto.createHash('sha256');
  for (const doc of documents) {
    hash.update(doc.pageContent);
    hash.update('\x00'); // separator avoids concat collisions across chunks
  }
  return hash.digest('hex');
}

function makeFingerprint(
  documents: Document[],
  modelName: string
): EmbeddingsCacheFingerprint {
  return {
    modelName,
    chunkCount: documents.length,
    contentHash: computeContentHash(documents),
  };
}

function fingerprintsMatch(
  a: EmbeddingsCacheFingerprint,
  b: EmbeddingsCacheFingerprint
): boolean {
  return (
    a.modelName === b.modelName &&
    a.chunkCount === b.chunkCount &&
    a.contentHash === b.contentHash
  );
}

/**
 * Try to load a valid embeddings cache for the given documents + model.
 * Returns null if no cache file exists, the file is corrupt, or its
 * fingerprint disagrees with what we'd compute now.
 */
async function loadEmbeddingsCache(
  documents: Document[],
  modelName: string
): Promise<number[][] | null> {
  const cachePath = getEmbeddingsCachePath(modelName);
  if (!(await fs.exists(cachePath))) {
    log.info(`No embeddings cache found at ${cachePath}`);
    return null;
  }
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    const cache = JSON.parse(raw as string) as EmbeddingsCacheFile;
    if (cache.version !== CACHE_VERSION) {
      log.warn(
        `Embeddings cache version mismatch (got ${cache.version}, want ${CACHE_VERSION}). Invalidating.`
      );
      return null;
    }
    const expected = makeFingerprint(documents, modelName);
    if (!fingerprintsMatch(cache.fingerprint, expected)) {
      log.info(
        `Embeddings cache fingerprint mismatch — will re-embed. ` +
          `Cached: ${JSON.stringify(cache.fingerprint)}; expected: ${JSON.stringify(expected)}`
      );
      return null;
    }
    if (
      !Array.isArray(cache.embeddings) ||
      cache.embeddings.length !== documents.length
    ) {
      log.warn(
        `Embeddings cache length (${cache.embeddings?.length}) does not match documents length (${documents.length}). Invalidating.`
      );
      return null;
    }
    log.info(
      `Embeddings cache hit: ${cache.embeddings.length} vectors loaded from ${cachePath}`
    );
    return cache.embeddings;
  } catch (err) {
    log.warn(
      `Failed to read embeddings cache (${err instanceof Error ? err.message : String(err)}). Will re-embed.`
    );
    return null;
  }
}

/**
 * Persist embedding vectors for the given documents under the given model name.
 * Writes to a .tmp file then moves into place; the finally block sweeps the
 * tmp file if anything between writeFile and mv throws. Uses fs.mv so the
 * overwrite works across platforms (Windows rename-over-existing can be flaky
 * in edge cases involving file locks).
 */
async function saveEmbeddingsCache(
  documents: Document[],
  vectors: number[][],
  modelName: string
): Promise<void> {
  if (vectors.length === 0) {
    return;
  }
  if (vectors.length !== documents.length) {
    log.warn(
      `Refusing to write embeddings cache: ${vectors.length} vectors vs ${documents.length} documents`
    );
    return;
  }
  const cachePath = getEmbeddingsCachePath(modelName);
  await fs.mkdirp(path.dirname(cachePath));
  const cache: EmbeddingsCacheFile = {
    version: CACHE_VERSION,
    fingerprint: makeFingerprint(documents, modelName),
    embeddings: vectors,
  };
  const tmpPath = `${cachePath}.tmp`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(cache));
    await fs.mv(tmpPath, cachePath, { clobber: true, mkdirp: true });
    log.info(
      `Saved embeddings cache (${vectors.length} vectors) to ${cachePath}`
    );
  } finally {
    if (await fs.exists(tmpPath)) {
      try {
        await fs.unlink(tmpPath);
      } catch (cleanupErr) {
        log.warn(
          `Failed to clean up tmp cache file ${tmpPath}: ${
            cleanupErr instanceof Error
              ? cleanupErr.message
              : String(cleanupErr)
          }`
        );
      }
    }
  }
}

/**
 * Initialize the vector store with Markdown content
 * @param markdownPath Path to the Markdown file
 * @param chunkSize Size of each chunk in characters
 * @param chunkOverlap Number of characters to overlap between chunks
 * @returns The initialized MemoryVectorStore
 */
export async function initializeVectorStore(
  markdownPath: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): Promise<MemoryVectorStore> {
  try {
    log.info(`Initializing vector store for Markdown: ${markdownPath}`);
    log.info(`Using chunk size: ${chunkSize}, overlap: ${chunkOverlap}`);

    // Extract text from Markdown
    log.info('Extracting text from Markdown...');
    const markdownText = await extractTextFromMarkdown(markdownPath);
    log.info(`Extracted ${markdownText.length} characters from Markdown`);

    // Create text splitter
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });

    // Split text into documents
    log.info('Splitting text into chunks...');
    const documents = await textSplitter.createDocuments([markdownText]);
    log.info(`Created ${documents.length} document chunks`);

    // Embed once; reuse the vectors for both the in-memory store and the cache.
    log.info('Embedding chunks...');
    const embeddingsProvider = getEmbeddings();
    const vectors = await embeddingsProvider.embedDocuments(
      documents.map((d) => d.pageContent)
    );

    log.info('Storing documents in memory vector store...');
    const vectorStore = new MemoryVectorStore(embeddingsProvider);
    await vectorStore.addVectors(vectors, documents);

    // Save the vector store in the global variable for later use
    memoryVectorStore = vectorStore;

    // Save documents to file for persistence
    await saveDocuments(documents, false); // Don't append for single file indexing

    // Persist the embeddings cache so the next cold start can skip embedding.
    await saveEmbeddingsCache(
      documents,
      vectors,
      embeddingsProvider.getModelName()
    );

    log.info('Successfully stored documents in memory vector store');
    return vectorStore;
  } catch (error) {
    log.error('Error initializing vector store:', error);
    throw error;
  }
}

/**
 * Get all Markdown files in a directory recursively
 * @param dirPath Path to the directory
 * @returns Array of Markdown file paths
 */
export async function getMarkdownFilesInDirectory(
  dirPath: string
): Promise<string[]> {
  try {
    // Check if directory exists
    if (!(await fs.exists(dirPath))) {
      log.error(`Directory does not exist: ${dirPath}`);
      return [];
    }

    const markdownFiles: string[] = [];

    async function scanDirectory(currentPath: string): Promise<void> {
      const files = await fs.readdir(currentPath);

      for (const file of files) {
        const filePath = path.join(currentPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
          if (EXCLUDED_MARKDOWN_DIRECTORIES.has(file)) {
            continue;
          }

          // Recursively scan subdirectories
          await scanDirectory(filePath);
        } else if (
          stats.isFile() &&
          path.extname(file).toLowerCase() === '.md'
        ) {
          markdownFiles.push(filePath);
        }
      }
    }

    await scanDirectory(dirPath);
    log.info(`Found ${markdownFiles.length} Markdown files in ${dirPath}`);
    return markdownFiles;
  } catch (error) {
    log.error('Error getting Markdown files:', error);
    return [];
  }
}

/**
 * Index a Markdown file into the memory vector store
 * @param markdownPath Path to the Markdown file
 * @param chunkSize Size of each chunk in characters
 * @param chunkOverlap Number of characters to overlap between chunks
 */
export async function indexMarkdown(
  markdownPath: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): Promise<void> {
  try {
    log.info('Starting Markdown indexing process...');

    // Initialize vector store
    await initializeVectorStore(markdownPath, chunkSize, chunkOverlap);

    log.info('Markdown indexing completed successfully');
  } catch (error) {
    log.error('Markdown indexing failed:', error);
    throw error;
  }
}

/**
 * Index all Markdown files in a directory
 * @param dirPath Path to the directory containing Markdown files
 * @param chunkSize Size of each chunk in characters
 * @param chunkOverlap Number of characters to overlap between chunks
 * @returns Array of indexed Markdown file paths
 */
export async function indexAllMarkdownFiles(
  dirPath: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): Promise<string[]> {
  try {
    log.info(
      `Starting indexing of all Markdown files in directory: ${dirPath}`
    );

    // Get all Markdown files in the directory
    const markdownFiles = await getMarkdownFilesInDirectory(dirPath);

    if (markdownFiles.length === 0) {
      log.info('No Markdown files found in the directory');
      return [];
    }

    // Clear the documents file before starting
    await clearDocumentsFile();

    // Accumulate vectors + documents across all files so we can write a single
    // embeddings cache at the end, parallel-aligned with documents.json.
    const embeddingsProvider = getEmbeddings();
    const allVectors: number[][] = [];
    const allDocuments: Document[] = [];

    // Initialize the in-memory store up-front so a failure on the first file
    // can't leave subsequent iterations with a null store.
    memoryVectorStore = new MemoryVectorStore(embeddingsProvider);

    // Index each Markdown file
    const indexedFiles: string[] = [];
    for (let i = 0; i < markdownFiles.length; i++) {
      const markdownFile = markdownFiles[i];
      try {
        log.info(
          `Indexing Markdown ${i + 1}/${markdownFiles.length}: ${markdownFile}`
        );

        // Extract text from Markdown
        log.info('Extracting text from Markdown...');
        const markdownText = await extractTextFromMarkdown(markdownFile);
        log.info(`Extracted ${markdownText.length} characters from Markdown`);

        // Create text splitter
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize,
          chunkOverlap,
        });

        // Split text into documents
        log.info('Splitting text into chunks...');
        const documents = await textSplitter.createDocuments([markdownText]);
        log.info(`Created ${documents.length} document chunks`);

        // Add file metadata to each document
        const filename = path.basename(markdownFile);
        const relativePath = path.relative(dirPath, markdownFile);
        documents.forEach((doc) => {
          doc.metadata = {
            ...doc.metadata,
            source: markdownFile,
            filename,
            relativePath,
          };
        });

        // Embed this file's chunks once; reuse the vectors for both the
        // in-memory store and the on-disk cache.
        log.info('Embedding chunks...');
        const vectors = await embeddingsProvider.embedDocuments(
          documents.map((d) => d.pageContent)
        );

        // Persist documents.json first
        await saveDocuments(documents, i > 0);

        log.info('Storing documents in memory vector store...');
        await memoryVectorStore.addVectors(vectors, documents);
        allVectors.push(...vectors);
        allDocuments.push(...documents);

        indexedFiles.push(markdownFile);
        log.info(`Successfully indexed Markdown: ${filename}`);
      } catch (error) {
        log.error(`Error indexing Markdown ${markdownFile}:`, error);
        // Continue with next file even if one fails
      }
    }

    // Persist the embeddings cache once, after all files are indexed.
    // The cache is keyed by model name and ordered to match documents.json.
    await saveEmbeddingsCache(
      allDocuments,
      allVectors,
      embeddingsProvider.getModelName()
    );

    log.info(
      `Successfully indexed ${indexedFiles.length} out of ${markdownFiles.length} Markdown files`
    );
    return indexedFiles;
  } catch (error) {
    log.error('Error indexing all Markdown files:', error);
    throw error;
  }
}

/**
 * Query the vector store for similar documents
 * @param query The query text
 * @param topK Number of results to return
 * @returns Array of documents with their content and metadata
 */
export async function queryVectorStore(
  query: string,
  topK: number = 25
): Promise<Document[]> {
  try {
    if (!memoryVectorStore) {
      const documents = await loadDocuments();
      if (!documents || documents.length === 0) {
        throw new Error(
          'Vector store has not been initialized. Please index docs first.'
        );
      }

      const embeddingsProvider = getEmbeddings();
      const modelName = embeddingsProvider.getModelName();

      // Fast path: load pre-computed vectors and build the store via addVectors.
      // Skips the ~30-60s document-embedding step entirely.
      const cached = await loadEmbeddingsCache(documents, modelName);
      if (cached) {
        log.info('Building vector store from cached embeddings (fast path)');
        memoryVectorStore = new MemoryVectorStore(embeddingsProvider);
        await memoryVectorStore.addVectors(cached, documents);
      } else {
        // Slow path: embed all documents now, then persist a cache so the
        // next cold start is fast. Also covers model changes (different
        // cache filename, no hit) and corpus changes (fingerprint mismatch).
        log.info(
          `Embedding ${documents.length} documents for model ${modelName} (this may take a while)...`
        );
        const start = Date.now();
        const vectors = await embeddingsProvider.embedDocuments(
          documents.map((d) => d.pageContent)
        );
        log.info(`Embedding completed in ${Date.now() - start}ms`);

        memoryVectorStore = new MemoryVectorStore(embeddingsProvider);
        await memoryVectorStore.addVectors(vectors, documents);

        await saveEmbeddingsCache(documents, vectors, modelName);
      }
    }

    return await memoryVectorStore.similaritySearch(query, topK);
  } catch (error) {
    log.error('Error querying vector store:', error);
    throw error;
  }
}

/**
 * Save the documents to a file
 * @param documents The documents to save
 * @param append Whether to append to existing documents or overwrite
 */
async function saveDocuments(
  documents: Document[],
  append: boolean = false
): Promise<void> {
  try {
    // Create directory if it doesn't exist
    await fs.mkdirp(path.dirname(DOCUMENTS_PATH));

    // Serialize the new documents
    const serializedNew = documents.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata,
    }));

    let allSerialized = serializedNew;

    // If appending and file exists, read existing documents and combine
    if (append && (await fs.exists(DOCUMENTS_PATH))) {
      try {
        const existingContent = (await fs.readFile(
          DOCUMENTS_PATH,
          'utf-8'
        )) as string;
        if (existingContent) {
          const existingSerialized = JSON.parse(existingContent);
          allSerialized = [...existingSerialized, ...serializedNew];
          log.info(
            `Appending ${serializedNew.length} documents to existing ${existingSerialized.length} documents`
          );
        }
      } catch (readError) {
        log.warn(
          'Error reading existing documents, overwriting instead:',
          readError
        );
      }
    }

    // Write to file
    await fs.writeFile(DOCUMENTS_PATH, JSON.stringify(allSerialized));
    log.info(
      `${
        append ? 'Appended to' : 'Saved'
      } documents in ${DOCUMENTS_PATH} (total: ${allSerialized.length})`
    );
  } catch (error) {
    log.error('Error saving documents:', error);
    throw error;
  }
}

/**
 * Clear the documents file
 */
async function clearDocumentsFile(): Promise<void> {
  try {
    if (await fs.exists(DOCUMENTS_PATH)) {
      await fs.writeFile(DOCUMENTS_PATH, JSON.stringify([]));
      log.info(`Cleared documents file at ${DOCUMENTS_PATH}`);
    }
  } catch (error) {
    log.error('Error clearing documents file:', error);
    throw error;
  }
}

/**
 * Load the documents from a file
 * @returns The loaded documents or null if the file doesn't exist
 */
async function loadDocuments(): Promise<Document[] | null> {
  try {
    if (!(await fs.exists(DOCUMENTS_PATH))) {
      log.info('No saved documents found');
      return null;
    }

    // Read from file
    const raw = (await fs.readFile(DOCUMENTS_PATH, 'utf-8')) as string;
    const serialized = JSON.parse(raw);

    // Convert to Document objects
    const documents = serialized.map(
      (doc: any) =>
        new Document({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        })
    );

    log.info(`${documents.length} documents loaded from ${DOCUMENTS_PATH}`);
    return documents;
  } catch (error) {
    log.error('Error loading documents:', error);
    return null;
  }
}

/**
 * Extract text from a Markdown file
 * @param markdownPath Path to the Markdown file
 * @returns Extracted text as a string
 */
async function extractTextFromMarkdown(markdownPath: string): Promise<string> {
  try {
    return (await fs.readFile(markdownPath, 'utf-8')) as string;
  } catch (error) {
    log.error('Error extracting text from Markdown:', error);
    throw new Error(
      `Failed to extract text from Markdown: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

// This allows the script to be run directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let markdownPath: string;
  let chunkSize = 1000; // Default chunk size
  let chunkOverlap = 200; // Default overlap
  let indexSingleFile = false;

  // Get Markdown path or directory path
  if (args.length > 0 && args[0]) {
    // Use provided path
    markdownPath = path.resolve(process.cwd(), args[0]);

    // Check if the provided path is a file or directory
    if (
      (await fs.exists(markdownPath)) &&
      (await fs.stat(markdownPath)).isFile()
    ) {
      indexSingleFile = true;
    }
  } else {
    // Use default path to resources directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    markdownPath = path.resolve(__dirname, '../../resources');
  }

  // Get chunk size if provided
  if (args.length > 1 && !isNaN(Number(args[1]))) {
    chunkSize = Number(args[1]);
  }

  // Get overlap if provided
  if (args.length > 2 && !isNaN(Number(args[2]))) {
    chunkOverlap = Number(args[2]);
  }

  // Log embeddings provider that will be used
  log.info('Using sentence-transformers embeddings (no API key required)');

  // Run the indexing process
  if (indexSingleFile) {
    // Index a single Markdown file
    log.info(`Indexing single Markdown file: ${markdownPath}`);
    try {
      await indexMarkdown(markdownPath, chunkSize, chunkOverlap);
      process.exit(0);
    } catch (error) {
      log.error('Indexing failed:', error);
      process.exit(1);
    }
  } else {
    // Index all Markdown files in the directory
    log.info(`Indexing all Markdown files in directory: ${markdownPath}`);
    try {
      const indexedFiles = await indexAllMarkdownFiles(
        markdownPath,
        chunkSize,
        chunkOverlap
      );
      log.info(`Successfully indexed ${indexedFiles.length} Markdown files`);
      process.exit(0);
    } catch (error) {
      log.error('Indexing failed:', error);
      process.exit(1);
    }
  }
}
