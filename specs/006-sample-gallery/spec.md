# Spec: Sample Gallery

**Date**: 2025-04-08 | **Status**: Draft

## Context

New users arriving at Dither3D have no way to explore the tool's capabilities without first preparing and uploading their own painted 3MF file. The `public/samples/` directory already ships three sample 3MF files (`3DBenchy.3mf`, `3DBenchy-2color.3mf`, `Cylinder.3mf`) but they are not accessible from the UI. Adding a "Try a sample" flow lets visitors immediately experience dithering without any upfront effort, significantly lowering the barrier to entry.

## Objective

Allow users to load predefined sample models — each bundled with a curated dithering configuration — directly from the UI, so they can explore Dither3D without uploading their own files.

## Scope

### In Scope

- Define a **sample color-mapping JSON format** (companion config files shipped alongside each 3MF)
- Define a **sample registry** — a typed dictionary mapping sample IDs to their 3MF path, config JSON path, filament colors, and localized label/description keys
- Create **color-mapping JSON files** for each existing sample
- Build a **SamplePicker UI component** integrated near the file-upload area
- **Fetch & load** the 3MF + config into app state exactly as if the user had uploaded + imported them
- **i18n** — localized sample labels and descriptions for all five supported languages (en, fr, es, de, zh)

### Out of Scope

- Adding new 3MF sample models beyond the three already in `public/samples/`
- Server-side sample hosting or a CDN — samples remain static assets in `public/`
- User-created/saved presets or a community gallery
- Thumbnail generation or preview images for samples (may be a future enhancement)

## Requirements

### Functional

1. **Sample config JSON files**: Each sample ships a companion `.config.json` file in `public/samples/` using the existing `configToJson` serialisation format (snake_case keys matching `loadConfigFromJson` expectations). The config file additionally includes an optional `filament_colors` array of hex strings (1-indexed, position 0 = default/unassigned).

2. **Sample registry**: A TypeScript module (`src/lib/samples.ts`) exports a `SAMPLES` array of `SampleDefinition` objects:

   ```typescript
   export interface SampleDefinition {
     /** Unique slug used as i18n key prefix and HTML id */
     id: string;
     /** Path relative to the public root for the 3MF file */
     modelPath: string;
     /** Path relative to the public root for the config JSON */
     configPath: string;
     /** i18n key for the human-readable label (e.g. "samples.benchy2color.label") */
     labelKey: string;
     /** i18n key for a short description (e.g. "samples.benchy2color.description") */
     descriptionKey: string;
   }
   ```

   Multiple samples may reference the **same 3MF** with **different configs** (e.g. "Benchy — cyclic 2-color" vs "Benchy — gradient rainbow"), enabling curated variety without extra model files.

3. **SamplePicker component**: A UI element displayed when no file is loaded (idle state). Requirements:
   - Renders inside or adjacent to the `FileUpload` drop zone as a "Try a sample" section
   - Lists all entries from `SAMPLES` with their localized label and description
   - Clicking a sample fetches the 3MF and config JSON via `fetch()`, then dispatches the same state actions as a manual upload + config import:
     - `UPLOAD_START` → `UPLOAD_SUCCESS` → `SET_INPUT_FILENAME` → `UPDATE_CONFIG` → `SET_FILAMENT_COLORS`
   - Shows a loading indicator while fetching
   - Handles fetch errors gracefully (network failure, 404) with user-visible feedback
   - Remains accessible: keyboard-navigable, appropriate ARIA roles

4. **Post-load behaviour**: After loading a sample, the app behaves identically to a user-uploaded file — the user can tweak settings, re-process, download, or upload a different file to replace it.

5. **i18n integration**: All user-facing strings (section heading, sample labels, descriptions, loading/error messages) use translation keys under a `samples` namespace.

### Non-Functional

- **Bundle size**: Sample 3MF and config files are fetched on demand — they must NOT be bundled into the JS bundle via static imports. They remain in `public/` and are fetched at runtime.
- **Performance**: Fetching a sample should feel fast. The three existing samples are small (<100 KB each). No lazy-loading or streaming optimisations needed now.
- **Accessibility**: The sample list must be keyboard-navigable and have meaningful ARIA labels.

## Design Constraints

- **Reuse existing config format**: The sample config JSON must be parseable by `loadConfigFromJson()` (already handles validation). Only addition is the optional `filament_colors` array at the top level — `loadConfigFromJson` should either be extended to extract it or the sample-loader reads it separately before passing the rest to `loadConfigFromJson`.
- **Static hosting only**: Samples live in `public/samples/` and are served as static files by Vite's dev server and any static host. No API endpoint needed.
- **No new dependencies**: Use the browser `fetch()` API. No additional npm packages.
- **i18n parity**: Translations must exist for all five supported languages from the start.

## Sample Config JSON Format

Extends the existing export format with an optional `filament_colors` field:

```jsonc
{
  // Optional: override filament colors when loading this sample
  "filament_colors": [
    "#808080",  // 0: default/unassigned
    "#E74C3C",  // 1: red
    "#3498DB",  // 2: blue
    "#2ECC71"   // 3: green
  ],

  // Standard dither3d config (same as ConfigImportExport)
  "layer_height_mm": 0.08,
  "target_format": "both",
  "boundary_split": true,
  "max_split_depth": 9,
  "boundary_strategy": "bisection",
  "color_mappings": [
    {
      "input_filament": 1,
      "output_palette": {
        "type": "cyclic",
        "pattern": [1, 2]
      }
    }
  ]
}
```

The `filament_colors` array is:
- **Optional** — if absent, the app keeps its current FILAMENT_COLORS defaults
- **0-indexed** — position 0 is the unassigned/default colour, position 1 is filament 1, etc.
- Parsed by the sample loader, **not** by `loadConfigFromJson()` (to keep that function focused on dithering config)

## Initial Sample Catalogue

| ID | 3MF | Config | Description |
|----|-----|--------|-------------|
| `benchy-cyclic` | `3DBenchy.3mf` | `3DBenchy-cyclic.config.json` | Benchy with cyclic 2-colour dithering |
| `benchy-2color-gradient` | `3DBenchy-2color.3mf` | `3DBenchy-2color-gradient.config.json` | Painted 2-colour Benchy with gradient blend |
| `cylinder-cyclic` | `Cylinder.3mf` | `Cylinder-cyclic.config.json` | Simple cylinder with cyclic pattern |

## Acceptance Criteria

- [ ] Three sample config JSON files exist in `public/samples/` and pass `loadConfigFromJson()` validation
- [ ] `SampleDefinition` type and `SAMPLES` registry are exported from `src/lib/samples.ts`
- [ ] A `SamplePicker` component renders when the app is in idle state (no file loaded)
- [ ] Clicking a sample fetches the 3MF + config and loads them into app state
- [ ] After loading a sample, the 3D preview renders and processing runs automatically
- [ ] All sample UI strings are translated in en, fr, es, de, zh locale files
- [ ] Fetch errors display a user-visible error message
- [ ] Sample picker is keyboard-accessible
- [ ] Sample files are NOT included in the JS bundle (verified by build output or network tab)
- [ ] Existing upload flow continues to work unchanged after sample is loaded
- [ ] Unit tests cover the sample registry and sample-loading logic
- [ ] E2E test verifies loading at least one sample end-to-end

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Config format | Extend existing export JSON with optional `filament_colors` | Reuses `loadConfigFromJson()` — no new parser needed |
| Registry location | `src/lib/samples.ts` (pure TS, no React) | Keeps domain data in `src/lib/` per module boundaries; importable from components and tests |
| UI placement | Inside/below `FileUpload` when idle | Natural discovery point; disappears once a file is loaded to avoid clutter |
| `filament_colors` parsing | Sample loader reads it before passing to `loadConfigFromJson` | Keeps config parser focused; `filament_colors` is a sample-loader concern |
| Fetch strategy | `fetch()` at click time | Simple, no preloading; samples are small enough to load fast |

## Open Questions

- [ ] Should the sample picker remain visible (collapsed/minimized) after a file is loaded, or should it only appear in idle state? (Low risk — can iterate on UX later; defaulting to idle-only for simplicity.)
