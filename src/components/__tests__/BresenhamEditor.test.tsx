import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BresenhamEditor } from "../BresenhamEditor";

describe("BresenhamEditor", () => {
  const twoStops = [
    { t: 0, filament: 1 },
    { t: 1, filament: 2 },
  ];

  it("renders stop entries matching stops length", () => {
    render(<BresenhamEditor stops={twoStops} onChange={vi.fn()} />);
    const spinbuttons = screen.getAllByRole("spinbutton");
    expect(spinbuttons).toHaveLength(2);
  });

  it("renders bresenham preview bar", () => {
    const { container } = render(
      <BresenhamEditor stops={twoStops} onChange={vi.fn()} />,
    );
    const bar = container.querySelector('[style*="linear-gradient"]');
    expect(bar).toBeTruthy();
  });

  it("does not show remove button when only 2 stops", () => {
    render(<BresenhamEditor stops={twoStops} onChange={vi.fn()} />);
    expect(screen.queryByTitle("Remove stop")).toBeNull();
  });

  it("shows remove buttons when more than 2 stops", () => {
    const threeStops = [...twoStops, { t: 0.5, filament: 3 }];
    render(<BresenhamEditor stops={threeStops} onChange={vi.fn()} />);
    expect(screen.getAllByTitle("Remove stop")).toHaveLength(3);
  });

  it("adds stop on + click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BresenhamEditor stops={twoStops} onChange={onChange} />);
    await user.click(screen.getByText("+ Add stop"));
    expect(onChange).toHaveBeenCalledWith([
      ...twoStops,
      { t: 1.0, filament: 1 },
    ]);
  });
});
