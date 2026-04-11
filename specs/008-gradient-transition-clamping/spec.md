# Spec 008: Bresenham Rename + Transition Palette + PaletteContext

**Date**: 2026-04-11 | **Status**: Draft | **Supersedes**: Original 008 (Gradient Transition Gap Clamping)

## Context

### Why the original spec failed

Spec 008 originally proposed adding a `maxTransitionGapMm` parameter to the
existing gradient (Bresenham) palette to clamp the maximum consecutive run of a
single filament. This was fully implemented but proved **fundamentally flawed**.

The Bresenham error-diffusion algorithm distributes minority-color layers
**maximally apart** — this is mathematically optimal dithering. But FDM color
blending needs the opposite: **tight alternation in compact bands** near
transition boundaries for perceptually convincing results. Clamping the gap
fights the algorithm's core objective instead of working with it. Forced
insertions distort the error accumulator, producing unpredictable visual
artifacts rather than clean transitions.

The Bresenham algorithm remains valuable for its original purpose — even
distribution of colors across a region — but it is the wrong tool for
controlled transition blending. This spec replaces the gap-clamping approach
with a purpose-built transition palette type.

### What this spec covers

Three coordinated changes:

1. **Rename** the existing `gradient` palette type to `bresenham` everywhere
2. **Add** a new `transition` palette type with tapered cyclic alternation
3. **Introduce `PaletteContext`** — a generalized context bag passed to
   palette strategies, replacing ad-hoc parameter additions

## Objective

Provide users with a palette type that produces perceptually convincing color
transitions in FDM prints, using tapered cyclic alternation centered between
color stops. Simultaneously, clean up the naming of the existing Bresenham
palette and fix the strategy interface's extensibility with a context bag.

## Scope

### In Scope

- Rename `gradient` → `bresenham` across all type literals, interface names,
  function names, component names, test descriptions, i18n keys, JSON keys,
  and sample config files
- New `TransitionPalette` type with stops, `transitionWidth`, and
  `maxCycleLength`
- `transitionStrategy` implementing `PaletteStrategy<TransitionPalette>`
- `PaletteContext` interface added to `PaletteStrategy.buildLayerMap` and
  `PaletteStrategy.apply` signatures
- `TransitionEditor.tsx` component for the new palette type's UI
- Config serialization/deserialization of the new palette type
- i18n keys for the new type and editor
- Unit tests for the transition algorithm and the rename
- Migration: `gradientStrategy.parse` also accepts `type: 'gradient'` in
  saved JSON for backward compatibility, mapping it to `'bresenham'`

### Out of Scope

- Changes to the cyclic palette (it already alternates tightly)
- Changes to the Bresenham algorithm itself (it keeps its existing behavior)
- Preview shader changes (the shader reads layer maps; new palette types
  produce layer maps through the same interface)
- Boundary subdivision changes (reads layer maps — unaffected)
- Removing the Bresenham palette (it remains available)

## Requirements

### 1. Rename `gradient` → `bresenham`

A systematic rename across all layers of the codebase:

| Category | Current | New |
|----------|---------|-----|
| Type literal | `'gradient'` | `'bresenham'` |
| Palette interface | `GradientPalette` | `BresenhamPalette` |
| Stop type | `GradientStop` | — (keep as `GradientStop`, shared with transition) |
| Strategy object | `gradientStrategy` | `bresenhamStrategy` |
| Builder function | `buildGradientLayerMap` | `buildBresenhamLayerMap` |
| Apply function | `applyGradient` | `applyBresenham` |
| Component | `GradientEditor.tsx` / `GradientEditor` | `BresenhamEditor.tsx` / `BresenhamEditor` |
| i18n keys | `typeGradient`, `gradientEditor.*` | `typeBresenham`, `bresenhamEditor.*` |
| Test files | references in `palette.test.ts`, `config.test.ts`, `GradientEditor.test.tsx` | Update descriptions and imports |
| Sample configs | `3DBenchy-2color-gradient.config.json` | `3DBenchy-2color-bresenham.config.json` |
| `samples.ts` | References to gradient config filename | Updated to bresenham filename |

**`GradientStop` is NOT renamed.** It is shared between `BresenhamPalette`
and `TransitionPalette` — the name describes the data shape (a stop on a
gradient), not the algorithm.

**Backward compatibility**: `bresenhamStrategy.parse` must accept
`type: 'gradient'` in JSON input and silently map it to `'bresenham'`. This
ensures older saved configs and exported files continue to load.

### 2. `PaletteContext` Interface

Add a generalized context bag to the `PaletteStrategy` interface:

```typescript
export interface PaletteContext {
  layerHeightMm: number;
}
```

Update the `PaletteStrategy` interface:

```typescript
export interface PaletteStrategy<T extends Palette = Palette> {
  readonly type: string;
  apply(layerIndices: Uint32Array, regionLayers: number, palette: T,
        ctx: PaletteContext): Uint8Array;
  buildLayerMap(regionLayers: number, palette: T,
                ctx: PaletteContext): Uint8Array;
  validate(palette: T, mappingIndex: number): void;
  toJson(palette: T): Record<string, unknown>;
  parse(raw: Record<string, unknown>): T;
}
```

**Rationale**: The previous spec 008 implementation added `layerHeightMm`
directly to strategy method signatures. This violates the abstraction —
palette strategies should not have their signatures grow each time a new
strategy needs a pipeline-level value. `PaletteContext` is a bag that the
pipeline populates and strategies consume as needed. Strategies that don't
need context (e.g., `cyclic`) simply ignore the parameter.

**Pipeline call sites** in `pipeline.ts` (`buildClusterLayerData` ~L128 and
`runPipeline` ~L254) already have `config.layerHeightMm` in scope. They
construct `{ layerHeightMm: config.layerHeightMm }` and pass it through.

**Extensibility**: Future strategies that need additional pipeline-level data
(e.g., total print height, nozzle diameter) add fields to `PaletteContext`
without changing the `PaletteStrategy` interface signature.

### 3. `TransitionPalette` Type

```typescript
export type TransitionWidth =
  | { mode: 'auto' }
  | { mode: 'percent'; value: number }   // 0.0–1.0, fraction of segment
  | { mode: 'mm'; value: number };        // absolute mm

export interface TransitionPalette {
  type: 'transition';
  stops: readonly GradientStop[];
  transitionWidth: TransitionWidth;
  maxCycleLength: number;              // default 2
}
```

- **`stops`**: Same `[t, filamentIndex][]` format as `BresenhamPalette`.
  Reuses the `GradientStop` type.
- **`transitionWidth`**: Controls the width of the alternation band between
  adjacent different-color stops. See §3a.
- **`maxCycleLength`**: Maximum consecutive layers of one filament at the
  **tightest** point in the transition (the center). Default `2`. A value of
  `1` produces strict single-layer alternation at the midpoint.

### 3a. Transition Width Modes

| Mode | Meaning | When to use |
|------|---------|-------------|
| `auto` | Automatically compute width based on stop count | Default for new palettes. Scales inversely with stop count to prevent overlap |
| `percent` | Fraction (0.0–1.0) of each segment's height | User wants explicit control, independent of physical dimensions |
| `mm` | Absolute distance in millimeters | User wants a fixed physical transition band regardless of region height |

**`auto` formula** (implementation detail, not user-facing):
- For N stops defining N-1 segments, compute a per-segment fraction that
  avoids overlap. Suggested starting point: `min(0.8, 1.6 / (N - 1))` for
  each segment. The exact formula may be tuned during implementation.

**`mm` → layers conversion** uses `PaletteContext.layerHeightMm`:
`widthLayers = Math.round(value / ctx.layerHeightMm)`.

**`percent`** is relative to the segment length (in layers) between two
adjacent stops, not the total region.

### 3b. Transition Algorithm

Given sorted stops at positions t0, t1, t2, ... with filaments f0, f1, f2, ...:

For each segment [ti, ti+1]:

**If fi = fi+1**: Solid fi throughout. No transition needed.

**If fi ≠ fi+1**:
1. Compute the transition band width W (in layers) from `transitionWidth`.
2. Compute the midpoint m = (ti + ti+1) / 2 (in normalized position),
   then convert to layer index.
3. The band spans [m - W/2, m + W/2], clamped to the segment boundaries.
4. **Outside the band**: solid fi (left of band) or solid fi+1 (right
   of band).
5. **Inside the band**: tapered cyclic alternation.

**Tapered alternation** within the band:
- Let d be the distance of the current layer from the nearest band edge,
  normalized to [0, 1] where 0 = band edge and 1 = band center.
- The run length at position d tapers from long runs at the edges to
  `maxCycleLength` at the center.
- Suggested taper function: `runLength(d) = max(maxCycleLength, round(maxCycleLength / d))`
  capped at some reasonable maximum. The exact taper curve is an implementation
  detail — the visual requirement is smooth density increase toward the center.
- At the left edge: predominantly fi with occasional fi+1.
- At the right edge: predominantly fi+1 with occasional fi.
- At the center: alternating runs of length `maxCycleLength`.

**The algorithm operates on the final layer map (`Uint8Array`)**. It does not
use Bresenham error diffusion. Each layer's filament is determined by its
position relative to the transition band boundaries — a direct geometric
computation.

### 4. Strategy Registration

Create `transitionStrategy: PaletteStrategy<TransitionPalette>` implementing:

- **`buildLayerMap(regionLayers, palette, ctx)`**: Iterates layers 0 to
  `regionLayers - 1`. For each layer, determines which segment it falls in,
  whether it's in a transition band, and assigns the filament per §3b.
- **`apply(layerIndices, regionLayers, palette, ctx)`**: Calls
  `buildLayerMap`, then indexes into the result for each face.
- **`validate(palette, mappingIndex)`**: Validates stops (sorted, in range,
  ≥ 2), `maxCycleLength ≥ 1`, and `transitionWidth` (percent in 0–1, mm > 0).
- **`toJson(palette)`**: Serializes to JSON with keys: `type`, `stops`,
  `transition_width` (object with `mode` + `value`), `max_cycle_length`.
- **`parse(raw)`**: Deserializes, applying defaults (`transitionWidth: { mode: 'auto' }`,
  `maxCycleLength: 2`) for missing fields.

Register via `registerPalette(transitionStrategy)`. The strategy appears in
`getPaletteTypes()` and is available in the UI dropdown.

### 5. Config Types Update

```typescript
// Updated Palette union in config.ts
export interface BresenhamPalette {
  type: 'bresenham';
  stops: readonly GradientStop[];
}

export interface TransitionPalette {
  type: 'transition';
  stops: readonly GradientStop[];
  transitionWidth: TransitionWidth;
  maxCycleLength: number;
}

export type Palette = CyclicPalette | BresenhamPalette | TransitionPalette;
```

### 6. UI

#### 6a. `BresenhamEditor.tsx` (renamed from `GradientEditor.tsx`)

Identical functionality to the current `GradientEditor`. File rename + internal
name changes only.

#### 6b. `TransitionEditor.tsx` (new)

- **Stops editor**: Same stop-list UI as `BresenhamEditor` (reuse shared
  components or extract a `StopsEditor` sub-component if beneficial).
- **Transition width control**: Radio/select for mode (`auto`, `percent`, `mm`)
  with a numeric input for `percent` and `mm` modes. When `auto` is selected,
  the numeric input is hidden.
- **Max cycle length control**: Integer input, min 1, default 2.
  Label: "Max cycle length" (i18n key: `transitionEditor.maxCycleLength`).
- **Preview bar**: Like the Bresenham editor's preview, but showing the
  tapered transition pattern. Uses `buildLayerMap` with a representative
  `regionLayers` count.
- **No `layerHeightMm` prop needed in `mm` mode**: The editor serializes
  the raw mm value. Conversion to layers happens inside the strategy at
  pipeline time via `PaletteContext`. The editor does not need access to
  `layerHeightMm`. (If a "= N layers" hint is desired in the future, it can
  be added via context — but it is not required for the initial implementation.)

#### 6c. `PaletteMapper.tsx`

- `getPaletteTypes()` returns `['cyclic', 'bresenham', 'transition']`.
- The mapper renders `BresenhamEditor` for `'bresenham'` and
  `TransitionEditor` for `'transition'`.
- i18n key for the dropdown label: `paletteMapper.typeTransition`.

### 7. Config Serialization

#### JSON format for `TransitionPalette`:

```json
{
  "type": "transition",
  "stops": [[0.0, 0], [1.0, 1]],
  "transition_width": { "mode": "auto" },
  "max_cycle_length": 2
}
```

When `mode` is `percent` or `mm`:
```json
{
  "transition_width": { "mode": "percent", "value": 0.5 }
}
```

#### Backward compatibility for `BresenhamPalette`:

`bresenhamStrategy.parse` accepts `type: 'gradient'` in JSON and maps to
`type: 'bresenham'`. `bresenhamStrategy.toJson` always writes
`type: 'bresenham'`.

### 8. i18n

New keys (added to all locale files under `src/i18n/locales/`):

| Key | English value |
|-----|---------------|
| `paletteMapper.typeBresenham` | Bresenham (even distribution) |
| `paletteMapper.typeTransition` | Transition (tapered blending) |
| `bresenhamEditor.label` | Bresenham Palette |
| `bresenhamEditor.*` | (rename from `gradientEditor.*`) |
| `transitionEditor.label` | Transition Palette |
| `transitionEditor.stops` | Color Stops |
| `transitionEditor.transitionWidth` | Transition Width |
| `transitionEditor.widthMode.auto` | Auto |
| `transitionEditor.widthMode.percent` | Percentage |
| `transitionEditor.widthMode.mm` | Millimeters |
| `transitionEditor.maxCycleLength` | Max Cycle Length |
| `transitionEditor.maxCycleLengthHint` | Maximum consecutive layers of one color at tightest point |

Remove old keys: `paletteMapper.typeGradient`, `gradientEditor.*`.

### 9. Sample Configs

- Rename `3DBenchy-2color-gradient.config.json` →
  `3DBenchy-2color-bresenham.config.json`, updating `type` inside.
- Add a new sample: `3DBenchy-2color-transition.config.json` demonstrating
  the transition palette with default settings.
- Update `samples.ts` to reference the new filenames.

### 10. Tests

#### Rename coverage

- All existing gradient tests pass after rename (search-and-replace of
  identifiers and descriptions).
- Test file `GradientEditor.test.tsx` renamed to `BresenhamEditor.test.tsx`.

#### Transition algorithm tests (`palette.test.ts`)

- **Solid segments**: When fi = fi+1, entire segment is solid. No
  alternation occurs regardless of `transitionWidth`.
- **Basic transition**: Two stops with different filaments produce
  solid → tapered alternation → solid pattern.
- **Center symmetry**: The tightest alternation occurs at the midpoint
  between stops.
- **`maxCycleLength` enforcement**: At the band center, no run exceeds
  `maxCycleLength` consecutive layers.
- **Width modes**: `percent`, `mm`, and `auto` all produce correctly
  sized transition bands.
- **`mm` conversion**: With known `layerHeightMm` in context, mm width
  converts to the correct layer count.
- **Multi-stop**: Three or more stops produce independent transition bands
  per segment.
- **Edge cases**: Single-layer regions, two-layer regions, `maxCycleLength = 1`
  (strict alternation), band wider than segment (clamps to segment).

#### PaletteContext tests

- Cyclic strategy ignores context (works with any `PaletteContext`).
- Bresenham strategy ignores context (existing behavior preserved).
- Transition strategy uses `ctx.layerHeightMm` for `mm` width mode.

#### Config round-trip tests (`config.test.ts`)

- `TransitionPalette` serializes and parses correctly.
- Legacy `type: 'gradient'` JSON parses to `BresenhamPalette`.
- Missing `transition_width` defaults to `{ mode: 'auto' }`.
- Missing `max_cycle_length` defaults to `2`.

## Design Constraints

- `src/lib/` must stay React-free and portable to Node.js with a DOM
  polyfill (per AGENTS.md)
- TypeScript strict mode — no `any` types
- Tailwind CSS v4 for UI components — no hard-coded colors
- The transition algorithm must be a pure function of (layer index,
  regionLayers, palette, context) — no shared mutable state
- `PaletteContext` is the **only** mechanism for passing pipeline-level data
  to strategies. Do not add parameters directly to strategy method signatures.

## Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Rename existing type | `gradient` → `bresenham` | Accurately describes the algorithm; frees "gradient" from implying smooth transitions |
| 2 | Keep `GradientStop` name | Unchanged | Describes data shape (stop on a gradient), not algorithm; shared by both palette types |
| 3 | New palette type vs. modifying existing | New `transition` type | Bresenham and tapered alternation have fundamentally different algorithms and goals; forcing both into one type creates complexity |
| 4 | Strategy interface extension | `PaletteContext` bag parameter | Avoids growing method signatures per-strategy; extensible for future context data; strategies opt in to what they need |
| 5 | Transition width default | `auto` mode | Zero-config experience; adapts to stop count automatically |
| 6 | `maxCycleLength` default | `2` | Tightest practical alternation for FDM (ABAB); `1` is also valid but aggressive |
| 7 | Transition algorithm | Direct geometric computation, not Bresenham | Purpose-built for tapered alternation; no error accumulator fighting the intent |
| 8 | Backward compat for JSON | `parse` accepts `'gradient'`, `toJson` writes `'bresenham'` | Older saved configs continue to load; new exports use the correct name |
| 9 | `TransitionEditor` does not need `layerHeightMm` | Editor stores raw config; conversion at pipeline time | Keeps editor decoupled from pipeline state; matches existing props-only pattern |
| 10 | Sample config rename | Physical file rename | Avoids confusion; sample names should match the palette type they demonstrate |

## Acceptance Criteria

- [ ] All occurrences of `'gradient'` type literal are replaced with `'bresenham'`
- [ ] `GradientPalette` interface renamed to `BresenhamPalette`
- [ ] `GradientEditor.tsx` renamed to `BresenhamEditor.tsx`; component name updated
- [ ] i18n keys renamed from `gradientEditor.*` / `typeGradient` to `bresenhamEditor.*` / `typeBresenham`
- [ ] Sample config renamed from `*-gradient.*` to `*-bresenham.*`; `samples.ts` updated
- [ ] `bresenhamStrategy.parse` accepts `type: 'gradient'` for backward compatibility
- [ ] `PaletteContext` interface exists with `layerHeightMm: number`
- [ ] `PaletteStrategy.buildLayerMap` and `.apply` accept `ctx: PaletteContext`
- [ ] Pipeline passes `{ layerHeightMm }` at both call sites
- [ ] Cyclic and Bresenham strategies compile and work with the new signature (ignoring ctx)
- [ ] `TransitionPalette` type exists with `stops`, `transitionWidth`, `maxCycleLength`
- [ ] `transitionStrategy` registered and appears in `getPaletteTypes()`
- [ ] Transition algorithm produces solid → tapered alternation → solid pattern
- [ ] Tightest alternation occurs at segment midpoint with run length ≤ `maxCycleLength`
- [ ] All three `transitionWidth` modes (`auto`, `percent`, `mm`) work correctly
- [ ] `TransitionEditor.tsx` renders controls for stops, width mode, and max cycle length
- [ ] Config JSON round-trips `TransitionPalette` correctly with proper defaults
- [ ] All renamed tests pass; new transition tests pass
- [ ] Visual evidence in PR shows clean tapered transitions (per CONTRIBUTING.md)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes
- [ ] `npm run lint` passes

## Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should `GradientStop` eventually be renamed to just `Stop` or `PaletteStop`? | Deferred — cosmetic; can be done in a future cleanup pass without breaking changes |
| 2 | Exact taper curve (linear, quadratic, etc.) for the transition band? | Implementation detail — start with linear, tune visually during development |
| 3 | Should the `auto` width formula be exposed as a constant for testability? | Implementation detail — likely yes for unit testing, but not user-facing |
