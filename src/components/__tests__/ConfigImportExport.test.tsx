import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithContext } from "../../__tests__/test-utils";
import { ConfigExportButton, ConfigImportButton } from "../ConfigImportExport";

describe("ConfigImportExport", () => {
  it("renders export button", () => {
    renderWithContext(<ConfigExportButton />);
    expect(screen.getByText("Export config")).toBeInTheDocument();
  });

  it("renders import button", () => {
    renderWithContext(<ConfigImportButton />);
    expect(screen.getByText("Import")).toBeInTheDocument();
  });
});
