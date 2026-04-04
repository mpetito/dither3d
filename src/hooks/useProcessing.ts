import { useEffect, useRef } from 'react';
import { useAppState, useAppDispatch } from '../state/AppContext';
import { process } from '../lib/pipeline';
import { read3mf } from '../lib/threemf';

export function useProcessing() {
  const { rawFileData, config, meshData, status } = useAppState();
  const dispatch = useAppDispatch();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Don't process if no mesh loaded or currently loading
    if (!rawFileData || !meshData) return;
    if (status === 'loading') return;

    // Clear previous debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Debounce 300ms then process
    debounceRef.current = setTimeout(() => {
      dispatch({ type: 'PROCESS_START' });

      try {
        const [result, outputBytes] = process(rawFileData, config);
        if (outputBytes) {
          // Parse output to get processed face colors for 3D preview
          const processedMeshData = read3mf(outputBytes.buffer as ArrayBuffer, true);
          dispatch({ type: 'PROCESS_SUCCESS', result, outputBytes, processedMeshData });
        }
      } catch (e) {
        dispatch({ type: 'PROCESS_ERROR', error: (e as Error).message });
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawFileData, config]);
}
