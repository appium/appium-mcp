/**
 * AI tool enablement and configuration.
 *
 * The AI tool is gated behind AI_VISION_ENABLED to prevent the LLM from
 * defaulting to vision-based finding when a traditional locator would work,
 * and to keep cost/latency surprises out of the default experience.
 *
 * Contract:
 *   - AI_VISION_ENABLED !== 'true'  → tool is not registered.
 *   - AI_VISION_ENABLED === 'true'  → AI_VISION_API_BASE_URL and
 *     AI_VISION_API_KEY MUST be set, or server startup fails fast.
 */

const ENABLED_FLAG = 'AI_VISION_ENABLED';
const REQUIRED_WHEN_ENABLED = [
  'AI_VISION_API_BASE_URL',
  'AI_VISION_API_KEY',
] as const;

export function isAIEnabled(): boolean {
  return process.env[ENABLED_FLAG]?.toLowerCase() === 'true';
}

export function assertAIConfig(): void {
  if (!isAIEnabled()) {
    return;
  }
  const missing = REQUIRED_WHEN_ENABLED.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `${ENABLED_FLAG}=true but required env vars are missing: ${missing.join(', ')}. ` +
        `Set them or unset ${ENABLED_FLAG} to disable the AI tool.`
    );
  }
}
