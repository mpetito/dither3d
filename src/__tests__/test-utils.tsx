/* eslint-disable react-refresh/only-export-components */
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { AppProvider } from "../state/AppContext";
import i18n from "../i18n/i18n";

// Force English locale in all tests
i18n.changeLanguage("en");

function Wrapper({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}

export function renderWithContext(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Wrapper, ...options });
}
