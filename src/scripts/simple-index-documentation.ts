#!/usr/bin/env node
/**
 * Simple Documentation Indexing Script
 *
 * This script is a simplified version for indexing Markdown documents into an in-memory vector store
 * using LangChain's RecursiveCharacterTextSplitter and MemoryVectorStore.
 *
 * Usage:
 * - Index a single Markdown file: npm run simple-index-docs [markdownPath] [chunkSize] [overlap]
 * - Index all Markdown files in a directory: npm run simple-index-docs [dirPath] [chunkSize] [overlap]
 *
 * Examples:
 * - npm run simple-index-docs ./my-doc.md 1000 200
 * - npm run simple-index-docs ./src/resources 1000 200
 *
 * If no path is provided, it defaults to indexing all Markdown files in the src/resources directory.
 * If a file path is provided, it will index that specific file.
 * If a directory path is provided, it will index all Markdown files in that directory.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  indexMarkdown,
  indexAllMarkdownFiles,
} from '../tools/documentation/simple-pdf-indexer.js';

/**
 * Main function to handle the documentation indexing process
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let markdownPath: string;
  let chunkSize = 1000; // Default chunk size
  let chunkOverlap = 200; // Default overlap
  let indexSingleFile = false;

  if (args.length > 0 && args[0]) {
    markdownPath = path.resolve(process.cwd(), args[0]);

    if (fs.existsSync(markdownPath) && fs.statSync(markdownPath).isFile()) {
      indexSingleFile = true;
      console.log(`Using provided file path: ${markdownPath}`);
    } else {
      console.log(`Using provided directory path: ${markdownPath}`);
    }
  } else {
    // Default to submodules directory which contains the git submodules
    markdownPath = path.resolve(process.cwd(), 'src/resources/submodules');
    console.log(`Using default submodules directory: ${markdownPath}`);
  }

  if (args.length > 1 && !isNaN(Number(args[1]))) {
    chunkSize = Number(args[1]);
    console.log(`Using chunk size: ${chunkSize}`);
  }

  if (args.length > 2 && !isNaN(Number(args[2]))) {
    chunkOverlap = Number(args[2]);
    console.log(`Using overlap: ${chunkOverlap}`);
  }

  console.log('Using sentence-transformers embeddings (no API key required)');

  console.log(
    'Starting simplified documentation indexing process with in-memory vector store...'
  );

  try {
    if (indexSingleFile) {
      console.log(`Indexing single Markdown file: ${markdownPath}`);
      await indexMarkdown(markdownPath, chunkSize, chunkOverlap);
      console.log('Documentation indexing completed successfully');
    } else {
      console.log(`Indexing all Markdown files in directory: ${markdownPath}`);
      const indexedFiles = await indexAllMarkdownFiles(
        markdownPath,
        chunkSize,
        chunkOverlap
      );
      console.log(
        `Documentation indexing completed successfully for ${indexedFiles.length} Markdown files`
      );
    }
    process.exit(0);
  } catch (error: any) {
    console.error('Documentation indexing failed:', error);
    process.exit(1);
  }
}

main();
