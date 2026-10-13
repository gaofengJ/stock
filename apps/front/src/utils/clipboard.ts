/** Return false when browser permissions require the user to copy manually. */
export async function copyText(text: string, timeoutMs = 3000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (navigator.clipboard?.writeText) {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Clipboard timed out')), timeoutMs); }),
      ]);
      return true;
    }
  } catch {
    // HTTP pages and denied permissions can still support the legacy copy action.
  } finally { clearTimeout(timer); }

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
