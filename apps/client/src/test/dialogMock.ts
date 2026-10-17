import { vi } from 'vitest';

export function mockModalDialogs() {
  const prototype = HTMLDialogElement.prototype;
  const previousShow = Object.getOwnPropertyDescriptor(prototype, 'showModal');
  const previousClose = Object.getOwnPropertyDescriptor(prototype, 'close');
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
    this.querySelector<HTMLButtonElement>('button')?.focus();
  });
  const close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
  Object.defineProperty(prototype, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(prototype, 'close', { configurable: true, value: close });
  return {
    showModal, close,
    restore() {
      if (previousShow) Object.defineProperty(prototype, 'showModal', previousShow);
      else Reflect.deleteProperty(prototype, 'showModal');
      if (previousClose) Object.defineProperty(prototype, 'close', previousClose);
      else Reflect.deleteProperty(prototype, 'close');
    },
  };
}
