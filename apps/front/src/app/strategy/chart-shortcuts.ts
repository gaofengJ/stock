export function chartShortcut(event: KeyboardEvent, chart: HTMLElement | null): { kind: 'stock' | 'time'; direction: number } | null {
  const { target } = event;
  if (!(target instanceof HTMLElement) || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const dialog = chart?.closest('[role="dialog"]');
  if (!dialog?.contains(target) || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="spinbutton"], [role="slider"], [role="menu"], [role="listbox"], [role="tablist"], .ant-popover, .ant-picker-dropdown, .ant-select-dropdown')) return null;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') return { kind: 'time', direction: event.key === 'ArrowLeft' ? -1 : 1 };
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') return { kind: 'stock', direction: event.key === 'ArrowUp' ? -1 : 1 };
  return null;
}
