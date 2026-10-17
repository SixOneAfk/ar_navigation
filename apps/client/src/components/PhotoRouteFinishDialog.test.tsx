import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockModalDialogs } from '../test/dialogMock';
import { PhotoRouteFinishDialog } from './PhotoRouteFinishDialog';

describe('PhotoRouteFinishDialog', () => {
  let dialogs: ReturnType<typeof mockModalDialogs>;
  beforeEach(() => { dialogs = mockModalDialogs(); });
  afterEach(() => { cleanup(); dialogs.restore(); vi.clearAllMocks(); });

  function setup(confirmedCount = 4) {
    const onDismiss = vi.fn();
    const onReset = vi.fn();
    const view = render(<PhotoRouteFinishDialog destination="Point 4" confirmedCount={confirmedCount}
      totalCount={4} onDismiss={onDismiss} onReset={onReset} />);
    return { ...view, onDismiss, onReset };
  }

  it('opens a named modal with the finish point and actual confirmation count', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Finish recognized' }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialogs.showModal).toHaveBeenCalledOnce();
    expect(screen.getByText('Point 4')).toBeTruthy();
    expect(screen.getByText('4 of 4')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText(/skipped for this test/)).toBeNull();
  });

  it('reports skipped points without claiming a complete physical walk', () => {
    setup(1);
    expect(screen.getByText('1 of 4')).toBeTruthy();
    expect(screen.getByText('3 viewpoints skipped for this test.')).toBeTruthy();
    expect(screen.getByText(/not a measured arrival distance/)).toBeTruthy();
  });

  it('supports explicit dismissal, reset, and native Escape cancellation', () => {
    const { onDismiss, onReset } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Reset route' }));
    expect(onReset).toHaveBeenCalledOnce();
    const event = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), event);
    expect(event.defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('closes the native modal when unmounted', () => {
    const { unmount } = setup();
    unmount();
    expect(dialogs.close).toHaveBeenCalledOnce();
  });
});
