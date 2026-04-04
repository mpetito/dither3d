# Full Spectrum Web

Browser-based 3MF color mapper. Upload a 3MF file, configure filament-to-palette mappings, preview in 3D, and download the processed file.

## Features

- **3MF Upload & Parse** — reads PrusaSlicer and BambuStudio 3MF formats
- **3D Preview** — real-time Three.js viewer with per-face filament colors  
- **Palette Mapping** — cyclic and gradient dithering with error diffusion
- **Boundary Subdivision** — bisection encoding for smooth layer transitions
- **Configuration** — import/export JSON configs compatible with the CLI tool
- **Download** — processed 3MF file ready for slicing

## Development

```bash
npm install
npm run dev      # Start dev server
npm test         # Run tests
npm run build    # Production build
```

## Architecture

Pure TypeScript processing library (`src/lib/`) ported from the [Python CLI](https://github.com/mpetito/full-spectrum-3mf). React UI with Three.js 3D preview. Runs entirely client-side — no server required.

## Tech Stack

- **Framework**: React 19 + TypeScript 5.9
- **Build**: Vite 8
- **3D**: Three.js via React Three Fiber
- **CSS**: Tailwind CSS v4
- **ZIP**: fflate
- **Tests**: Vitest (185+ tests)

