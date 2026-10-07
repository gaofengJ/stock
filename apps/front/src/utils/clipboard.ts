/** Return false when browser permissions require the user to copy manually. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // HTTP pages and denied permissions can still support the legacy copy action.
  }

  const active = document.activeElement;
  const selection = window.getSelection();
  const ranges = Array.from({ length: selection?.rangeCount || 0 }, (_, i) => selection!.getRangeAt(i));
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  // Keep the temporary field inside a dialog's focus trap when copying from a modal.
  (active?.closest('[role="dialog"]') || document.body).appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    if (active instanceof HTMLElement) active.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
  }
}
