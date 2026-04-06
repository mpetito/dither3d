# AGENTS.md

> Agent instructions for Dither3D — Z-axis color dithering for multi-material FDM prints.

## Commands

```bash
npm install            # Install dependencies
npm run dev            # Dev server at http://localhost:5173
npm test               # Vitest unit tests (single run)
npm run test:watch     # Vitest in watch mode
npm run test:e2e       # Playwright e2e tests (starts dev server automatically)
npm run lint           # ESLint
npm run build          # TypeScript type-check + Vite production build
```

## Architecture

### Layers

| Directory          | Role                                                   |
| ------------------ | ------------------------------------------------------ |
| `src/lib/`         | Pure TypeScript processing library — **no DOM deps**   |
| `src/components/`  | React UI components (React 19 + Tailwind CSS v4)       |
| `src/state/`       | App-wide React context (`AppContext.tsx`)               |
| `src/hooks/`       | Custom React hooks (e.g. `useProcessing`)              |
| `e2e/`             | Playwright end-to-end tests                            |
| `specs/`           | Design specs and implementation plans (reference only)  |

### Key Domain Concepts

- **3MF** — ZIP-based 3D model format; contains triangle meshes with per-face filament paint data
- **Painted regions** — Triangle faces tagged with a filament index via `paint_color` (OrcaSlicer/BambuStudio) or `slic3rpe:mmu_segmentation` (PrusaSlicer)
- **Cyclic palette** — Strict modulus-based alternation: `filament = palette[layer_index % len]`
- **Gradient palette** — Bresenham-style error accumulation mapping color stops at normalized heights (0.0–1.0) to discrete filament assignments
- **Boundary subdivision** — Bisection of triangle faces that straddle layer boundaries
- **Layer height** — Blending works at ≤ 0.12 mm; the `layer_height` parameter drives `floor(centroid_z / layer_height)` indexing

### Module Boundaries

- `src/lib/` is portable to Node.js — never import browser APIs or React here
- `src/components/` may import from `src/lib/` and `src/state/`, never the reverse
- 3MF read supports both OrcaSlicer and PrusaSlicer dialects; write always outputs OrcaSlicer format

## Code Style

- TypeScript strict mode — avoid `any`
- Tailwind CSS v4 (CSS-first config with `@theme` blocks, not `tailwind.config.js`)
- Tests live in `__tests__/` directories adjacent to the code they test
- E2E tests go in `e2e/` and use Playwright with Chromium

## Testing

- Palette/dithering changes in `src/lib/` require **visual evidence** in PR descriptions (screenshot of 3D preview showing clean horizontal bands, no sawtooth)
- Unit tests alone are insufficient for palette correctness — see [CONTRIBUTING.md](CONTRIBUTING.md)
- E2E fixtures live in `e2e/fixtures/` (`.3mf` files)

## Do Not

- ❌ Import DOM or React APIs in `src/lib/` — it must stay portable
- ❌ Use `any` types — add proper type annotations
- ❌ Modify files under `coverage/`, `playwright-report/`, or `test-results/` — these are generated
- ❌ Hard-code colors — use Tailwind design tokens
- ❌ Claim the tool works with "any slicer" — tested with OrcaSlicer, BambuStudio, PrusaSlicer only
- ❌ Install packages without asking first

## See Also

- [README.md](README.md) — Project overview and technical details
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines and visual evidence requirements
- [specs/](specs/) — Design specs and implementation plans
