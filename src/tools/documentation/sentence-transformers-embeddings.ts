/**
 * Sentence Transformers Embeddings Provider
 *
 * Uses @xenova/transformers to provide local embeddings without requiring API keys.
 * This is perfect for self-hosted MCP servers and eliminates external dependencies.
 */

import log from '../../logger.js';

/**
 * LangChain-compatible embeddings class using sentence-transformers
 */
export class SentenceTransformersEmbeddings {
  private model: any = null;
  private modelName: string;
  private queryInstruction: string;
  private isInitialized: boolean = false;
  private transformers: any = null;

  constructor(options: { modelName?: string; queryInstruction?: string } = {}) {
    this.modelName = options.modelName || 'Xenova/all-MiniLM-L6-v2';
    // Optional prefix prepended only to queries (not documents).
    // BGE models use this to close the question/passage style gap.
    this.queryInstruction = options.queryInstruction ?? '';
  }

  /** Name of the underlying model (used to namespace the embeddings cache file). */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Generate embeddings for a single text (LangChain interface).
   * Applies queryInstruction prefix when set.
   */
  async embedQuery(text: string): Promise<number[]> {
    await this.initializeModel();

    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      const input = this.queryInstruction
        ? `${this.queryInstruction}${text}`
        : text;
      const result = await this.model(input, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert tensor to array
      const embeddings = Array.from(result.data) as number[];
      return embeddings;
    } catch (error) {
      log.error('Error generating embeddings:', error);
      throw new Error(
        `Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Generate embeddings for multiple texts (LangChain interface)
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    await this.initializeModel();

    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      const embeddings: number[][] = [];
      const logEvery = 50; // chunk-by-chunk progress would be too noisy
      for (let i = 0; i < texts.length; i++) {
        const result = await this.model(texts[i], {
          pooling: 'mean',
          normalize: true,
        });
        embeddings.push(Array.from(result.data) as number[]);
        if (
          texts.length > logEvery &&
          (i + 1 === texts.length || (i + 1) % logEvery === 0)
        ) {
          log.info(`Processed ${i + 1}/${texts.length} documents`);
        }
      }

      return embeddings;
    } catch (error) {
      log.error('Error generating document embeddings:', error);
      throw new Error(
        `Failed to generate document embeddings: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Initialize the transformers library dynamically
   */
  private async initializeTransformers(): Promise<void> {
    if (this.transformers) {
      return;
    }

    try {
      // Use eval to avoid CommonJS/ESM conflict during compilation
      const importTransformers = new Function(
        'return import("@xenova/transformers")'
      );
      this.transformers = await importTransformers();
    } catch (error) {
      log.error('Error importing @xenova/transformers:', error);
      throw new Error(
        `Failed to import @xenova/transformers: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Initialize the model lazily
   */
  private async initializeModel(): Promise<void> {
    if (this.isInitialized && this.model) {
      return;
    }

    await this.initializeTransformers();

    log.info(`Initializing sentence-transformers model: ${this.modelName}`);
    try {
      this.model = await this.transformers.pipeline(
        'feature-extraction',
        this.modelName
      );
      this.isInitialized = true;
      log.info(
        `Successfully initialized sentence-transformers model: ${this.modelName}`
      );
    } catch (error) {
      log.error('Error initializing sentence-transformers model:', error);
      throw new Error(
        `Failed to initialize sentence-transformers model: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
}
