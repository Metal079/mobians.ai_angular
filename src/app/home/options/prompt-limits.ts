/**
 * Prompt lengths the backend refuses, so the site can say so before a job is sent.
 * Keep in step with mobiansBackend/prompt_limits.py (MAX_PROMPT_CHARS) and
 * mobiansBackend/dynamic_prompts/engine.py (MAX_TEMPLATE_LENGTH).
 */
export const MAX_PROMPT_CHARS = 8000;
/** A prompt that uses dynamic-prompt syntax is sent whole as the template, which has the lower limit. */
export const MAX_DYNAMIC_TEMPLATE_CHARS = 3000;
