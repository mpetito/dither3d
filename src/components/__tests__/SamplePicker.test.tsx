import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithContext } from '../../__tests__/test-utils';
import { SamplePicker } from '../SamplePicker';

// Mock the samples module
vi.mock('../../lib/samples', async () => {
  const actual = await vi.importActual('../../lib/samples');
  return {
    ...actual,
    fetchSample: vi.fn(),
  };
});

// Mock read3mf
vi.mock('../../lib/threemf', () => ({
  read3mf: vi.fn().mockReturnValue({
    triangles: new Float32Array(9),
    faceFilaments: new Uint8Array(1),
    filamentCount: 2,
    metadata: {},
  }),
}));

import { fetchSample } from '../../lib/samples';
import type { SampleData } from '../../lib/samples';

const mockFetchSample = vi.mocked(fetchSample);

// happy-dom doesn't implement HTMLDialogElement.showModal/close, so polyfill
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

describe('SamplePicker', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading when open', () => {
    renderWithContext(<SamplePicker open={true} onClose={onClose} />);
    expect(screen.getByText('Try a Sample')).toBeInTheDocument();
  });

  it('renders sample buttons when open', () => {
    renderWithContext(<SamplePicker open={true} onClose={onClose} />);
    expect(screen.getByText('Benchy – Cyclic')).toBeInTheDocument();
    expect(screen.getByText('Benchy – Gradient')).toBeInTheDocument();
    expect(screen.getByText('Cylinder – Cyclic')).toBeInTheDocument();
  });

  it('loads a sample on click', async () => {
    const user = userEvent.setup();
    const mockData: SampleData = {
      modelBuffer: new ArrayBuffer(8),
      config: {
        layerHeightMm: 0.08,
        targetFormat: 'both',
        colorMappings: [
          { inputFilament: 1, outputPalette: { type: 'cyclic', pattern: [1, 2] } },
        ],
        boundarySplit: true,
        maxSplitDepth: 9,
        boundaryStrategy: 'bisection',
      },
      filamentColors: ['#808080', '#E74C3C', '#3498DB'],
      filename: '3DBenchy',
    };
    mockFetchSample.mockResolvedValueOnce(mockData);

    renderWithContext(<SamplePicker open={true} onClose={onClose} />);
    await user.click(screen.getByText('Benchy – Cyclic'));

    await waitFor(() => {
      expect(mockFetchSample).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error message on fetch failure', async () => {
    const user = userEvent.setup();
    mockFetchSample.mockRejectedValueOnce(new Error('Network error'));

    renderWithContext(<SamplePicker open={true} onClose={onClose} />);
    await user.click(screen.getByText('Benchy – Cyclic'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('calls onClose after successful sample load', async () => {
    const user = userEvent.setup();
    const mockData: SampleData = {
      modelBuffer: new ArrayBuffer(8),
      config: {
        layerHeightMm: 0.08,
        targetFormat: 'both',
        colorMappings: [
          { inputFilament: 1, outputPalette: { type: 'cyclic', pattern: [1, 2] } },
        ],
        boundarySplit: true,
        maxSplitDepth: 9,
        boundaryStrategy: 'bisection',
      },
      filename: '3DBenchy',
    };
    mockFetchSample.mockResolvedValueOnce(mockData);

    renderWithContext(<SamplePicker open={true} onClose={onClose} />);
    await user.click(screen.getByText('Benchy – Cyclic'));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
