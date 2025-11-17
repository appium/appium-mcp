/**
 * Tool to select mobile platform before creating a session
 */
import { z } from 'zod';
import { answerAppiumQuery, initializeAppiumDocumentation } from './index.js';
import log from '../../logger.js';

export default function answerAppium(server: any): void {
  server.addTool({
    name: 'appium_documentation_query',
    description: `Query Appium documentation using RAG (Retrieval-Augmented Generation).
      This tool searches through indexed Appium documentation to answer questions about Appium features, setup, configuration, drivers, and usage.
      `,
    parameters: z.object({
      query: z
        .string()
        .describe('The question or query about Appium documentation'),
    }),
    execute: async (args: any, context: any): Promise<any> => {
      const query = args.query;
      if (!query) {
        return {
          content: [
            {
              type: 'text',
              text: 'Query parameter is required',
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await answerAppiumQuery({ query });
        return {
          content: [
            {
              type: 'text',
              text: result.answer,
            },
          ],
        };
      } catch (docError) {
        // If documentation query fails, try to initialize and retry once
        try {
          log.info('Documentation not initialized, initializing now...');
          await initializeAppiumDocumentation();
          const result = await answerAppiumQuery({ query });
          return {
            content: [
              {
                type: 'text',
                text: result.answer,
              },
            ],
          };
        } catch (retryError) {
          return {
            content: [
              {
                type: 'text',
                text: `Error querying Appium documentation: ${
                  (retryError as Error).message
                }. Please ensure the documentation is indexed first.`,
              },
            ],
            isError: true,
          };
        }
      }
    },
  });
}
