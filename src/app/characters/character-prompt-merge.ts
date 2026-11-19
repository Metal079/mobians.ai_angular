/**
 * "Add to my prompt": how a saved character's prompt is put in front of what the user already typed.
 * Pure functions, so the generator and the picker's preview agree on the result.
 */

export interface CharacterTextMerge {
  /** The complete new prompt. */
  prompt: string;
  /** Exactly the character text now at the start of `prompt`; kept so a later pick can swap it. */
  inserted: string;
  /** How many of the user's tags were left out because the character text already has them. */
  dropped: number;
  /** True when an earlier character's text was found in the prompt and replaced. */
  swapped: boolean;
}

const SEPARATOR = ', ';
const trimEnds = (text: string): string => text.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '');
const tagKey = (tag: string): string => tag.trim().toLocaleLowerCase();

/** The character text as it is written into a prompt: no stray commas or blanks at either end. */
export function insertableCharacterText(characterText: string): string {
  return trimEnds(String(characterText ?? ''));
}

/**
 * Removes an earlier character's text when it is still in the prompt as a whole comma-separated run
 * (at the start, or anywhere else). Returns the prompt untouched when the user has edited that text.
 */
export function removeInsertedText(current: string, inserted: string | undefined): { prompt: string; removed: boolean } {
  const text = String(current ?? '');
  if (!inserted) return { prompt: text, removed: false };
  let from = 0;
  while (from <= text.length) {
    const index = text.indexOf(inserted, from);
    if (index < 0) break;
    const before = text.slice(0, index);
    const after = text.slice(index + inserted.length);
    const startsRun = !before.trim() || before.trimEnd().endsWith(',');
    const endsRun = !after.trim() || after.trimStart().startsWith(',');
    if (startsRun && endsRun) {
      const left = before.replace(/[\s,]+$/, '');
      const right = after.replace(/^[\s,]+/, '');
      return { prompt: left && right ? left + SEPARATOR + right : left || right, removed: true };
    }
    from = index + 1;
  }
  return { prompt: text, removed: false };
}

/**
 * Puts the character text first, then the user's own text.
 * `previousInserted` is the text an earlier pick wrote; when it is still there it is replaced, not kept.
 * With `dedupe`, the user's comma-separated tags that the character text already has are not repeated
 * (exact match, ignoring case); the user's text is otherwise left exactly as typed.
 */
export function addCharacterText(current: string, characterText: string, previousInserted?: string, dedupe = true): CharacterTextMerge {
  const inserted = insertableCharacterText(characterText);
  const cleared = removeInsertedText(current, previousInserted);
  let rest = cleared.prompt;
  let dropped = 0;
  if (dedupe && inserted) {
    const characterTags = new Set(inserted.split(',').map(tagKey).filter(Boolean));
    const kept = rest.split(',').filter(tag => {
      const duplicate = !!tagKey(tag) && characterTags.has(tagKey(tag));
      if (duplicate) dropped++;
      return !duplicate;
    });
    if (dropped) rest = kept.join(',');
  }
  rest = trimEnds(rest);
  return { prompt: inserted && rest ? inserted + SEPARATOR + rest : inserted || rest, inserted, dropped, swapped: cleared.removed };
}
