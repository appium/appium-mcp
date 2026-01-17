/**
 * Test script to verify page-source-filter with real data
 *
 * Usage: npx ts-node scripts/test-filter.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Handle ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic import for the filter module
async function main() {
  const { filterPageSource } = await import('../src/utils/page-source-filter.ts');

  // Get file from command line argument or default to a.json
  const inputFile = process.argv[2] || 'a.json';
  const jsonPath = path.join(__dirname, '..', inputFile);
  console.log('Testing file:', inputFile);

  if (!fs.existsSync(jsonPath)) {
    console.error('Error: a.json not found at', jsonPath);
    process.exit(1);
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  // Extract XML from JSON wrapper
  const text = jsonData[0]?.text || '';
  const xmlMatch = text.match(/```xml\s*([\s\S]*?)```/);

  if (!xmlMatch) {
    console.error('Error: Could not extract XML from a.json');
    process.exit(1);
  }

  const xml = xmlMatch[1];
  console.log('Input XML size:', xml.length, 'bytes');
  console.log('');

  // Run filter
  const result = filterPageSource(xml);

  // Output results
  console.log('=== Filter Results ===');
  console.log('Stats:', JSON.stringify(result.stats, null, 2));
  console.log('');
  console.log('Output size:', JSON.stringify(result).length, 'bytes');
  console.log(
    'Reduction:',
    ((1 - JSON.stringify(result).length / xml.length) * 100).toFixed(1) + '%'
  );
  console.log('');

  console.log('=== Filtered Elements ===');
  result.elements.forEach((el, i) => {
    console.log(
      `${i + 1}. [${el.type}] ${el.text ? `"${el.text}" ` : ''}` +
        `${el.clickable ? '(clickable) ' : ''}` +
        `-> ${el.strategy}: ${el.selector}`
    );
  });
}

main().catch(console.error);
