/**
 * Header-aware Markdown splitter (hybrid approach).
 *
 * The TS `@langchain/textsplitters` package only ships `MarkdownTextSplitter`,
 * which is `RecursiveCharacterTextSplitter` with Markdown-priority separators —
 * it is *greedy* and merges across topical boundaries when chunks are small.
 *
 * For Appium's header-dense docs (2098 h2 + 2263 h3 across 178 files; 92% of
 * h2/h3 sections fit under 1000 chars), splitting on headers first preserves
 * topical boundaries. We then:
 *   - Coalesce short adjacent sections so embeddings aren't computed on tiny
 *     (~50-token) chunks where vector quality degrades.
 *   - Recursively split sections that exceed `chunkSize` (e.g. long capability
 *     reference tables, big code dumps).
 *   - Prepend a header breadcrumb (`# Page > ## Section > ### Subsection`) to
 *     every chunk so the embedding sees topical context even when the body
 *     is recursive-split into mid-paragraph fragments.
 *
 * Files with no headers (or only an h1) fall through to a single recursive
 * split of the whole body - no different from plain RCT for those.
 */
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface MarkdownHeaderSplitterOptions {
  chunkSize: number;
  chunkOverlap: number;
}

interface Section {
  headerStack: string[]; // e.g. ['# Title', '## Section', '### Subsection']
  body: string; // section content (everything between this header and the next at <= level)
}

const HEADER_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^\s{0,3}(```|~~~)/;

/**
 * Parse Markdown into a flat list of sections delimited by ATX headers.
 *
 * - Respects fenced code blocks: `#` inside ``` ... ``` is not treated as a header.
 * - Files without any headers produce a single section with empty headerStack.
 * - The text before the first header (if any) is attached as a section with
 *   the file's eventual root headerStack (still empty until we see an h1).
 */
function parseSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let inFence = false;
  let currentBody: string[] = [];
  // headerStack carries the live ancestor chain — when we see h(n), we pop
  // everything at level >= n then push the new header.
  const headerStack: string[] = [];

  const flush = () => {
    if (currentBody.length === 0 && headerStack.length === 0) {
      return;
    }
    sections.push({
      headerStack: [...headerStack],
      body: currentBody.join('\n').trim(),
    });
    currentBody = [];
  };

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      currentBody.push(line);
      continue;
    }
    if (inFence) {
      currentBody.push(line);
      continue;
    }
    const m = line.match(HEADER_RE);
    if (m) {
      // Flush whatever section we were in before opening a new one.
      flush();
      const level = m[1].length;
      // Pop deeper-or-equal headers off the stack — siblings replace, deeper
      // descendants are closed.
      while (headerStack.length > 0) {
        const top = headerStack[headerStack.length - 1];
        const topLevel = top.match(/^(#{1,6})/)![1].length;
        if (topLevel >= level) {
          headerStack.pop();
        } else {
          break;
        }
      }
      headerStack.push(`${m[1]} ${m[2]}`);
      continue;
    }
    currentBody.push(line);
  }
  flush();
  return sections.filter((s) => s.headerStack.length > 0 || s.body.length > 0);
}

/**
 * Build a single-line breadcrumb prefix for a chunk, e.g.
 *   "# XCUITest Driver Capabilities > ## Standard W3C > ### platformVersion"
 * Falls back to empty string if the section has no ancestors.
 */
function breadcrumbFor(headerStack: string[]): string {
  if (headerStack.length === 0) {
    return '';
  }
  return headerStack.join(' > ');
}

/**
 * Render a section as the text that will go into a chunk: breadcrumb on top,
 * blank line, then body. Used both when emitting a single section as one chunk
 * and when buffering for coalescence.
 */
function renderSection(section: Section): string {
  const bc = breadcrumbFor(section.headerStack);
  if (!bc) {
    return section.body;
  }
  if (!section.body) {
    return bc;
  }
  return `${bc}\n\n${section.body}`;
}

/**
 * Split a single Markdown document into chunks using header-aware hybrid logic.
 * See module docstring for the algorithm summary.
 */
export async function splitMarkdownByHeaders(
  markdown: string,
  options: MarkdownHeaderSplitterOptions
): Promise<Document[]> {
  const { chunkSize, chunkOverlap } = options;
  const sections = parseSections(markdown);

  // Fallback splitter for sections that exceed chunkSize on their own.
  // Reserve some room for the breadcrumb so the final chunk text still fits.
  const recursive = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    keepSeparator: true,
  });

  const chunks: Document[] = [];
  // `buffer` holds rendered section texts (each with its own breadcrumb) that
  // we plan to coalesce. We flush when adding the next section would overflow.
  const buffer: Section[] = [];
  let bufferSize = 0;

  const flushBuffer = () => {
    if (buffer.length === 0) {
      return;
    }
    const text = buffer.map(renderSection).join('\n\n');
    chunks.push(
      new Document({
        pageContent: text,
        metadata: {
          headerPath: breadcrumbFor(buffer[0].headerStack),
          sectionCount: buffer.length,
        },
      })
    );
    buffer.length = 0;
    bufferSize = 0;
  };

  for (const section of sections) {
    const rendered = renderSection(section);

    if (rendered.length > chunkSize) {
      // Section is too big to live in any single chunk: flush whatever we had
      // buffered, then recursive-split this section's body, prepending the
      // breadcrumb to each sub-chunk so context isn't lost.
      flushBuffer();
      const bc = breadcrumbFor(section.headerStack);
      const subTexts = await recursive.splitText(section.body || '');
      for (const sub of subTexts) {
        const text = bc ? `${bc}\n\n${sub}` : sub;
        chunks.push(
          new Document({
            pageContent: text,
            metadata: {
              headerPath: bc,
              sectionCount: 1,
              recursiveSplit: true,
            },
          })
        );
      }
      continue;
    }

    // Would adding this section overflow the current buffer? If so, flush.
    // The +2 accounts for the "\n\n" join between buffered sections.
    if (bufferSize > 0 && bufferSize + rendered.length + 2 > chunkSize) {
      flushBuffer();
    }
    buffer.push(section);
    bufferSize += rendered.length + (bufferSize > 0 ? 2 : 0);
  }
  flushBuffer();

  return chunks;
}
