import { addCharacterText, insertableCharacterText, removeInsertedText } from './character-prompt-merge';

describe('character prompt merge', () => {
  it('puts the character first and keeps what the user typed', () => {
    expect(addCharacterText('sitting in a cafe, rain outside', 'blue fox, red scarf')).toEqual({
      prompt: 'blue fox, red scarf, sitting in a cafe, rain outside', inserted: 'blue fox, red scarf', dropped: 0, swapped: false,
    });
  });

  it('fills an empty prompt box with just the character', () => {
    expect(addCharacterText('', 'blue fox').prompt).toBe('blue fox');
    expect(addCharacterText('  ,  ', 'blue fox').prompt).toBe('blue fox');
  });

  it('writes the character text without stray commas or blanks, and reports exactly what it wrote', () => {
    const merged = addCharacterText('park', '  blue fox, red scarf, \n');
    expect(merged.prompt).toBe('blue fox, red scarf, park');
    expect(merged.inserted).toBe('blue fox, red scarf');
    expect(merged.prompt.startsWith(merged.inserted)).toBeTrue();
    expect(insertableCharacterText(', blue fox ,')).toBe('blue fox');
  });

  it('does not repeat tags the character already has, whatever their case', () => {
    const merged = addCharacterText('Masterpiece, best quality, sitting on a bench', 'masterpiece, Best Quality, blue fox');
    expect(merged.prompt).toBe('masterpiece, Best Quality, blue fox, sitting on a bench');
    expect(merged.dropped).toBe(2);
  });

  it('leaves the user text exactly as typed when nothing repeats', () => {
    const typed = 'sitting  on a bench ,holding a book,(smile:1.2)';
    expect(addCharacterText(typed, 'blue fox').prompt).toBe('blue fox, ' + typed);
  });

  it('keeps repeated tags when asked not to look for them (dynamic prompts)', () => {
    const merged = addCharacterText('{masterpiece|sketch}, masterpiece', 'masterpiece, blue fox', undefined, false);
    expect(merged.prompt).toBe('masterpiece, blue fox, {masterpiece|sketch}, masterpiece');
    expect(merged.dropped).toBe(0);
  });

  it('swaps an earlier character that is still at the start of the prompt', () => {
    const first = addCharacterText('walking in the rain', 'blue fox, red scarf');
    const second = addCharacterText(first.prompt, 'green cat, top hat', first.inserted);
    expect(second.prompt).toBe('green cat, top hat, walking in the rain');
    expect(second.swapped).toBeTrue();
  });

  it('swaps an earlier character the user moved to the middle or the end', () => {
    expect(addCharacterText('night city, blue fox, red scarf, walking', 'green cat', 'blue fox, red scarf').prompt)
      .toBe('green cat, night city, walking');
    expect(addCharacterText('night city, blue fox, red scarf', 'green cat', 'blue fox, red scarf').prompt)
      .toBe('green cat, night city');
  });

  it('adds in front without removing anything when the earlier text was edited', () => {
    const merged = addCharacterText('blue fox, green scarf, walking', 'green cat', 'blue fox, red scarf');
    expect(merged.prompt).toBe('green cat, blue fox, green scarf, walking');
    expect(merged.swapped).toBeFalse();
  });

  it('does not cut an earlier text that is only part of a longer tag', () => {
    expect(removeInsertedText('dark blue fox, walking', 'blue fox')).toEqual({ prompt: 'dark blue fox, walking', removed: false });
    expect(removeInsertedText('blue foxes, walking', 'blue fox').removed).toBeFalse();
    expect(removeInsertedText('dark blue fox, blue fox, walking', 'blue fox')).toEqual({ prompt: 'dark blue fox, walking', removed: true });
  });

  it('picking the same character again leaves one copy', () => {
    const first = addCharacterText('walking', 'blue fox, red scarf');
    expect(addCharacterText(first.prompt, 'blue fox, red scarf', first.inserted).prompt).toBe(first.prompt);
    // The link was lost (page refresh), so nothing is remembered: the repeated tags collapse instead.
    expect(addCharacterText(first.prompt, 'blue fox, red scarf').prompt).toBe(first.prompt);
  });
});
