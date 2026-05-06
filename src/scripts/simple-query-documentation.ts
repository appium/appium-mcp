#!/usr/bin/env node
/**
 * Simple Documentation Query Script
 *
 * This script is used to test the answerAppiumQuery function
 * by querying the indexed Markdown documentation in the in-memory vector store.
 *
 * Usage: npm run simple-query-docs "your query here"
 *
 * Example: npm run simple-query-docs "What is Appium?"
 */

import { answerAppiumQuery } from '../tools/documentation/index.js';

/**
 * Main function to handle the documentation query process
 */
async function main(): Promise<void> {
  console.log('Using sentence-transformers embeddings (no API key required)');
  console.log(
    'Note: This script will return relevant documentation chunks without generating responses'
  );

  console.log('process.argv:', process.argv);
  const args = process.argv.slice(2);
  console.log('args:', args);
  let query: string;

  if (args.length > 0) {
    query = args.join(' ');
    console.log(`Using provided query: "${query}"`);
  } else {
    query = 'What is Appium and how do I get started?';
    console.log(`No query provided, using default query: "${query}"`);
  }

  console.log(`Querying in-memory vector store with: "${query}"`);

  try {
    const result = await answerAppiumQuery({
      query,
    });

    console.log('\n--- ANSWER ---\n');
    console.log(result.answer);

    if (result.sources && result.sources.length > 0) {
      console.log('\n--- SOURCES ---\n');
      result.sources.forEach((source: any) => {
        console.log(`- ${source}`);
      });
    }

    process.exit(0);
  } catch (error: any) {
    console.error('Query failed:', error);
    process.exit(1);
  }
}

void main();
