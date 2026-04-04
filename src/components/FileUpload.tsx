import { useCallback, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { read3mf } from '../lib/threemf';

export function FileUpload() {
  const dispatch = useAppDispatch();
  const { status, meshData } = useAppState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      dispatch({ type: 'UPLOAD_START' });
      try {
        const buf = await file.arrayBuffer();
        const data = read3mf(buf, true);
        setFileName(file.name);
        dispatch({ type: 'UPLOAD_SUCCESS', meshData: data, rawFileData: buf });
      } catch (e) {
        dispatch({
          type: 'UPLOAD_ERROR',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [dispatch],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const isLoading = status === 'loading';

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
        dragOver
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
      } ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".3mf,.stl"
        className="hidden"
        onChange={onInputChange}
      />

      {/* Upload cloud icon */}
      <svg
        className="w-10 h-10 text-gray-400 dark:text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16a4 4 0 0 1-.88-7.903A5 5 0 1 1 15.9 6h.1a5 5 0 0 1 1 9.9M15 13l-3-3m0 0-3 3m3-3v12"
        />
      </svg>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : fileName && meshData ? (
        <div className="text-center">
          <p className="text-sm font-medium truncate max-w-[14rem]">
            {fileName}
          </p>
          <p className="text-xs text-gray-500">
            {meshData.faceCount.toLocaleString()} faces ·{' '}
            {meshData.vertexCount.toLocaleString()} vertices
          </p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm font-medium">Drop a .3mf file here</p>
          <p className="text-xs text-gray-500">or click to browse</p>
        </div>
      )}
    </div>
  );
}
