// Exactly one retry for a transient transport failure. Never retry auth/validation.
export async function themeRequest<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  try { return await read(); } catch (error) {
    const cause = error as { response?: { status?: number }; code?: string };
    const transient = [502, 503, 504].includes(cause.response?.status || 0) || ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'].includes(cause.code || '');
    if (signal.aborted || !transient) throw error;
    return read();
  }
}
