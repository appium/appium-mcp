import {appendFile} from 'node:fs/promises';

import semanticRelease from 'semantic-release';

const result = await semanticRelease();

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `released=${Boolean(result)}\n`);
}
