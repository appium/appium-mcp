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
  private isInitialized: boolean = false;
  private transformers: any = null;

  constructor(options: { modelName?: string } = {}) {
    // Use a lightweight, fast model by default
    this.modelName = options.modelName || 'Xenova/all-MiniLM-L6-v2';
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
        `Failed to import @xenova/transformers: ${error instanceof Error ? error.message : String(error)}`
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
        `Failed to initialize sentence-transformers model: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate embeddings for a single text (LangChain interface)
   */
  async embedQuery(text: string): Promise<number[]> {
    await this.initializeModel();

    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      const result = await this.model(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert tensor to array
      const embeddings = Array.from(result.data) as number[];
      return embeddings;
    } catch (error) {
      log.error('Error generating embeddings:', error);
      throw new Error(
        `Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`
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

      // Process texts in batches to avoid memory issues
      const batchSize = 10;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        for (const text of batch) {
          const result = await this.model(text, {
            pooling: 'mean',
            normalize: true,
          });
          const embedding = Array.from(result.data) as number[];
          embeddings.push(embedding);
        }

        // Log progress for large batches
        if (texts.length > batchSize) {
          log.info(
            `Processed ${Math.min(i + batchSize, texts.length)}/${texts.length} documents`
          );
        }
      }

      return embeddings;
    } catch (error) {
      log.error('Error generating document embeddings:', error);
      throw new Error(
        `Failed to generate document embeddings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
