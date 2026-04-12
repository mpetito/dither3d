# Plan: Bresenham Rename + Transition Palette + PaletteContext

**Spec**: [spec.md](spec.md) | **Date**: 2026-04-11

## Summary

Three coordinated changes: (1) rename the existing `gradient` palette type to
`bresenham` everywhere, (2) introduce a `PaletteContext` bag parameter on the
`PaletteStrategy` interface, and (3) add a new `transition` palette type with
tapered cyclic alternation for perceptually convincing FDM color blending.

The work is organized into 7 phases. Each phase leaves the codebase compilable
and test-passing.

---

## Phase 1 --- `PaletteContext` Interface Change

**Goal**: Add the `PaletteContext` bag to the `PaletteStrategy` interface and
thread it through all call sites. This is a mechanical signature change ---
no behavior changes, no renames.

### Steps

1. [ ] **`src/lib/palette.ts`** --- Add `PaletteContext` interface (exported):
   ```ts
   export interface PaletteContext {
     layerHeightMm: number;
   }
   ```

2. [ ] **`src/lib/palette.ts`** --- Update `PaletteStrategy<T>` interface:
   - `apply(..., palette: T, ctx: PaletteContext): Uint8Array`
   - `buildLayerMap(..., palette: T, ctx: PaletteContext): Uint8Array`
   - `validate`, `toJson`, `parse` signatures unchanged

3. [ ] **`src/lib/palette.ts`** --- Update `cyclicStrategy` object:
   - `apply(_layerIndices, _regionLayers, palette, _ctx)` --- add `_ctx` param, ignore it
   - `buildLayerMap(regionLayers, palette, _ctx)` --- add `_ctx` param, ignore it

4. [ ] **`src/lib/palette.ts`** --- Update `gradientStrategy` object:
   - `apply(layerIndices, regionLayers, palette, _ctx)` --- add `_ctx` param, ignore it
   - `buildLayerMap(regionLayers, palette, _ctx)` --- add `_ctx` param, ignore it

5. [ ] **`src/lib/pipeline.ts`** --- `buildClusterLayerData()` (~L136):
   - Add `layerHeightMm` as a function parameter (it's passed as `config.layerHeightMm` from both callers)
   - Construct `const ctx: PaletteContext = { layerHeightMm }`
   - Pass `ctx` to `strategy.buildLayerMap(info.regionLayers, info.palette, ctx)`

6. [ ] **`src/lib/pipeline.ts`** --- `runPipeline()` (~L254):
   - Construct `const ctx: PaletteContext = { layerHeightMm: config.layerHeightMm }`
   - Pass `ctx` to `strategy.apply(layerIndices, regionLayers, palette, ctx)`
   - Pass `config.layerHeightMm` to `buildClusterLayerData()` call (~L280)

7. [ ] **`src/lib/__tests__/palette.test.ts`** --- Update all existing test calls:
   - Every `strategy.apply(...)` and `strategy.buildLayerMap(...)` call gains a
     `{ layerHeightMm: 0.12 }` trailing argument
   - This is mechanical; use search-and-replace

### Verification

```bash
npx tsc --noEmit   # All types resolve
npm test            # Existing tests pass (with updated signatures)
```

---

## Phase 2 --- Rename `gradient` -> `bresenham`

**Goal**: Systematic rename of all `gradient` identifiers to `bresenham`.
Behavior-preserving --- the Bresenham algorithm is unchanged.

### 2a. Type System (`src/lib/config.ts`)

1. [ ] Rename `GradientPalette` interface -> `BresenhamPalette` (L23-26)
2. [ ] Change type literal: `type: 'gradient'` -> `type: 'bresenham'`
3. [ ] Update `Palette` union type (L28) to reference `BresenhamPalette`
4. [ ] **Keep `GradientStop` unchanged** --- it's a data shape, not algorithm-specific

### 2b. Strategy Layer (`src/lib/palette.ts`)

5. [ ] Rename `buildGradientLayerMap()` -> `buildBresenhamLayerMap()` (L62)
6. [ ] Rename `applyGradient()` -> `applyBresenham()` (L118)
7. [ ] Rename `gradientStrategy` object -> `bresenhamStrategy` (L188)
8. [ ] Change `bresenhamStrategy.type` from `'gradient'` to `'bresenham'`
9. [ ] Update `bresenhamStrategy.toJson` to write `type: 'bresenham'`
10. [ ] Update `bresenhamStrategy.parse`:
    - Accept both `type: 'gradient'` and `type: 'bresenham'` in input
    - Always return `type: 'bresenham'` in the parsed object
11. [ ] Update `registerPalette(bresenhamStrategy)` call (bottom of file)
12. [ ] Update module doc comment at top of file

### 2c. Pipeline (`src/lib/pipeline.ts`)

13. [ ] Update any import references (`GradientPalette` -> `BresenhamPalette` if imported)

### 2d. UI Component Rename

14. [ ] **Rename file** `src/components/GradientEditor.tsx` -> `src/components/BresenhamEditor.tsx`
15. [ ] Inside `BresenhamEditor.tsx`:
    - Rename `GradientEditorProps` -> `BresenhamEditorProps`
    - Rename `GradientEditor` component -> `BresenhamEditor`
    - Rename `buildGradientCSS()` -> `buildBresenhamCSS()`
    - Update i18n key references: `gradientEditor.*` -> `bresenhamEditor.*`

16. [ ] **`src/components/PaletteMapper.tsx`**:
    - Update import: `GradientEditor` -> `BresenhamEditor` from `./BresenhamEditor`
    - `defaultPalette()`: change `'gradient'` case to `'bresenham'`, return `type: 'bresenham'`
    - Render condition: `mapping.outputPalette.type === 'gradient'` -> `'bresenham'`
    - Render `<BresenhamEditor>` with `type: 'bresenham'` in onChange

### 2e. Tests Rename

17. [ ] **Rename file** `src/components/__tests__/GradientEditor.test.tsx` -> `BresenhamEditor.test.tsx`
18. [ ] Inside `BresenhamEditor.test.tsx`:
    - Update import to `BresenhamEditor`
    - Update describe/it text: "GradientEditor" -> "BresenhamEditor"

19. [ ] **`src/lib/__tests__/palette.test.ts`**:
    - All `describe`/`it` text: "gradient" -> "bresenham"
    - Variable names: `gradientStrategy` -> `bresenhamStrategy`
    - Import updates if named imports are used
    - Type references: `GradientPalette` -> `BresenhamPalette`
    - Keep `GradientStop` references

20. [ ] **`src/lib/__tests__/config.test.ts`**:
    - Update JSON fixtures: `"type": "gradient"` -> `"type": "bresenham"`
    - Update variable names (e.g. `VALID_GRADIENT_JSON` -> `VALID_BRESENHAM_JSON`)
    - Update describe/it text
    - Add a test: parsing `type: 'gradient'` legacy JSON produces `BresenhamPalette`

### 2f. State/Context

21. [ ] **`src/state/AppContext.tsx`** --- Update `defaultConfig` if it contains
    `type: 'gradient'` -> change to `type: 'bresenham'`

### Verification

```bash
npx tsc --noEmit
npm test
npm run lint
```

---

## Phase 3 --- New `TransitionPalette` Type & Algorithm

**Goal**: Implement the core transition palette --- types, algorithm, strategy
registration. No UI yet.

### 3a. Config Types (`src/lib/config.ts`)

1. [ ] Add `TransitionWidth` type:
   ```ts
   export type TransitionWidth =
     | { mode: 'auto' }
     | { mode: 'percent'; value: number }
     | { mode: 'mm'; value: number };
   ```

2. [ ] Add `TransitionPalette` interface:
   ```ts
   export interface TransitionPalette {
     type: 'transition';
     stops: readonly GradientStop[];
     transitionWidth: TransitionWidth;
     maxCycleLength: number;
   }
   ```

3. [ ] Update `Palette` union:
   ```ts
   export type Palette = CyclicPalette | BresenhamPalette | TransitionPalette;
   ```

### 3b. Transition Algorithm (`src/lib/palette.ts`)

4. [ ] Implement `buildTransitionLayerMap(totalLayers, stops, transitionWidth, maxCycleLength, ctx)`:
   - For each layer 0..totalLayers-1, compute normalized position `t`
   - Find which segment `[ti, ti+1]` the layer falls in
   - If same filament on both sides -> assign directly
   - If different filaments:
     - Compute transition band width W from `transitionWidth` mode:
       - `auto`: `W = Math.round(segmentLayers * min(0.8, 1.6 / (nStops - 1)))`
       - `percent`: `W = Math.round(segmentLayers * value)`
       - `mm`: `W = Math.round(value / ctx.layerHeightMm)`
     - Compute band center (midpoint of segment in layer space)
     - Band spans `[center - W/2, center + W/2]`, clamped to segment
     - Outside band: solid left/right filament
     - Inside band: tapered alternation per spec 3b
   - Return `Uint8Array` layer map

5. [ ] Implement tapered alternation helper:
   - `d` = normalized distance from nearest band edge (0=edge, 1=center)
   - `runLength(d) = max(maxCycleLength, round(maxCycleLength / d))`,
     capped at reasonable max (e.g. `W/2`)
   - Left half of band: predominantly fi with fi+1 insertions
   - Right half of band: predominantly fi+1 with fi insertions
   - Center: strict `maxCycleLength` alternation

6. [ ] Implement `applyTransition()` --- calls `buildTransitionLayerMap`, then
   indexes into result for each face (same pattern as `applyBresenham`)

### 3c. Strategy Registration (`src/lib/palette.ts`)

7. [ ] Create `transitionStrategy: PaletteStrategy<TransitionPalette>`:

   - **`type`**: `'transition'`

   - **`buildLayerMap(regionLayers, palette, ctx)`**: Extract stops as
     `[t, filament][]` tuples (same as bresenham), call
     `buildTransitionLayerMap()`

   - **`apply(layerIndices, regionLayers, palette, ctx)`**: Call
     `buildLayerMap`, index into result

   - **`validate(palette, mappingIndex)`**:
     - `stops.length >= 2`
     - Stops sorted by `t`
     - `t` values in `[0.0, 1.0]`
     - Filament values in `[1, MAX_FILAMENTS]`
     - `maxCycleLength >= 1`
     - If `percent` mode: `value` in `(0, 1]`
     - If `mm` mode: `value > 0`

   - **`toJson(palette)`**: Serialize with snake_case keys:
     ```json
     { "type": "transition", "stops": [[t, fil], ...],
       "transition_width": { "mode": "auto" },
       "max_cycle_length": 2 }
     ```

   - **`parse(raw)`**: Parse with defaults:
     - `transitionWidth` defaults to `{ mode: 'auto' }` if missing
     - `maxCycleLength` defaults to `2` if missing
     - Validate stops format (same as bresenham parser)

8. [ ] Register: `registerPalette(transitionStrategy)` at module bottom

### Verification

```bash
npx tsc --noEmit
npm test            # Existing tests pass; new algorithm tests in Phase 6
```

---

## Phase 4 --- `TransitionEditor` UI

**Goal**: New editor component and `PaletteMapper` integration.

### Steps

1. [ ] **Create `src/components/TransitionEditor.tsx`**:

   Props interface:
   ```ts
   interface TransitionEditorProps {
     stops: GradientStop[];
     transitionWidth: TransitionWidth;
     maxCycleLength: number;
     onChange: (palette: Partial<TransitionPalette>) => void;
   }
   ```

   UI elements:
   - **Stops editor**: Same stop-list UI pattern as `BresenhamEditor`
     (t input + filament select + remove button per stop, add button)
   - **Transition width mode**: `<select>` with options `auto`, `percent`, `mm`
     - When `percent` or `mm`: show numeric `<input>` with appropriate min/step
     - When `auto`: hide numeric input
   - **Max cycle length**: Integer `<input>` with `min=1`, default 2
   - **Preview bar**: Horizontal bar using `buildTransitionLayerMap()` with
     a representative layer count (e.g. 100) and a dummy
     `PaletteContext { layerHeightMm: 0.12 }` for preview purposes

2. [ ] **Update `src/components/PaletteMapper.tsx`**:
   - Add import: `import { TransitionEditor } from './TransitionEditor'`
   - `defaultPalette()`: add `'transition'` case returning:
     ```ts
     { type: 'transition', stops: [{ t: 0, filament: 1 }, { t: 1, filament: 2 }],
       transitionWidth: { mode: 'auto' }, maxCycleLength: 2 }
     ```
   - Add render block for `mapping.outputPalette.type === 'transition'`:
     render `<TransitionEditor>` passing stops, transitionWidth,
     maxCycleLength, and onChange callback

### Verification

```bash
npx tsc --noEmit
npm run dev         # Manually verify: palette type dropdown shows
                    #   "Cyclic", "Bresenham (even distribution)", "Transition (tapered blending)"
                    # Selecting Transition shows stops + width mode + cycle length controls
```

---

## Phase 5 --- i18n Updates

**Goal**: Rename gradient keys to bresenham, add transition keys across all
5 locale files.

### Files

All 5 locale files in `src/i18n/locales/`: `en.json`, `fr.json`, `es.json`,
`de.json`, `zh.json`.

### Changes per file

1. [ ] **`paletteMapper` section**:
   - Remove `"typeGradient"` key
   - Add `"typeBresenham"`: localized "Bresenham (even distribution)"
   - Add `"typeTransition"`: localized "Transition (tapered blending)"

2. [ ] **Rename `gradientEditor` section** -> `bresenhamEditor`:
   - Same keys (`label`, `removeStopTooltip`, `addStop`)
   - Update `label` text from "Gradient (...)" to "Bresenham (...)"

3. [ ] **Add `transitionEditor` section**:
   ```json
   "transitionEditor": {
     "label": "Transition ({{count}} stops)",
     "removeStopTooltip": "Remove stop",
     "addStop": "+ Add stop",
     "transitionWidth": "Transition Width",
     "widthModeAuto": "Auto",
     "widthModePercent": "Percentage",
     "widthModeMm": "Millimeters",
     "maxCycleLength": "Max Cycle Length",
     "maxCycleLengthHint": "Maximum consecutive layers of one color at tightest point"
   }
   ```

4. [ ] **Update `samples` section** (if sample label keys change):
   - `benchy2colorGradient` -> `benchy2colorBresenham` (label and description)
   - Add `benchy2colorTransition` label and description

### Verification

```bash
npx tsc --noEmit
npm run dev         # Check all text renders, no missing-key warnings in console
```

---

## Phase 6 --- Tests

**Goal**: Comprehensive test coverage for the rename, PaletteContext, and
transition algorithm.

### 6a. Palette Algorithm Tests (`src/lib/__tests__/palette.test.ts`)

1. [ ] **PaletteContext passthrough tests**:
   - Cyclic strategy works with any `PaletteContext` (ignores it)
   - Bresenham strategy works with any `PaletteContext` (ignores it)
   - Transition strategy uses `ctx.layerHeightMm` for mm width mode

2. [ ] **Transition algorithm tests** (new `describe('transitionStrategy', ...)`):
   - **Solid segments**: stops `[0,1], [1,1]` -> all layers are filament 1
   - **Basic transition**: stops `[0,1], [1,2]` -> solid 1, tapered mix, solid 2
   - **Center symmetry**: tightest alternation at midpoint between stops
   - **`maxCycleLength` enforcement**: at band center, no run > `maxCycleLength`
   - **`maxCycleLength = 1`**: strict single-layer alternation at center
   - **`percent` mode**: transition band width matches expected layer count
   - **`mm` mode**: `2.4mm / 0.12mm = 20 layers` transition width
   - **`auto` mode**: width auto-computed, no overlap between segments
   - **Multi-stop**: 3+ stops produce independent transition bands per segment
   - **Edge cases**: 1-layer region, 2-layer region, band wider than segment
     (clamps)

3. [ ] **Backward compatibility test**:
   - `bresenhamStrategy.parse({ type: 'gradient', stops: [...] })` returns
     `{ type: 'bresenham', stops: [...] }`

### 6b. Config Round-Trip Tests (`src/lib/__tests__/config.test.ts`)

4. [ ] `TransitionPalette` serializes via `toJson` and parses back identically
5. [ ] Missing `transition_width` defaults to `{ mode: 'auto' }`
6. [ ] Missing `max_cycle_length` defaults to `2`
7. [ ] Legacy `type: 'gradient'` JSON parses to `BresenhamPalette`

### 6c. Component Tests

8. [ ] **`src/components/__tests__/BresenhamEditor.test.tsx`**: Existing tests
   pass with updated imports/names (done in Phase 2e)

9. [ ] **Create `src/components/__tests__/TransitionEditor.test.tsx`**:
   - Renders stops list, width mode selector, max cycle length input
   - Changing width mode hides/shows value input
   - Changing stops calls onChange with updated stops
   - Renders preview bar

### Verification

```bash
npm test            # All tests pass
npm test -- --coverage   # Check transition code is covered
```

---

## Phase 7 --- Sample Configs & Cleanup

**Goal**: Rename sample files, add transition sample, update `samples.ts`.

### Steps

1. [ ] **Rename file** `public/samples/3DBenchy-2color-gradient.config.json` ->
   `public/samples/3DBenchy-2color-bresenham.config.json`

2. [ ] Inside the renamed file: change `"type": "gradient"` -> `"type": "bresenham"`

3. [ ] **Create** `public/samples/3DBenchy-2color-transition.config.json`:
   ```json
   {
     "layer_height_mm": 0.08,
     "target_format": "both",
     "filament_colors": ["#FFFFFF", "#CC0000", "#0000CC"],
     "color_mappings": [
       {
         "input_filament": 1,
         "output_palette": {
           "type": "transition",
           "stops": [[0.0, 1], [1.0, 2]],
           "transition_width": { "mode": "auto" },
           "max_cycle_length": 2
         }
       }
     ]
   }
   ```

4. [ ] **`src/lib/samples.ts`** --- Update SAMPLES array:
   - Rename `'benchy-2color-gradient'` entry -> `'benchy-2color-bresenham'`
   - Update `configPath` to `'/samples/3DBenchy-2color-bresenham.config.json'`
   - Update `labelKey`/`descriptionKey` to `'samples.benchy2colorBresenham.*'`
   - Add new entry for `'benchy-2color-transition'`:
     ```ts
     {
       id: 'benchy-2color-transition',
       modelPath: '/samples/3DBenchy-2color.3mf',
       configPath: '/samples/3DBenchy-2color-transition.config.json',
       labelKey: 'samples.benchy2colorTransition.label',
       descriptionKey: 'samples.benchy2colorTransition.description',
     }
     ```

5. [ ] Remove any dead code from the old spec 008 gap-clamping implementation
   if it still exists (check for `maxTransitionGapMm` references)

### Verification

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build       # Full production build succeeds
npm run dev         # Manually load each sample; bresenham and transition both work
```

---

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `src/lib/palette.ts` | Add `PaletteContext`, update signatures, rename gradient->bresenham, add transition strategy | 1, 2b, 3b-c |
| `src/lib/config.ts` | Rename `GradientPalette`->`BresenhamPalette`, add `TransitionWidth`+`TransitionPalette`, update `Palette` union | 2a, 3a |
| `src/lib/pipeline.ts` | Thread `PaletteContext` through call sites | 1 |
| `src/lib/samples.ts` | Rename gradient sample, add transition sample | 7 |
| `src/components/GradientEditor.tsx` | **Rename file** -> `BresenhamEditor.tsx`, rename internals | 2d |
| `src/components/PaletteMapper.tsx` | Update imports, add bresenham/transition cases | 2d, 4 |
| `src/components/TransitionEditor.tsx` | **New file** | 4 |
| `src/state/AppContext.tsx` | Update default config type literal | 2f |
| `src/i18n/locales/{en,fr,es,de,zh}.json` | Rename gradient keys, add bresenham+transition keys | 5 |
| `src/lib/__tests__/palette.test.ts` | Update signatures, rename descriptions, add transition tests | 1, 2e, 6a |
| `src/lib/__tests__/config.test.ts` | Rename fixtures, add transition round-trip tests | 2e, 6b |
| `src/components/__tests__/GradientEditor.test.tsx` | **Rename file** -> `BresenhamEditor.test.tsx` | 2e |
| `src/components/__tests__/TransitionEditor.test.tsx` | **New file** | 6c |
| `public/samples/3DBenchy-2color-gradient.config.json` | **Rename file** -> `*-bresenham.config.json`, update type | 7 |
| `public/samples/3DBenchy-2color-transition.config.json` | **New file** | 7 |

## Risk Notes

- **Phase 2 is the largest blast radius** --- touches nearly every file. Do it
  as a single atomic commit after Phase 1 to make review easy.
- **Backward compat** in `bresenhamStrategy.parse` is critical --- existing user
  configs and sample files with `"type": "gradient"` must keep loading. Test
  this explicitly.
- **Transition algorithm taper curve** is an implementation detail. Start with
  linear taper (`runLength = max(maxCycleLength, round(maxCycleLength / d))`).
  If visual results are poor, quadratic or exponential taper can be swapped in
  without changing the interface.
- **Preview bar in `TransitionEditor`** uses a dummy `PaletteContext` for
  display. The `mm` mode preview will use a fixed `layerHeightMm` (e.g. 0.12)
  and won't reflect the user's actual layer height --- this is acceptable for
  initial implementation.
