import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

import {summarizePageSource} from './page-source-summary.js';

/** Save a fresh XML snapshot and optionally summarize matching nodes.
 * Invalid filters are evaluated before writing; filesystem errors propagate to the caller.
 */
export async function cachePageSource(pageSource: string, filters: {selector?: string; pattern?: string} = {}) {
  const {selector, pattern} = filters;
  const summary =
    selector !== undefined || pattern !== undefined ? summarizePageSource(pageSource, selector, pattern) : {};
  const directory = process.env.PAGE_SOURCES_DIR ? resolve(process.env.PAGE_SOURCES_DIR) : tmpdir();
  await mkdir(directory, {recursive: true});
  const filepath = join(directory, `page-source-${randomUUID()}.xml`);
  await writeFile(filepath, pageSource, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
  return {filepath, bytes: Buffer.byteLength(pageSource, 'utf8'), ...summary};
}
