import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingState } from './ui/statusFeedback';

describe('status feedback Phase 7 accessibility defects', () => {
  it('P7-D008 exposes base loading feedback as a live status', () => {
    render(<LoadingState label="Loading server data..." />);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Loading server data...');
  });
});
