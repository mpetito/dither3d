import { useCallback } from 'react';
import { useAppState, useAppDispatch } from '../state/AppContext';

export function FilamentColorEditor() {
  const { filamentColors } = useAppState();
  const dispatch = useAppDispatch();

  const handleColorChange = useCallback(
    (index: number, color: string) => {
      const updated = [...filamentColors];
      updated[index] = color;
      dispatch({ type: 'SET_FILAMENT_COLORS', colors: updated });
    },
    [filamentColors, dispatch],
  );

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-2">
      <h3 className="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">
        Filament Colors
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {filamentColors.map((color, i) => (
          <label key={i} className="flex flex-col items-center gap-1 cursor-pointer">
            <span
              className="w-8 h-8 rounded-full border-2 border-gray-300 dark:border-gray-600 overflow-hidden relative"
              style={{ backgroundColor: color }}
            >
              <input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(i, e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                aria-label={`Filament ${i} color`}
              />
            </span>
            <span className="text-xs text-gray-500">{i}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
