import { describe, expect, it, vi } from 'vitest';

import { createMacosNotificationNotifier } from './notifications.js';

describe('macOS notification adapter', () => {
  it('shows a native notification through the injected adapter', () => {
    const show = vi.fn();
    class NotificationConstructor {
      constructor(event: { readonly title: string; readonly body: string }) {
        expect(event).toEqual({ title: 'GPU available', body: 'GPU 0 is available' });
      }

      show = show;
    }
    const notifier = createMacosNotificationNotifier(NotificationConstructor);

    notifier.show({ title: 'GPU available', body: 'GPU 0 is available' });

    expect(show).toHaveBeenCalledOnce();
  });
});
