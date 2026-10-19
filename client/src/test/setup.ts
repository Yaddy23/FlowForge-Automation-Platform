import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Extend the workspace-local vitest `expect` with jest-dom matchers directly —
// importing '@testing-library/jest-dom/vitest' would resolve the hoisted copy
// of vitest (server's 1.x) rather than this workspace's 3.x.
expect.extend(matchers);

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
