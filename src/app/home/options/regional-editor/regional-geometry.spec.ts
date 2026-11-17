import { drawBox, duplicateOffset, freeSpot, moveBox, nudgeBox, resizeBox, snapTargets, snapValue } from './regional-geometry';

const snapOpts = (boxes: any[], skip = -1, threshold = 0.02) => ({ targets: snapTargets(boxes, skip), thresholdX: threshold, thresholdY: threshold });

describe('regional-geometry', () => {
  it('prefers thirds, centre and other boxes over the 5% grid, and only strong targets draw guides', () => {
    const targets = snapTargets([{ x: 0.12, y: 0.2, width: 0.3, height: 0.3 }]);
    expect(snapValue(0.43, targets.strongX, targets.grid, 0.02)).toEqual(jasmine.objectContaining({ value: 0.42, guide: 0.42 }));
    expect(snapValue(0.341, targets.strongX, targets.grid, 0.02).value).toBeCloseTo(1 / 3, 6);
    expect(snapValue(0.76, targets.strongX, targets.grid, 0.02)).toEqual(jasmine.objectContaining({ value: 0.75, guide: null }));
    expect(snapValue(0.775, targets.strongX, targets.grid, 0.01).value).toBe(0.775);
  });

  it('moves a box inside the image and snaps its nearer edge to another box', () => {
    const other = { x: 0.62, y: 0, width: 0.38, height: 1 };
    const box = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
    const result = moveBox(box, 0.215, 0, snapOpts([box, other], 0));
    expect(result.box.x + result.box.width).toBeCloseTo(0.62, 6);
    expect(result.guides.x).toContain(0.62);
    expect(moveBox(box, 2, -2).box).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.3 });
    // Without snap options (Alt held) the move is exact.
    expect(moveBox(box, 0.013, 0.017).box.x).toBeCloseTo(0.113, 6);
  });

  it('resizes from each handle keeping the opposite edges and the minimum size', () => {
    const box = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
    const se = resizeBox(box, 'se', 0.1, 0.05).box;
    expect(se.x).toBe(0.2);
    expect(se.width).toBeCloseTo(0.5, 6);
    expect(se.height).toBeCloseTo(0.45, 6);
    const w = resizeBox(box, 'w', 0.5, 0).box;
    expect(w.x + w.width).toBeCloseTo(0.6, 6);
    expect(w.width).toBeCloseTo(0.03, 6);
    const n = resizeBox(box, 'n', 0, -1).box;
    expect(n).toEqual(jasmine.objectContaining({ y: 0, height: 0.6000000000000001 }));
    const snapped = resizeBox(box, 'e', 0.135, 0, snapOpts([box], 0)).box;
    expect(snapped.x + snapped.width).toBeCloseTo(0.75, 6);
  });

  it('normalises a drawn box from any drag direction', () => {
    expect(drawBox({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 }).box).toEqual({ x: 0.2, y: 0.1, width: 0.6000000000000001, height: 0.8 });
    const snapped = drawBox({ x: 0.012, y: 0.49 }, { x: 0.338, y: 1.4 }, snapOpts([])).box;
    expect(snapped.x).toBe(0);
    expect(snapped.y).toBe(0.5);
    expect(snapped.width).toBeCloseTo(1 / 3, 6);
    expect(snapped.height).toBe(0.5);
  });

  it('nudges inside the image and finds free space for new and duplicated boxes', () => {
    expect(nudgeBox({ x: 0.69, y: 0, width: 0.3, height: 0.3 }, 0.05, -0.05)).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.3 });
    expect(freeSpot([])).toEqual({ x: 0.3, y: 0.3, width: 0.4, height: 0.4 });
    expect(freeSpot([{ x: 0.3, y: 0.3, width: 0.4, height: 0.4 }]).x).not.toBe(0.3);
    expect(duplicateOffset({ x: 0.1, y: 0.1, width: 0.3, height: 0.3 })).toEqual(jasmine.objectContaining({ x: 0.14, y: 0.14 }));
    expect(duplicateOffset({ x: 0.5, y: 0, width: 0.5, height: 1 })).toEqual(jasmine.objectContaining({ x: 0.46, y: 0 }));
  });
});
