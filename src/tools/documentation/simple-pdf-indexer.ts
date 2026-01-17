/**
 * Simple Markdown Indexer
 *
 * A simplified implementation for indexing Markdown documents into an in-memory vector store
 * using LangChain's RecursiveCharacterTextSplitter and MemoryVectorStore.
 * The vector store is persisted to a file for use across different script executions.
 */

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

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
      process.env.SENTENCE_TRANSFORMERS_MODEL || 'Xenova/all-MiniLM-L6-v2';
    embeddings = new SentenceTransformersEmbeddings({ modelName });
    log.info(`Using sentence-transformers model: ${modelName}`);
  } catch (error) {
    throw new Error(
      `Failed to initialize embeddings: ${
        error instanceof Error ? error.message : String(error)
      }`
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
    const dir = path.dirname(DOCUMENTS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Serialize the new documents
    const serializedNew = documents.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata,
    }));

    let allSerialized = serializedNew;

    // If appending and file exists, read existing documents and combine
    if (append && fs.existsSync(DOCUMENTS_PATH)) {
      try {
        const existingContent = fs.readFileSync(DOCUMENTS_PATH, 'utf-8');
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
    fs.writeFileSync(DOCUMENTS_PATH, JSON.stringify(allSerialized));
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
    if (fs.existsSync(DOCUMENTS_PATH)) {
      fs.writeFileSync(DOCUMENTS_PATH, JSON.stringify([]));
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
    if (!fs.existsSync(DOCUMENTS_PATH)) {
      log.info('No saved documents found');
      return null;
    }

    // Read from file
    const serialized = JSON.parse(fs.readFileSync(DOCUMENTS_PATH, 'utf-8'));

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
    const text = fs.readFileSync(markdownPath, 'utf-8');
    return text;
  } catch (error) {
    log.error('Error extracting text from Markdown:', error);
    throw new Error(
      `Failed to extract text from Markdown: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
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

    // Store documents in memory vector store
    log.info('Storing documents in memory vector store...');
    const vectorStore = await MemoryVectorStore.fromDocuments(
      documents,
      getEmbeddings()
    );

    // Save the vector store in the global variable for later use
    memoryVectorStore = vectorStore;

    // Save documents to file for persistence
    await saveDocuments(documents, false); // Don't append for single file indexing

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
    const readdir = promisify(fs.readdir);
    const stat = promisify(fs.stat);

    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      log.error(`Directory does not exist: ${dirPath}`);
      return [];
    }

    const markdownFiles: string[] = [];

    async function scanDirectory(currentPath: string): Promise<void> {
      const files = await readdir(currentPath);

      for (const file of files) {
        const filePath = path.join(currentPath, file);
        const stats = await stat(filePath);

        if (stats.isDirectory()) {
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

        // Store documents in memory vector store
        log.info('Storing documents in memory vector store...');
        if (i === 0) {
          // For the first Markdown file, create a new vector store
          memoryVectorStore = await MemoryVectorStore.fromDocuments(
            documents,
            getEmbeddings()
          );
        } else {
          // For subsequent Markdown files, add to the existing vector store
          await memoryVectorStore?.addDocuments(documents);
        }

        // Save documents to file (append for all Markdown files except the first one)
        await saveDocuments(documents, i > 0);

        indexedFiles.push(markdownFile);
        log.info(`Successfully indexed Markdown: ${filename}`);
      } catch (error) {
        log.error(`Error indexing Markdown ${markdownFile}:`, error);
        // Continue with next file even if one fails
      }
    }

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
    // Check if the vector store has been initialized in memory
    if (!memoryVectorStore) {
      // Try to load documents from file
      const documents = await loadDocuments();

      // If documents exist, create a new vector store
      if (documents && documents.length > 0) {
        log.info('Creating vector store from saved documents...');
        memoryVectorStore = await MemoryVectorStore.fromDocuments(
          documents,
          getEmbeddings()
        );
      } else {
        throw new Error(
          'Vector store has not been initialized. Please index a PDF first.'
        );
      }
    }

    // Query the vector store
    const results = await memoryVectorStore.similaritySearch(query, topK);

    return results;
  } catch (error) {
    log.error('Error querying vector store:', error);
    throw error;
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
    if (fs.existsSync(markdownPath) && fs.statSync(markdownPath).isFile()) {
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
