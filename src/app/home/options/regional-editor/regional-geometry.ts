/**
 * Box geometry for the regional canvas: move, resize, draw, nudge and snapping (pure functions).
 * Snapping (SPEC 5): 5% grid, image thirds and centre, and the other boxes' edges. Holding Alt disables it.
 */
import { clamp, REGIONAL_LIMITS, RegionBox } from './regional-state';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface SnapTargets {
  /** Image thirds, centre, edges and other boxes' edges: snapped to first and shown as guides. */
  strongX: number[];
  strongY: number[];
  /** The 5% grid. */
  grid: number[];
}

export interface SnapGuides { x: number[]; y: number[]; }

export interface SnapOptions {
  targets: SnapTargets | null;
  /** Distance in image fractions within which a value snaps, per axis. */
  thresholdX: number;
  thresholdY: number;
}

export interface GeometryResult { box: RegionBox; guides: SnapGuides; }

const EPS = 1e-6;
const GRID = Array.from({ length: 21 }, (_, i) => Math.round(i * 5) / 100);

export function snapTargets(boxes: RegionBox[], skipIndex = -1): SnapTargets {
  const strongX = new Set<number>([0, 1 / 3, 0.5, 2 / 3, 1]);
  const strongY = new Set<number>([0, 1 / 3, 0.5, 2 / 3, 1]);
  boxes.forEach((box, index) => {
    if (index === skipIndex) return;
    strongX.add(box.x);
    strongX.add(box.x + box.width);
    strongY.add(box.y);
    strongY.add(box.y + box.height);
  });
  return { strongX: [...strongX], strongY: [...strongY], grid: GRID };
}

interface SnapHit { value: number; distance: number; guide: number | null; }

function nearest(value: number, candidates: number[], threshold: number): { value: number; distance: number } | null {
  let best: { value: number; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance <= threshold + EPS && (!best || distance < best.distance)) best = { value: candidate, distance };
  }
  return best;
}

/** Snaps one coordinate: strong targets win over the grid; only strong targets draw a guide. */
export function snapValue(value: number, strong: number[], grid: number[], threshold: number): SnapHit {
  const hit = nearest(value, strong, threshold);
  if (hit) return { value: hit.value, distance: hit.distance, guide: hit.value };
  const gridHit = nearest(value, grid, threshold);
  if (gridHit) return { value: gridHit.value, distance: gridHit.distance, guide: null };
  return { value, distance: Infinity, guide: null };
}

/** Moves a box, snapping whichever of its edges is closer to a target. */
export function moveBox(start: RegionBox, dx: number, dy: number, snap?: SnapOptions): GeometryResult {
  let x = clamp(start.x + dx, 0, 1 - start.width);
  let y = clamp(start.y + dy, 0, 1 - start.height);
  const guides: SnapGuides = { x: [], y: [] };
  if (snap?.targets) {
    const { strongX, strongY, grid } = snap.targets;
    const left = snapValue(x, strongX, grid, snap.thresholdX);
    const right = snapValue(x + start.width, strongX, grid, snap.thresholdX);
    const useRight = right.distance < left.distance;
    const pickX = useRight ? right : left;
    if (Number.isFinite(pickX.distance)) {
      x = clamp(useRight ? pickX.value - start.width : pickX.value, 0, 1 - start.width);
      if (pickX.guide !== null) guides.x.push(pickX.guide);
    }
    const top = snapValue(y, strongY, grid, snap.thresholdY);
    const bottom = snapValue(y + start.height, strongY, grid, snap.thresholdY);
    const useBottom = bottom.distance < top.distance;
    const pickY = useBottom ? bottom : top;
    if (Number.isFinite(pickY.distance)) {
      y = clamp(useBottom ? pickY.value - start.height : pickY.value, 0, 1 - start.height);
      if (pickY.guide !== null) guides.y.push(pickY.guide);
    }
  }
  return { box: { x, y, width: start.width, height: start.height }, guides };
}

/** Resizes from one of the 8 handles; the opposite edges stay put and the box keeps the minimum size. */
export function resizeBox(start: RegionBox, handle: ResizeHandle, dx: number, dy: number, snap?: SnapOptions): GeometryResult {
  const min = REGIONAL_LIMITS.minSize;
  let left = start.x;
  let right = start.x + start.width;
  let top = start.y;
  let bottom = start.y + start.height;
  const guides: SnapGuides = { x: [], y: [] };
  const snapEdge = (value: number, axis: 'x' | 'y'): number => {
    if (!snap?.targets) return value;
    const strong = axis === 'x' ? snap.targets.strongX : snap.targets.strongY;
    const hit = snapValue(value, strong, snap.targets.grid, axis === 'x' ? snap.thresholdX : snap.thresholdY);
    if (hit.guide !== null) guides[axis].push(hit.guide);
    return hit.value;
  };
  if (handle.includes('w')) left = clamp(snapEdge(clamp(left + dx, 0, right - min), 'x'), 0, right - min);
  if (handle.includes('e')) right = clamp(snapEdge(clamp(right + dx, left + min, 1), 'x'), left + min, 1);
  if (handle.includes('n')) top = clamp(snapEdge(clamp(top + dy, 0, bottom - min), 'y'), 0, bottom - min);
  if (handle.includes('s')) bottom = clamp(snapEdge(clamp(bottom + dy, top + min, 1), 'y'), top + min, 1);
  return { box: { x: left, y: top, width: right - left, height: bottom - top }, guides };
}

/** The box spanned by two points while drawing, both points snapped. */
export function drawBox(from: { x: number; y: number }, to: { x: number; y: number }, snap?: SnapOptions): GeometryResult {
  const guides: SnapGuides = { x: [], y: [] };
  const snapPoint = (value: number, axis: 'x' | 'y'): number => {
    const bounded = clamp(value, 0, 1);
    if (!snap?.targets) return bounded;
    const strong = axis === 'x' ? snap.targets.strongX : snap.targets.strongY;
    const hit = snapValue(bounded, strong, snap.targets.grid, axis === 'x' ? snap.thresholdX : snap.thresholdY);
    if (hit.guide !== null) guides[axis].push(hit.guide);
    return hit.value;
  };
  const x1 = snapPoint(from.x, 'x');
  const y1 = snapPoint(from.y, 'y');
  const x2 = snapPoint(to.x, 'x');
  const y2 = snapPoint(to.y, 'y');
  return {
    box: { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) },
    guides,
  };
}

/** Keyboard nudge, kept inside the image. */
export function nudgeBox(box: RegionBox, dx: number, dy: number): RegionBox {
  return {
    x: clamp(Math.round((box.x + dx) * 10000) / 10000, 0, 1 - box.width),
    y: clamp(Math.round((box.y + dy) * 10000) / 10000, 0, 1 - box.height),
    width: box.width,
    height: box.height,
  };
}

function overlapArea(a: RegionBox, b: RegionBox): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Where "+ Region" puts a new box: the candidate that overlaps existing boxes least (centre first). */
export function freeSpot(boxes: RegionBox[], size = 0.4): RegionBox {
  const offsets = [0.3, 0.05, 0.55];
  const candidates: RegionBox[] = [];
  candidates.push({ x: 0.3, y: 0.3, width: size, height: size });
  for (const y of offsets) {
    for (const x of offsets) {
      if (x === 0.3 && y === 0.3) continue;
      candidates.push({ x, y, width: size, height: size });
    }
  }
  let best = candidates[0];
  let bestOverlap = Infinity;
  for (const candidate of candidates) {
    const overlap = boxes.reduce((sum, box) => sum + overlapArea(candidate, box), 0);
    if (overlap < bestOverlap - EPS) {
      best = candidate;
      bestOverlap = overlap;
    }
  }
  return { ...best };
}

/** Offset for a duplicate: down-right when it fits, otherwise up-left. */
export function duplicateOffset(box: RegionBox, step = 0.04): RegionBox {
  const dx = box.x + box.width + step <= 1 ? step : -step;
  const dy = box.y + box.height + step <= 1 ? step : -step;
  return nudgeBox(box, dx, dy);
}
