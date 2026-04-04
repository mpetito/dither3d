import { AppProvider } from './state/AppContext';
import { FileUpload } from './components/FileUpload';
import { MeshViewer } from './components/MeshViewer';
import { FilamentList } from './components/FilamentList';
import { ProcessingStatus } from './components/ProcessingStatus';

export default function App() {
  return (
    <AppProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Left panel */}
        <aside className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4 flex flex-col gap-4">
          <h1 className="text-xl font-bold">Full Spectrum</h1>
          <FileUpload />
          <FilamentList />
          <ProcessingStatus />
        </aside>
        {/* Right panel — 3D preview */}
        <main className="flex-1 relative">
          <MeshViewer />
        </main>
      </div>
    </AppProvider>
  );
}
