import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { getBasicTradeCalList } from '@/api/services';

let cachedCandidate = '';
let cachedTradeDatePromise: Promise<string> | null = null;

const getCandidateDate = () => {
  const now = dayjs();
  return now.hour() >= 20 ? now : now.subtract(1, 'day');
};

const loadDefaultTradeDate = (candidate: string) => {
  if (cachedCandidate === candidate && cachedTradeDatePromise) {
    return cachedTradeDatePromise;
  }

  cachedCandidate = candidate;
  cachedTradeDatePromise = getBasicTradeCalList({
    year: dayjs(candidate).format('YYYY'),
  }).then(({ data }) => {
    const latestTradeDay = data
      .filter((item) => Number(item.isOpen) === 1 && item.calDate <= candidate)
      .sort((a, b) => b.calDate.localeCompare(a.calDate))[0];
    return latestTradeDay?.calDate || candidate;
  }).catch((error) => {
    cachedTradeDatePromise = null;
    console.error(error);
    return candidate;
  });

  return cachedTradeDatePromise;
};

/**
 * 每晚 20 点后允许使用当天，否则使用不晚于候选日期的最近交易日。
 */
export const useDefaultTradeDate = () => {
  const [candidate] = useState(() => getCandidateDate().format('YYYY-MM-DD'));
  const [tradeDate, setTradeDate] = useState(candidate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    loadDefaultTradeDate(candidate).then((date) => {
      if (!active) return;
      setTradeDate(date);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [candidate]);

  return { candidate, ready, tradeDate };
};
