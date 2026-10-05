'use client';

import {
  createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Account, api } from './client';

const Context = createContext({ unread: false, refresh: async () => {} });
export const useFeedbackNotifications = () => useContext(Context);

export default function FeedbackNotifications({ user, children }: { user: Account | null; children: ReactNode }) {
  const enabled = !!user && !user.guest && !user.mustChangePassword;
  const scope = enabled ? `${user.id}:${user.roles.some((role) => role.code === 'admin')}` : '';
  const [state, setState] = useState({ scope: '', unread: false });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!scope) return;
    sequence.current += 1;
    const request = sequence.current;
    try {
      const result = await api<{ unread: boolean }>('/feedback/unread', 'GET', undefined, false);
      if (request === sequence.current) setState({ scope, unread: result.unread });
    } catch {
      // A temporary notification failure must not interrupt the current page.
    }
  }, [scope]);
  useEffect(() => {
    refresh();
    return () => { sequence.current += 1; };
  }, [refresh]);
  const value = useMemo(() => ({ unread: !!scope && state.scope === scope && state.unread, refresh }), [scope, state, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
