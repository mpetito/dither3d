import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center, Bounds } from '@react-three/drei';
import * as THREE from 'three';
import { useAppState } from '../state/AppContext';
import { FILAMENT_COLORS } from '../constants';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function MeshGeometry() {
  const { meshData, processedMeshData } = useAppState();
  const displayData = processedMeshData ?? meshData;
  if (!displayData) return null;

  const { vertices, faces, faceColors, defaultFilament, faceCount } = displayData;

  const geometry = useMemo(() => {
    // Unindexed geometry: 3 vertices per face for flat shading + per-face colors
    const posArr = new Float32Array(faceCount * 9);
    const colArr = new Float32Array(faceCount * 9);

    for (let f = 0; f < faceCount; f++) {
      const i0 = faces[f * 3];
      const i1 = faces[f * 3 + 1];
      const i2 = faces[f * 3 + 2];

      // Position
      posArr[f * 9] = vertices[i0 * 3];
      posArr[f * 9 + 1] = vertices[i0 * 3 + 1];
      posArr[f * 9 + 2] = vertices[i0 * 3 + 2];

      posArr[f * 9 + 3] = vertices[i1 * 3];
      posArr[f * 9 + 4] = vertices[i1 * 3 + 1];
      posArr[f * 9 + 5] = vertices[i1 * 3 + 2];

      posArr[f * 9 + 6] = vertices[i2 * 3];
      posArr[f * 9 + 7] = vertices[i2 * 3 + 1];
      posArr[f * 9 + 8] = vertices[i2 * 3 + 2];

      // Color: look up filament → hex → RGB
      const filament = faceColors.get(f) ?? defaultFilament;
      const hex =
        FILAMENT_COLORS[filament] ?? FILAMENT_COLORS[0];
      const [r, g, b] = hexToRgb(hex);

      colArr[f * 9] = r;
      colArr[f * 9 + 1] = g;
      colArr[f * 9 + 2] = b;
      colArr[f * 9 + 3] = r;
      colArr[f * 9 + 4] = g;
      colArr[f * 9 + 5] = b;
      colArr[f * 9 + 6] = r;
      colArr[f * 9 + 7] = g;
      colArr[f * 9 + 8] = b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    geo.computeVertexNormals();
    return geo;
  }, [vertices, faces, faceColors, defaultFilament, faceCount]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors flatShading />
    </mesh>
  );
}

export function MeshViewer() {
  const { meshData } = useAppState();

  if (!meshData) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-600 select-none">
        <p className="text-lg">Upload a 3MF file to preview</p>
      </div>
    );
  }

  return (
    <Canvas
      className="absolute inset-0"
      camera={{ position: [0, 0, 100], fov: 50, near: 0.1, far: 10000 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 7]} intensity={1} />
      <Bounds fit clip observe>
        <Center>
          <MeshGeometry />
        </Center>
      </Bounds>
      <OrbitControls makeDefault />
    </Canvas>
  );
}
