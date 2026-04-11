import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../test-setup';
import { TransitionEditor } from '../TransitionEditor';
import type { GradientStop } from '../../lib/config';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'transitionEditor.label') return `Transition (${opts?.count} stops)`;
      if (key === 'transitionEditor.addStop') return '+ Add stop';
      if (key === 'transitionEditor.removeStopTooltip') return 'Remove stop';
      if (key === 'transitionEditor.widthModeAuto') return 'Auto';
      if (key === 'transitionEditor.widthModePercent') return 'Percent';
      if (key === 'transitionEditor.widthModeMm') return 'mm';
      if (key === 'transitionEditor.maxCycleLength') return 'Max cycle length';
      return key;
    },
  }),
}));

const defaultStops: GradientStop[] = [
  { t: 0, filament: 1 },
  { t: 1, filament: 2 },
];

describe('TransitionEditor', () => {
  it('renders the label with stop count', () => {
    const onChange = vi.fn();
    render(
      <TransitionEditor
        stops={defaultStops}
        transitionWidth={{ mode: 'auto' }}
        maxCycleLength={2}
        onChange={onChange}
      />
    );
    expect(screen.getByText('Transition (2 stops)')).toBeInTheDocument();
  });

  it('renders add stop button', () => {
    const onChange = vi.fn();
    render(
      <TransitionEditor
        stops={defaultStops}
        transitionWidth={{ mode: 'auto' }}
        maxCycleLength={2}
        onChange={onChange}
      />
    );
    expect(screen.getByText('+ Add stop')).toBeInTheDocument();
  });

  it('calls onChange when add stop is clicked', () => {
    const onChange = vi.fn();
    render(
      <TransitionEditor
        stops={defaultStops}
        transitionWidth={{ mode: 'auto' }}
        maxCycleLength={2}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('+ Add stop'));
    expect(onChange).toHaveBeenCalledWith({
      stops: [...defaultStops, { t: 1.0, filament: 1 }],
    });
  });

  it('renders width mode selector', () => {
    const onChange = vi.fn();
    render(
      <TransitionEditor
        stops={defaultStops}
        transitionWidth={{ mode: 'auto' }}
        maxCycleLength={2}
        onChange={onChange}
      />
    );
    const selects = screen.getAllByRole('combobox');
    // One of the selects should have the width mode options
    const widthSelect = selects.find(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.textContent === 'Auto');
    });
    expect(widthSelect).toBeTruthy();
  });

  it('renders preview bar', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TransitionEditor
        stops={defaultStops}
        transitionWidth={{ mode: 'auto' }}
        maxCycleLength={2}
        onChange={onChange}
      />
    );
    const bar = container.querySelector('.h-3');
    expect(bar).toBeInTheDocument();
    expect((bar as HTMLElement)?.style.background).toBeTruthy();
  });
});
