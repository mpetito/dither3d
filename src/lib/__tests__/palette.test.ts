/** Tests for cyclic and bresenham palette application. */
import { describe, it, expect } from 'vitest';
import { applyCyclic, buildBresenhamLayerMap, applyBresenham, buildTransitionLayerMap, applyTransition, getPaletteStrategy } from '../palette';

describe('applyCyclic', () => {
  it('applies a 2-color repeating pattern', () => {
    const layers = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const result = applyCyclic(layers, [1, 2]);
    expect(Array.from(result)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('applies a 3-color repeating pattern', () => {
    const layers = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const result = applyCyclic(layers, [1, 2, 3]);
    expect(Array.from(result)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('handles a single-color pattern', () => {
    const layers = new Uint32Array([0, 1, 2]);
    const result = applyCyclic(layers, [5]);
    expect(Array.from(result)).toEqual([5, 5, 5]);
  });

  it('assigns first pattern element to layer 0', () => {
    const layers = new Uint32Array([0]);
    const result = applyCyclic(layers, [7, 8, 9]);
    expect(result[0]).toBe(7);
  });
});

describe('buildBresenhamLayerMap', () => {
  it('builds a 2-stop bresenham map', () => {
    const map = buildBresenhamLayerMap(10, [[0.0, 1], [1.0, 2]]);
    expect(map.length).toBe(10);
    // First layer should be color 1
    expect(map[0]).toBe(1);
    // Last layer should be color 2
    expect(map[9]).toBe(2);
    // Both colors should appear due to dithering
    const values = new Set(Array.from(map));
    expect(values.has(1)).toBe(true);
    expect(values.has(2)).toBe(true);
  });

  it('builds a 3-stop bresenham map', () => {
    const map = buildBresenhamLayerMap(20, [[0.0, 1], [0.5, 2], [1.0, 3]]);
    expect(map.length).toBe(20);
    expect(map[0]).toBe(1);
    expect(map[19]).toBe(3);
    // Middle region should contain color 2
    const mid = Array.from(map.slice(8, 12));
    expect(mid.some((v) => v === 2)).toBe(true);
  });

  it('returns first stop color for single layer', () => {
    const map = buildBresenhamLayerMap(1, [[0.0, 5], [1.0, 6]]);
    expect(map.length).toBe(1);
    expect(map[0]).toBe(5);
  });
});

describe('applyBresenham', () => {
  it('maps face layer indices through bresenham', () => {
    const layers = new Uint32Array([0, 4, 9]);
    const result = applyBresenham(layers, 10, [[0.0, 1], [1.0, 2]]);
    expect(result.length).toBe(3);
    // Layer 0 → first stop color
    expect(result[0]).toBe(1);
    // Layer 9 → last stop color
    expect(result[2]).toBe(2);
  });

  it('clamps out-of-range indices', () => {
    const layers = new Uint32Array([0, 100]);
    const result = applyBresenham(layers, 10, [[0.0, 1], [1.0, 2]]);
    // Index 100 should be clamped to last layer
    expect(result[1]).toBe(2);
  });

  it('requires at least 2 stops', () => {
    const layers = new Uint32Array([0]);
    expect(() => applyBresenham(layers, 10, [[0.5, 1]])).toThrow('at least 2 stops');
  });
});

describe('buildTransitionLayerMap', () => {
  it('solid region when both stops same filament', () => {
    const map = buildTransitionLayerMap(10, [[0, 1], [1, 1]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    expect(Array.from(map)).toEqual(Array(10).fill(1));
  });

  it('two-stop transition has both colors', () => {
    const map = buildTransitionLayerMap(20, [[0, 1], [1, 2]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    expect(map.length).toBe(20);
    const vals = new Set(Array.from(map));
    expect(vals.has(1)).toBe(true);
    expect(vals.has(2)).toBe(true);
  });

  it('first layers are solid left filament', () => {
    const map = buildTransitionLayerMap(50, [[0, 1], [1, 2]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    // first few layers should be solid filament 1
    expect(map[0]).toBe(1);
    expect(map[1]).toBe(1);
  });

  it('last layers are solid right filament', () => {
    const map = buildTransitionLayerMap(50, [[0, 1], [1, 2]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    expect(map[49]).toBe(2);
    expect(map[48]).toBe(2);
  });

  it('returns single-element for totalLayers=1', () => {
    const map = buildTransitionLayerMap(1, [[0, 3], [1, 4]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    expect(map.length).toBe(1);
  });

  it('returns empty for totalLayers=0', () => {
    const map = buildTransitionLayerMap(0, [[0, 1], [1, 2]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    expect(map.length).toBe(0);
  });

  it('percent width mode works', () => {
    const map = buildTransitionLayerMap(20, [[0, 1], [1, 2]], { mode: 'percent', value: 0.5 }, 2, { layerHeightMm: 0.12 });
    expect(map.length).toBe(20);
    const vals = new Set(Array.from(map));
    expect(vals.has(1)).toBe(true);
    expect(vals.has(2)).toBe(true);
  });

  it('mm width mode works', () => {
    const map = buildTransitionLayerMap(100, [[0, 1], [1, 2]], { mode: 'mm', value: 2.4 }, 2, { layerHeightMm: 0.12 });
    expect(map.length).toBe(100);
    const vals = new Set(Array.from(map));
    expect(vals.has(1)).toBe(true);
    expect(vals.has(2)).toBe(true);
  });

  it('maxCycleLength=1 produces strict alternation in band', () => {
    const map = buildTransitionLayerMap(40, [[0, 1], [1, 2]], { mode: 'percent', value: 1.0 }, 1, { layerHeightMm: 0.12 });
    // With maxCycleLength=1 and 100% width, every layer alternates
    let maxRun = 1;
    let currentRun = 1;
    for (let i = 1; i < map.length; i++) {
      if (map[i] === map[i - 1]) {
        currentRun++;
        if (currentRun > maxRun) maxRun = currentRun;
      } else {
        currentRun = 1;
      }
    }
    expect(maxRun).toBeLessThanOrEqual(1);
  });

  it('no run in full-width band exceeds maxCycleLength', () => {
    for (const mc of [1, 2, 3, 5]) {
      const map = buildTransitionLayerMap(100, [[0, 1], [1, 2]], { mode: 'percent', value: 1.0 }, mc, { layerHeightMm: 0.12 });
      let maxRun = 1;
      let currentRun = 1;
      for (let i = 1; i < map.length; i++) {
        if (map[i] === map[i - 1]) {
          currentRun++;
          if (currentRun > maxRun) maxRun = currentRun;
        } else {
          currentRun = 1;
        }
      }
      expect(maxRun).toBeLessThanOrEqual(mc);
    }
  });

  it('fi1 density increases across the band', () => {
    const map = buildTransitionLayerMap(100, [[0, 1], [1, 2]], { mode: 'percent', value: 1.0 }, 2, { layerHeightMm: 0.12 });
    // Count fi1 in first quarter vs last quarter
    let firstQ = 0;
    let lastQ = 0;
    for (let i = 0; i < 25; i++) {
      if (map[i] === 2) firstQ++;
    }
    for (let i = 75; i < 100; i++) {
      if (map[i] === 2) lastQ++;
    }
    expect(lastQ).toBeGreaterThan(firstQ);
  });

  it('three stops produce three regions', () => {
    const map = buildTransitionLayerMap(60, [[0, 1], [0.5, 2], [1, 3]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    const vals = new Set(Array.from(map));
    expect(vals.has(1)).toBe(true);
    expect(vals.has(2)).toBe(true);
    expect(vals.has(3)).toBe(true);
  });

  it('three-stop auto gives equal solid regions for edge and interior stops', () => {
    const map = buildTransitionLayerMap(100, [[0, 1], [0.5, 2], [1, 3]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    // Count contiguous solid regions at start (filament 1) and end (filament 3)
    let solidFirst = 0;
    for (let i = 0; i < map.length && map[i] === 1; i++) solidFirst++;
    let solidLast = 0;
    for (let i = map.length - 1; i >= 0 && map[i] === 3; i--) solidLast++;
    // With 3 stops auto: (2N-1)=5 equal regions, each ~20 layers.
    // Edge solids should be roughly equal to each other and close to 20.
    expect(Math.abs(solidFirst - solidLast)).toBeLessThanOrEqual(2);
    expect(solidFirst).toBeGreaterThanOrEqual(18);
    expect(solidFirst).toBeLessThanOrEqual(23);
    expect(solidLast).toBeGreaterThanOrEqual(18);
    expect(solidLast).toBeLessThanOrEqual(23);
  });
});

describe('applyTransition', () => {
  it('maps layer indices through transition', () => {
    const layers = new Uint32Array([0, 4, 9]);
    const result = applyTransition(layers, 10, [[0, 1], [1, 2]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    expect(result.length).toBe(3);
    expect(result[0]).toBe(1); // first layer = first filament
  });

  it('clamps out-of-range indices', () => {
    const layers = new Uint32Array([0, 100]);
    const result = applyTransition(layers, 10, [[0, 1], [1, 2]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    expect(result[1]).toBe(2); // out of range should clamp to last
  });
});

describe('getPaletteStrategy', () => {
  it('resolves "gradient" as alias for "bresenham"', () => {
    const strategy = getPaletteStrategy('gradient');
    expect(strategy.type).toBe('bresenham');
  });

  it('throws for unknown palette type', () => {
    expect(() => getPaletteStrategy('nonexistent')).toThrow('Unknown palette type');
  });
});

describe('buildTransitionLayerMap edge fill', () => {
  it('fills layers before first stop with first filament', () => {
    // Stops at t=0.5 and t=1.0 — layers 0..49 should be first filament
    const map = buildTransitionLayerMap(100, [[0.5, 3], [1, 4]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    for (let l = 0; l < 49; l++) {
      expect(map[l]).toBe(3);
    }
  });

  it('fills layers after last stop with last filament', () => {
    // Stops at t=0 and t=0.5 — layers after 50 should be last filament
    const map = buildTransitionLayerMap(100, [[0, 3], [0.5, 4]], { mode: 'auto' }, 2, { layerHeightMm: 0.12 });
    for (let l = 51; l < 100; l++) {
      expect(map[l]).toBe(4);
    }
  });
});

describe('transitionStrategy.parse validation', () => {
  it('throws for percent mode without numeric value', () => {
    const strategy = getPaletteStrategy('transition');
    expect(() => strategy.parse({
      type: 'transition',
      stops: [[0, 1], [1, 2]],
      transition_width: { mode: 'percent', value: 'bad' },
    })).toThrow("requires a numeric 'value'");
  });

  it('throws for mm mode without numeric value', () => {
    const strategy = getPaletteStrategy('transition');
    expect(() => strategy.parse({
      type: 'transition',
      stops: [[0, 1], [1, 2]],
      transition_width: { mode: 'mm' },
    })).toThrow("requires a numeric 'value'");
  });

  it('throws for unknown transition_width mode', () => {
    const strategy = getPaletteStrategy('transition');
    expect(() => strategy.parse({
      type: 'transition',
      stops: [[0, 1], [1, 2]],
      transition_width: { mode: 'invalid' },
    })).toThrow('Unknown transition_width mode');
  });

  it('throws for invalid max_cycle_length', () => {
    const strategy = getPaletteStrategy('transition');
    expect(() => strategy.parse({
      type: 'transition',
      stops: [[0, 1], [1, 2]],
      max_cycle_length: 0,
    })).toThrow('max_cycle_length must be a positive integer');
  });

  it('defaults omitted fields without error', () => {
    const strategy = getPaletteStrategy('transition');
    const result = strategy.parse({
      type: 'transition',
      stops: [[0, 1], [1, 2]],
    });
    expect(result.type).toBe('transition');
    if (result.type !== 'transition') throw new Error('unreachable');
    expect(result.transitionWidth).toEqual({ mode: 'auto' });
    expect(result.maxCycleLength).toBe(2);
  });
});
