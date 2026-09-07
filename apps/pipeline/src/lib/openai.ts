import OpenAI from 'openai';

export const EXTRACTION_MODEL = 'gpt-5-mini';

/**
 * Create the client only when an extraction is requested. That keeps a missing
 * production secret from preventing unrelated pipeline jobs from starting.
 */
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return new OpenAI({ apiKey });
}
