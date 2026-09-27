import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getBasicTradeCalList } from '@/api/services';
import { errorMessage } from '@/api/errors';

let cachedCandidate = '';
let cachedTradeDatePromise: Promise<string> | null = null;
export const clearTradeDateCache = () => { cachedCandidate = ''; cachedTradeDatePromise = null; };

export const getCandidateDate = (now = new Date()) => {
  const china = dayjs(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  return china.hour() * 60 + china.minute() >= 20 * 60 + 30 ? china : china.subtract(1, 'day');
};
const loadDefaultTradeDate = (candidate: string) => {
  if (cachedCandidate === candidate && cachedTradeDatePromise) return cachedTradeDatePromise;
  cachedCandidate = candidate;
  cachedTradeDatePromise = (async () => {
    const { data } = await getBasicTradeCalList({ year: dayjs(candidate).format('YYYY') });
    const latest = data.filter((item) => Number(item.isOpen) === 1 && item.calDate <= candidate).sort((a, b) => b.calDate.localeCompare(a.calDate))[0];
    if (latest) return latest.calDate;
    // The first days of January may still need the previous year's calendar.
    const previous = await getBasicTradeCalList({ year: dayjs(candidate).subtract(1, 'year').format('YYYY') });
    const last = previous.data.filter((item) => Number(item.isOpen) === 1 && item.calDate <= candidate).sort((a, b) => b.calDate.localeCompare(a.calDate))[0];
    if (!last) throw new Error('暂无可用交易日，请检查交易日历同步状态');
    return last.calDate;
  })().catch((error) => { cachedTradeDatePromise = null; throw error; });
  return cachedTradeDatePromise;
};
/** Use the existing calendar independently of market-summary publication. */
export const useDefaultTradeDate = () => {
  const [candidate] = useState(() => getCandidateDate().format('YYYY-MM-DD'));
  const [tradeDate, setTradeDate] = useState(candidate);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { clearTradeDateCache(); setAttempt((v) => v + 1); }, []);
  useEffect(() => {
    let active = true;
    setError(''); setReady(false);
    loadDefaultTradeDate(candidate).then((date) => {
      if (active) { setTradeDate(date); setReady(true); }
    }).catch((e) => { if (active) setError(errorMessage(e, '交易日期加载失败，请重试')); });
    return () => { active = false; };
  }, [candidate, attempt]);
  return {
    candidate, ready, tradeDate, error, retry,
  };
};
