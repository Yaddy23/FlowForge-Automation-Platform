import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Extend the workspace-local vitest `expect` with jest-dom matchers directly —
// importing '@testing-library/jest-dom/vitest' would resolve the hoisted copy
// of vitest (server's 1.x) rather than this workspace's 3.x.
expect.extend(matchers);

// Polyfills React Flow needs under jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserverStub;
  }
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number) as typeof requestAnimationFrame;
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
  }
  // React Flow's connection logic calls doc.elementFromPoint — jsdom lacks it.
  const doc = document as Document & { elementFromPoint?: () => Element | null };
  if (!doc.elementFromPoint) {
    doc.elementFromPoint = () => null;
  }
}

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
