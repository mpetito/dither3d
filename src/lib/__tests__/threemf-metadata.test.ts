import { describe, it, expect } from 'vitest';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { read3mf, write3mf } from '../threemf';

const MINIMAL_MODEL = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="1"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>`;

function make3mfBuffer(model: string, extras?: Record<string, Uint8Array>): ArrayBuffer {
  return zipSync({
    '3D/3dmodel.model': strToU8(model),
    ...extras,
  }).buffer as ArrayBuffer;
}

describe('write3mf metadata', () => {
  // Helper: write and unzip
  function writeAndUnzip(metadata?: Parameters<typeof write3mf>[7]) {
    const verts = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 1]);
    const faces = new Uint32Array([0, 1, 2]);
    const bytes = write3mf(verts, faces, 3, 1, [''], 1, 'both', metadata);
    return unzipSync(bytes);
  }

  it('write3mf without metadata produces no extra entries', () => {
    const entries = writeAndUnzip();
    const names = Object.keys(entries);
    expect(names).not.toContain('Metadata/full-spectrum.config.json');
  });

  it('write3mf with filament colors writes display_color entries', () => {
    const entries = writeAndUnzip({
      filamentColors: ['#808080', '#E74C3C', '#3498DB'],
    });
    const configText = new TextDecoder().decode(entries['Metadata/Slic3r_PE_model.config']);
    expect(configText).toContain('display_color');
    expect(configText).toContain('#E74C3C');
    expect(configText).toContain('#3498DB');
    expect(configText).toContain('filament id="2"');
  });

  it('write3mf with layer height writes layer_height and initial_layer_height', () => {
    const entries = writeAndUnzip({ layerHeight: 0.1 });
    const configText = new TextDecoder().decode(entries['Metadata/Slic3r_PE_model.config']);
    expect(configText).toContain('layer_height');
    expect(configText).toContain('value="0.1"');
    expect(configText).toContain('initial_layer_height');
    expect(configText).toContain('value="0.2"');
  });

  it('initial_layer_height equals 2x layer_height', () => {
    const entries = writeAndUnzip({ layerHeight: 0.08 });
    const configText = new TextDecoder().decode(entries['Metadata/Slic3r_PE_model.config']);
    expect(configText).toContain('value="0.16"');
  });

  it('write3mf with config writes full-spectrum.config.json', () => {
    const config = { layer_height_mm: 0.1, color_mappings: [] };
    const entries = writeAndUnzip({ config });
    expect(Object.keys(entries)).toContain('Metadata/full-spectrum.config.json');
    const json = JSON.parse(new TextDecoder().decode(entries['Metadata/full-spectrum.config.json']));
    expect(json.layer_height_mm).toBe(0.1);
  });

  it('write3mf without config does not include config JSON', () => {
    const entries = writeAndUnzip({ layerHeight: 0.1 });
    expect(Object.keys(entries)).not.toContain('Metadata/full-spectrum.config.json');
  });
});

describe('read3mf metadata', () => {
  it('reads filament colors from slicer config', () => {
    const configXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1"><metadata type="object" key="extruder" value="1"/></object>
  <filament id="1"><metadata key="display_color" value="#FF0000"/></filament>
  <filament id="2"><metadata key="display_color" value="#00FF00"/></filament>
</config>`;
    const buf = make3mfBuffer(MINIMAL_MODEL, {
      'Metadata/Slic3r_PE_model.config': strToU8(configXml),
    });
    const data = read3mf(buf);
    expect(data.filamentColors).toEqual(['#FF0000', '#00FF00']);
  });

  it('reads layer height from slicer config', () => {
    const configXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1"><metadata type="object" key="extruder" value="1"/></object>
  <plate>
    <metadata key="layer_height" value="0.1"/>
    <metadata key="initial_layer_height" value="0.2"/>
  </plate>
</config>`;
    const buf = make3mfBuffer(MINIMAL_MODEL, {
      'Metadata/Slic3r_PE_model.config': strToU8(configXml),
    });
    const data = read3mf(buf);
    expect(data.layerHeight).toBe(0.1);
    expect(data.initialLayerHeight).toBe(0.2);
  });

  it('reads full-spectrum config JSON', () => {
    const config = { layer_height_mm: 0.12, color_mappings: [{ input_filament: 1 }] };
    const buf = make3mfBuffer(MINIMAL_MODEL, {
      'Metadata/Slic3r_PE_model.config': strToU8(`<?xml version="1.0"?><config><object id="1"><metadata type="object" key="extruder" value="1"/></object></config>`),
      'Metadata/full-spectrum.config.json': strToU8(JSON.stringify(config)),
    });
    const data = read3mf(buf);
    expect(data.fullSpectrumConfig).toEqual(config);
  });

  it('returns undefined metadata for plain 3MF', () => {
    const buf = make3mfBuffer(MINIMAL_MODEL);
    const data = read3mf(buf);
    expect(data.filamentColors).toBeUndefined();
    expect(data.layerHeight).toBeUndefined();
    expect(data.fullSpectrumConfig).toBeUndefined();
  });

  it('ignores malformed config JSON', () => {
    const buf = make3mfBuffer(MINIMAL_MODEL, {
      'Metadata/Slic3r_PE_model.config': strToU8(`<?xml version="1.0"?><config><object id="1"><metadata type="object" key="extruder" value="1"/></object></config>`),
      'Metadata/full-spectrum.config.json': strToU8('not valid json{'),
    });
    const data = read3mf(buf);
    expect(data.fullSpectrumConfig).toBeUndefined();
  });
});

describe('metadata round-trip', () => {
  it('write then read preserves filament colors', () => {
    const colors = ['#808080', '#E74C3C', '#3498DB'];
    const verts = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 1]);
    const faces = new Uint32Array([0, 1, 2]);
    const bytes = write3mf(verts, faces, 3, 1, [''], 1, 'both', {
      filamentColors: colors,
    });
    const data = read3mf(bytes.buffer as ArrayBuffer);
    expect(data.filamentColors).toEqual(colors);
  });

  it('write then read preserves layer height', () => {
    const verts = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 1]);
    const faces = new Uint32Array([0, 1, 2]);
    const bytes = write3mf(verts, faces, 3, 1, [''], 1, 'both', {
      layerHeight: 0.08,
    });
    const data = read3mf(bytes.buffer as ArrayBuffer);
    expect(data.layerHeight).toBe(0.08);
    expect(data.initialLayerHeight).toBe(0.16);
  });

  it('write then read preserves palette config', () => {
    const config = {
      layer_height_mm: 0.1,
      color_mappings: [
        { input_filament: 1, output_palette: { type: 'cyclic', pattern: [1, 2, 3] } },
      ],
    };
    const verts = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 1]);
    const faces = new Uint32Array([0, 1, 2]);
    const bytes = write3mf(verts, faces, 3, 1, [''], 1, 'both', { config });
    const data = read3mf(bytes.buffer as ArrayBuffer);
    expect(data.fullSpectrumConfig).toEqual(config);
  });
});
