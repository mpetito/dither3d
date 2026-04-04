import { useAppState } from '../state/AppContext';

const STATUS_TEXT: Record<string, string> = {
  idle: 'Ready',
  loading: 'Loading file…',
  processing: 'Processing…',
  ready: 'Done',
  error: 'Error',
};

export function ProcessingStatus() {
  const { status, error } = useAppState();

  return (
    <div className="flex items-center gap-2 text-sm mt-auto">
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          status === 'error'
            ? 'bg-red-500'
            : status === 'processing' || status === 'loading'
              ? 'bg-yellow-400 animate-pulse'
              : status === 'ready'
                ? 'bg-green-500'
                : 'bg-gray-400'
        }`}
      />
      <span
        className={
          status === 'error'
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-500 dark:text-gray-400'
        }
      >
        {STATUS_TEXT[status] ?? status}
      </span>
      {error && (
        <span className="text-red-600 dark:text-red-400 truncate ml-1">
          — {error}
        </span>
      )}
    </div>
  );
}
