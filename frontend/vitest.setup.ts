import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

// Mock framer-motion to avoid JSDOM layout and requestAnimationFrame errors
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      ...actual.motion,
      div: React.forwardRef<HTMLDivElement, any>(({ children, whileHover, whileTap, transition, initial, animate, exit, ...rest }, ref) => {
        return React.createElement("div", { ref, ...rest }, children);
      }),
    },
  };
});
