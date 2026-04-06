import { afterEach, describe, expect, jest, test } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

await jest.unstable_mockModule('../../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const { getMarkdownFilesInDirectory } =
  await import('../../../tools/documentation/simple-pdf-indexer.js');

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appium-mcp-markdown-'));
  tempDirs.push(dir);
  return dir;
}

describe('getMarkdownFilesInDirectory', () => {
  test('excludes markdown files under appium-skills', async () => {
    const root = makeTempDir();
    const docsDir = path.join(root, 'docs');
    const skillsDir = path.join(root, 'appium-skills');
    const nestedSkillsDir = path.join(skillsDir, 'skills');

    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(nestedSkillsDir, { recursive: true });
    fs.writeFileSync(path.join(root, 'README.md'), '# root');
    fs.writeFileSync(path.join(docsDir, 'guide.md'), '# docs');
    fs.writeFileSync(path.join(skillsDir, 'AGENTS.md'), '# agents');
    fs.writeFileSync(path.join(nestedSkillsDir, 'SKILL.md'), '# skill');

    const markdownFiles = await getMarkdownFilesInDirectory(root);

    expect(markdownFiles).toEqual(
      expect.arrayContaining([
        path.join(root, 'README.md'),
        path.join(docsDir, 'guide.md'),
      ])
    );
    expect(markdownFiles).not.toEqual(
      expect.arrayContaining([
        path.join(skillsDir, 'AGENTS.md'),
        path.join(nestedSkillsDir, 'SKILL.md'),
      ])
    );
  });
});
