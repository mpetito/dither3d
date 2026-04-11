/**
 * Cyclic, Bresenham, and Transition dithering algorithm implementations.
 *
 * Bresenham dithering uses sequential error diffusion to distribute
 * minority-color layers maximally apart, eliminating structural banding.
 *
 * Transition dithering uses tapered cyclic alternation with Bresenham-style
 * error accumulation across configurable transition bands between color stops.
 */

import type { Palette, CyclicPalette, BresenhamPalette, TransitionPalette, TransitionWidth, GradientStop } from './config';
import { MAX_FILAMENTS } from './encoding';

export class PaletteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaletteError';
  }
}

/** Context bag passed from the pipeline to palette strategies. */
export interface PaletteContext {
  layerHeightMm: number;
}

/** Strategy for a single palette type. */
export interface PaletteStrategy<T extends Palette = Palette> {
  readonly type: string;
  /** Apply palette to face layer indices for a single cluster. */
  apply(layerIndices: Uint32Array, regionLayers: number, palette: T, ctx: PaletteContext): Uint8Array;
  /** Build a layer→filament map for a single cluster (for boundary encoding). */
  buildLayerMap(regionLayers: number, palette: T, ctx: PaletteContext): Uint8Array;
  /** Validate palette-specific config; throw PaletteError on failure. */
  validate(palette: T, mappingIndex: number): void;
  /** Serialize palette to JSON-safe object. */
  toJson(palette: T): Record<string, unknown>;
  /** Parse raw config object into typed palette. */
  parse(raw: Record<string, unknown>): T;
}

/**
 * Apply a cyclic (repeating) palette pattern to face layer indices.
 *
 * @param layerIndices (n_faces) 0-based layer indices
 * @param pattern Sequence of 1-based filament indices
 * @returns (n_faces) 1-based filament assignments
 */
export function applyCyclic(
  layerIndices: Uint32Array,
  pattern: readonly number[],
): Uint8Array {
  const n = layerIndices.length;
  const patLen = pattern.length;
  const result = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = pattern[layerIndices[i] % patLen];
  }
  return result;
}

/**
 * Build a complete layer→filament map using sequential error diffusion.
 *
 * Processes layers sequentially so the error accumulator carries across
 * segment boundaries, eliminating phase-alignment artifacts.
 */
export function buildBresenhamLayerMap(
  totalLayers: number,
  stops: readonly [number, number][],
): Uint8Array {
  const layerMap = new Uint8Array(totalLayers);
  const denom = Math.max(totalLayers - 1, 1);

  const stopTs = stops.map((s) => s[0]);
  const stopColors = stops.map((s) => s[1]);
  const nStops = stops.length;

  let error = 0.0;

  for (let layer = 0; layer < totalLayers; layer++) {
    const t = layer / denom;

    // At or before first stop
    if (t <= stopTs[0]) {
      layerMap[layer] = stopColors[0];
      continue;
    }
    // At or after last stop
    if (t >= stopTs[nStops - 1]) {
      layerMap[layer] = stopColors[nStops - 1];
      continue;
    }

    // Find segment (search from end for last stop where t >= stop_t)
    let seg = 0;
    for (let s = nStops - 2; s >= 0; s--) {
      if (t >= stopTs[s]) {
        seg = s;
        break;
      }
    }

    const c0 = stopColors[seg];
    const c1 = stopColors[seg + 1];
    const span = stopTs[seg + 1] - stopTs[seg];

    if (span < 1e-9 || c0 === c1) {
      layerMap[layer] = c0;
      continue;
    }

    // ratio = fraction of c1 at this position
    const ratio = (t - stopTs[seg]) / span;

    // Error diffusion
    error += ratio;
    if (error >= 0.5) {
      layerMap[layer] = c1;
      error -= 1.0;
    } else {
      layerMap[layer] = c0;
    }
  }

  return layerMap;
}

/**
 * Apply a Bresenham palette across face layer indices.
 *
 * Uses sequential error diffusion to distribute color transitions
 * maximally apart, eliminating structural banding artifacts.
 */
export function applyBresenham(
  layerIndices: Uint32Array,
  totalLayers: number,
  stops: readonly [number, number][],
): Uint8Array {
  if (stops.length < 2) {
    throw new PaletteError('Bresenham palette requires at least 2 stops');
  }

  const layerMap = buildBresenhamLayerMap(totalLayers, stops);

  const n = layerIndices.length;
  const result = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const idx = Math.max(0, Math.min(layerIndices[i], totalLayers - 1));
    result[i] = layerMap[idx];
  }
  return result;
}

// --- Palette Strategy Registry ---

const cyclicStrategy: PaletteStrategy<CyclicPalette> = {
  type: 'cyclic',
  apply(layerIndices, _regionLayers, palette, _ctx) {
    return applyCyclic(layerIndices, palette.pattern);
  },
  buildLayerMap(regionLayers, palette, _ctx) {
    const map = new Uint8Array(regionLayers);
    for (let i = 0; i < regionLayers; i++) {
      map[i] = palette.pattern[i % palette.pattern.length];
    }
    return map;
  },
  validate(palette, mappingIndex) {
    for (let j = 0; j < palette.pattern.length; j++) {
      if (palette.pattern[j] < 1 || palette.pattern[j] > MAX_FILAMENTS) {
        throw new PaletteError(
          `color_mappings[${mappingIndex}].pattern[${j}]: filament ${palette.pattern[j]} outside range [1, ${MAX_FILAMENTS}]`,
        );
      }
    }
  },
  toJson(palette) {
    return { type: 'cyclic', pattern: [...palette.pattern] };
  },
  parse(raw) {
    const pattern = raw['pattern'];
    if (!Array.isArray(pattern) || pattern.length === 0) {
      throw new PaletteError("Cyclic palette requires non-empty 'pattern' list");
    }
    for (let i = 0; i < pattern.length; i++) {
      if (typeof pattern[i] !== 'number' || !Number.isInteger(pattern[i])) {
        throw new PaletteError(`Cyclic pattern[${i}]: expected integer, got ${typeof pattern[i]}`);
      }
    }
    return { type: 'cyclic', pattern: pattern as number[] };
  },
};

const bresenhamStrategy: PaletteStrategy<BresenhamPalette> = {
  type: 'bresenham',
  apply(layerIndices, regionLayers, palette, _ctx) {
    const stops = palette.stops.map((s) => [s.t, s.filament] as [number, number]);
    return applyBresenham(layerIndices, regionLayers, stops);
  },
  buildLayerMap(regionLayers, palette, _ctx) {
    const stops = palette.stops.map((s) => [s.t, s.filament] as [number, number]);
    return buildBresenhamLayerMap(regionLayers, stops);
  },
  validate(palette, mappingIndex) {
    if (palette.stops.length < 2) {
      throw new PaletteError(`color_mappings[${mappingIndex}]: bresenham requires at least 2 stops`);
    }
    for (let j = 1; j < palette.stops.length; j++) {
      if (palette.stops[j].t < palette.stops[j - 1].t) {
        throw new PaletteError(`color_mappings[${mappingIndex}]: bresenham stops not sorted by t`);
      }
    }
    for (let j = 0; j < palette.stops.length; j++) {
      const stop = palette.stops[j];
      if (stop.t < 0.0 || stop.t > 1.0) {
        throw new PaletteError(
          `color_mappings[${mappingIndex}].stops[${j}]: t=${stop.t} outside [0.0, 1.0]`,
        );
      }
      if (stop.filament < 1 || stop.filament > MAX_FILAMENTS) {
        throw new PaletteError(
          `color_mappings[${mappingIndex}].stops[${j}]: filament ${stop.filament} outside range [1, ${MAX_FILAMENTS}]`,
        );
      }
    }
  },
  toJson(palette) {
    return { type: 'bresenham', stops: palette.stops.map((s) => [s.t, s.filament]) };
  },
  parse(raw) {
    const rawStops = raw['stops'];
    if (!Array.isArray(rawStops) || rawStops.length < 2) {
      throw new PaletteError('Bresenham palette requires at least 2 stops');
    }
    const stops: GradientStop[] = [];
    for (let i = 0; i < rawStops.length; i++) {
      const s = rawStops[i];
      if (!Array.isArray(s) || s.length !== 2) {
        throw new PaletteError(`Bresenham stop ${i} must be in format [t, filament]`);
      }
      if (typeof s[0] !== 'number') {
        throw new PaletteError(`Bresenham stop ${i}: t must be a number, got ${typeof s[0]}`);
      }
      if (typeof s[1] !== 'number' || !Number.isInteger(s[1])) {
        throw new PaletteError(`Bresenham stop ${i}: filament must be an integer, got ${typeof s[1]}`);
      }
      stops.push({ t: s[0] as number, filament: s[1] as number });
    }
    return { type: 'bresenham', stops };
  },
};

const strategies = new Map<string, PaletteStrategy>();

export function registerPalette(strategy: PaletteStrategy): void {
  strategies.set(strategy.type, strategy);
}

/** Backward-compat aliases for renamed palette types. */
const paletteAliases: Record<string, string> = {
  gradient: 'bresenham',
};

export function getPaletteStrategy(type: string): PaletteStrategy {
  const resolved = paletteAliases[type] ?? type;
  const strategy = strategies.get(resolved);
  if (!strategy) throw new PaletteError(`Unknown palette type: '${type}'`);
  return strategy;
}

/** Get all registered palette type names. */
export function getPaletteTypes(): string[] {
  return [...strategies.keys()];
}

// Register built-in palette strategies
registerPalette(cyclicStrategy as PaletteStrategy);
registerPalette(bresenhamStrategy as PaletteStrategy);

// --- Transition palette ---

/**
 * Build a layer→filament map using tapered cyclic alternation.
 *
 * For each segment between adjacent stops, if the filaments differ:
 * - Compute a transition band of width W centered at the segment midpoint
 * - Outside the band: solid fill of the nearer stop's filament
 * - Inside the band: tapered alternation from edge to center
 */
export function buildTransitionLayerMap(
  totalLayers: number,
  stops: readonly [number, number][],
  transitionWidth: TransitionWidth,
  maxCycleLength: number,
  ctx: PaletteContext,
): Uint8Array {
  const result = new Uint8Array(totalLayers);
  if (totalLayers === 0) return result;
  if (stops.length < 2) {
    result.fill(stops.length === 1 ? stops[0][1] : 1);
    return result;
  }

  const maxLayer = totalLayers - 1;

  // Fill layers before the first stop and after the last stop
  const firstStopLayer = Math.round(stops[0][0] * maxLayer);
  const lastStopLayer = Math.round(stops[stops.length - 1][0] * maxLayer);
  for (let l = 0; l < firstStopLayer; l++) {
    result[l] = stops[0][1];
  }
  for (let l = lastStopLayer + 1; l < totalLayers; l++) {
    result[l] = stops[stops.length - 1][1];
  }

  // Process each segment between consecutive stops
  for (let segIdx = 0; segIdx < stops.length - 1; segIdx++) {
    const fi = stops[segIdx][1];
    const fi1 = stops[segIdx + 1][1];
    const segStartLayer = Math.round(stops[segIdx][0] * maxLayer);
    const segEndLayer = Math.round(stops[segIdx + 1][0] * maxLayer);
    const segLength = segEndLayer - segStartLayer + 1; // inclusive layer count

    if (fi === fi1 || segLength <= 1) {
      for (let l = segStartLayer; l <= Math.min(segEndLayer, maxLayer); l++) {
        result[l] = fi;
      }
      continue;
    }

    // Compute band width W
    let W: number;
    if (transitionWidth.mode === 'auto') {
      // Equal-region sizing: N stops → (2N-1) equal regions
      // Each transition band = segLength × (N-1)/(2N-1)
      const N = stops.length;
      W = Math.round(segLength * (N - 1) / (2 * N - 1));
    } else if (transitionWidth.mode === 'percent') {
      W = Math.round(segLength * transitionWidth.value);
    } else {
      W = Math.round(transitionWidth.value / ctx.layerHeightMm);
    }
    W = Math.max(0, Math.min(W, segLength));

    if (W <= 0) {
      // No transition band — hard cut at midpoint
      const mid = (segStartLayer + segEndLayer) / 2;
      for (let l = segStartLayer; l <= Math.min(segEndLayer, maxLayer); l++) {
        result[l] = l < mid ? fi : fi1;
      }
      continue;
    }

    // Band positioning: for auto mode with 3+ stops, offset the band so
    // edge stops (first/last) get equal solid regions as interior stops.
    // Edge stops only receive solid from one segment, while interior stops
    // accumulate from two. Without offset, interior stops get 2× the solid.
    let bandStart: number;
    let bandEnd: number;
    const nonBand = segLength - W;

    if (transitionWidth.mode === 'auto' && stops.length > 2) {
      let solidBefore: number;
      if (segIdx === 0) {
        // First segment: edge stop on left gets 2/3 of non-band
        solidBefore = Math.round(nonBand * 2 / 3);
      } else if (segIdx === stops.length - 2) {
        // Last segment: edge stop on right gets 2/3, left gets 1/3
        solidBefore = Math.round(nonBand / 3);
      } else {
        // Interior segment: both stops are interior, center the band
        solidBefore = Math.round(nonBand / 2);
      }
      bandStart = Math.max(segStartLayer, segStartLayer + solidBefore);
      bandEnd = Math.min(segEndLayer + 1, bandStart + W);
    } else {
      // Centered for explicit width modes and 2-stop auto
      const bandCenter = Math.round((segStartLayer + segEndLayer) / 2);
      const halfW = Math.floor(W / 2);
      bandStart = Math.max(segStartLayer, bandCenter - halfW);
      bandEnd = Math.min(segEndLayer + 1, bandStart + W);
    }

    // Fill solid regions around the band
    for (let l = segStartLayer; l < bandStart && l < totalLayers; l++) {
      result[l] = fi;
    }
    for (let l = bandEnd; l <= Math.min(segEndLayer, maxLayer); l++) {
      result[l] = fi1;
    }

    // Transition band: Bresenham-style error accumulation with max-run enforcement.
    // The density of fi1 ramps from minRate to maxRate across the band.
    // minRate/maxRate are chosen so that at constant density the natural
    // Bresenham pattern already respects maxCycleLength (safety forcing
    // is retained as a backstop for rounding edge cases).
    const bandLength = bandEnd - bandStart;
    if (bandLength <= 0) continue;

    const minRate = 1 / (maxCycleLength + 1);
    const maxRate = maxCycleLength / (maxCycleLength + 1);

    let error = 0;
    let runA = 0; // consecutive fi count
    let runB = 0; // consecutive fi1 count

    for (let i = 0; i < bandLength; i++) {
      const layer = bandStart + i;
      if (layer >= totalLayers) break;

      // Target density of fi1: ramps from minRate to maxRate across the band
      const t = bandLength > 1 ? i / (bandLength - 1) : 0.5;
      const density = minRate + (maxRate - minRate) * t;
      error += density;

      const forceB = runA >= maxCycleLength;
      const forceA = runB >= maxCycleLength;

      let chooseB: boolean;
      if (forceB) {
        chooseB = true;
      } else if (forceA) {
        chooseB = false;
      } else {
        chooseB = error >= 0.5;
      }

      if (chooseB) {
        result[layer] = fi1;
        error -= 1.0;
        runB++;
        runA = 0;
      } else {
        result[layer] = fi;
        runA++;
        runB = 0;
      }
    }
  }

  return result;
}

/**
 * Apply a transition palette across face layer indices.
 */
export function applyTransition(
  layerIndices: Uint32Array,
  regionLayers: number,
  stops: readonly [number, number][],
  transitionWidth: TransitionWidth,
  maxCycleLength: number,
  ctx: PaletteContext,
): Uint8Array {
  const layerMap = buildTransitionLayerMap(regionLayers, stops, transitionWidth, maxCycleLength, ctx);
  const n = layerIndices.length;
  const result = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const idx = Math.max(0, Math.min(layerIndices[i], layerMap.length - 1));
    result[i] = layerMap[idx];
  }
  return result;
}

const transitionStrategy: PaletteStrategy<TransitionPalette> = {
  type: 'transition',
  apply(layerIndices, regionLayers, palette, ctx) {
    const stops = palette.stops.map(s => [s.t, s.filament] as [number, number]);
    return applyTransition(layerIndices, regionLayers, stops, palette.transitionWidth, palette.maxCycleLength, ctx);
  },
  buildLayerMap(regionLayers, palette, ctx) {
    const stops = palette.stops.map(s => [s.t, s.filament] as [number, number]);
    return buildTransitionLayerMap(regionLayers, stops, palette.transitionWidth, palette.maxCycleLength, ctx);
  },
  validate(palette, mappingIndex) {
    if (palette.stops.length < 2) {
      throw new PaletteError(`color_mappings[${mappingIndex}]: transition requires at least 2 stops`);
    }
    for (let j = 1; j < palette.stops.length; j++) {
      if (palette.stops[j].t < palette.stops[j - 1].t) {
        throw new PaletteError(`color_mappings[${mappingIndex}]: transition stops not sorted by t`);
      }
    }
    for (let j = 0; j < palette.stops.length; j++) {
      const stop = palette.stops[j];
      if (stop.t < 0.0 || stop.t > 1.0) {
        throw new PaletteError(
          `color_mappings[${mappingIndex}].stops[${j}]: t=${stop.t} outside [0.0, 1.0]`,
        );
      }
      if (stop.filament < 1 || stop.filament > MAX_FILAMENTS) {
        throw new PaletteError(
          `color_mappings[${mappingIndex}].stops[${j}]: filament ${stop.filament} outside range [1, ${MAX_FILAMENTS}]`,
        );
      }
    }
    if (palette.maxCycleLength < 1) {
      throw new PaletteError(`color_mappings[${mappingIndex}]: maxCycleLength must be >= 1`);
    }
    if (palette.transitionWidth.mode === 'percent') {
      if (palette.transitionWidth.value <= 0 || palette.transitionWidth.value > 1) {
        throw new PaletteError(`color_mappings[${mappingIndex}]: percent transition width must be in (0, 1]`);
      }
    }
    if (palette.transitionWidth.mode === 'mm') {
      if (palette.transitionWidth.value <= 0) {
        throw new PaletteError(`color_mappings[${mappingIndex}]: mm transition width must be > 0`);
      }
    }
  },
  toJson(palette) {
    const tw: Record<string, unknown> = { mode: palette.transitionWidth.mode };
    if ('value' in palette.transitionWidth) {
      tw['value'] = palette.transitionWidth.value;
    }
    return {
      type: 'transition',
      stops: palette.stops.map(s => [s.t, s.filament]),
      transition_width: tw,
      max_cycle_length: palette.maxCycleLength,
    };
  },
  parse(raw) {
    const rawStops = raw['stops'];
    if (!Array.isArray(rawStops) || rawStops.length < 2) {
      throw new PaletteError('Transition palette requires at least 2 stops');
    }
    const stops: GradientStop[] = [];
    for (let i = 0; i < rawStops.length; i++) {
      const s = rawStops[i];
      if (!Array.isArray(s) || s.length !== 2) {
        throw new PaletteError(`Transition stop ${i} must be in format [t, filament]`);
      }
      if (typeof s[0] !== 'number') {
        throw new PaletteError(`Transition stop ${i}: t must be a number`);
      }
      if (typeof s[1] !== 'number' || !Number.isInteger(s[1])) {
        throw new PaletteError(`Transition stop ${i}: filament must be an integer`);
      }
      stops.push({ t: s[0] as number, filament: s[1] as number });
    }

    let transitionWidthResult: TransitionWidth = { mode: 'auto' };
    const rawTW = raw['transition_width'];
    if (rawTW && typeof rawTW === 'object' && !Array.isArray(rawTW)) {
      const twObj = rawTW as Record<string, unknown>;
      const mode = twObj['mode'];
      if (mode === 'percent') {
        if (typeof twObj['value'] !== 'number') {
          throw new PaletteError("transition_width mode 'percent' requires a numeric 'value'");
        }
        transitionWidthResult = { mode: 'percent', value: twObj['value'] as number };
      } else if (mode === 'mm') {
        if (typeof twObj['value'] !== 'number') {
          throw new PaletteError("transition_width mode 'mm' requires a numeric 'value'");
        }
        transitionWidthResult = { mode: 'mm', value: twObj['value'] as number };
      } else if (mode === 'auto') {
        transitionWidthResult = { mode: 'auto' };
      } else {
        throw new PaletteError(`Unknown transition_width mode: '${String(mode)}'`);
      }
    }

    const rawMCL = raw['max_cycle_length'];
    let maxCycleLength = 2;
    if (rawMCL !== undefined) {
      if (typeof rawMCL !== 'number' || !Number.isInteger(rawMCL) || rawMCL < 1) {
        throw new PaletteError('max_cycle_length must be a positive integer');
      }
      maxCycleLength = rawMCL;
    }

    return { type: 'transition' as const, stops, transitionWidth: transitionWidthResult, maxCycleLength };
  },
};

registerPalette(transitionStrategy as PaletteStrategy);
