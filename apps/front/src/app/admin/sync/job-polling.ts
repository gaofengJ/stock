export function startJobPolling<T extends { status: string; handling?: string }>(options: {
  read: () => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  visible: () => boolean;
}) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const terminal = ['success', 'failed', 'interrupted', 'paused', 'cancelled'];
  const poll = async () => {
    if (disposed) return;
    if (options.visible()) {
      try {
        const value = await options.read();
        if (disposed) return;
        options.onValue(value);
        if (terminal.includes(value.status) && value.handling !== 'continued') return;
      } catch (error) {
        if (disposed) return;
        options.onError(error);
      }
    }
    if (!disposed) timer = setTimeout(poll, 5000);
  };
  poll();
  return () => { disposed = true; clearTimeout(timer); };
}
