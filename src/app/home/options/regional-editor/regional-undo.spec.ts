import { UndoStack } from './regional-undo';

describe('regional-undo UndoStack', () => {
  let now = 0;
  const stack = () => new UndoStack<string>(3, () => now);

  beforeEach(() => (now = 1000));

  it('undoes and redoes in order, and a new change clears redo', () => {
    const history = stack();
    history.record('a');
    history.record('b');
    expect(history.undo('c')).toBe('b');
    expect(history.undo('b')).toBe('a');
    expect(history.undo('a')).toBeNull();
    expect(history.redo('a')).toBe('b');
    expect(history.canRedo).toBeTrue();
    history.record('b');
    expect(history.canRedo).toBeFalse();
  });

  it('merges changes with the same key inside the window and splits them after it or after seal()', () => {
    const history = stack();
    expect(history.record('a', 'prompt:1')).toBeTrue();
    now += 500;
    expect(history.record('ab', 'prompt:1')).toBeFalse();
    now += 2000;
    expect(history.record('abc', 'prompt:1')).toBeTrue();
    history.seal();
    expect(history.record('abcd', 'prompt:1')).toBeTrue();
    expect(history.record('x', 'prompt:2')).toBeTrue();
  });

  it('keeps at most the configured number of steps', () => {
    const history = stack();
    ['a', 'b', 'c', 'd'].forEach(step => history.record(step));
    expect(history.undo('e')).toBe('d');
    expect(history.undo('d')).toBe('c');
    expect(history.undo('c')).toBe('b');
    expect(history.undo('b')).toBeNull();
    history.clear();
    expect(history.canUndo).toBeFalse();
  });
});
