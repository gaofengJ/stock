import { Suspense } from 'react';
import Loading from '@/components/Loading';
import { MarketProvider } from './components/MarketContext';

type Props = {
  children: React.ReactNode;
};

export default function Layout({ children }: Props) {
  return (<Suspense fallback={<Loading height="100dvh" />}><MarketProvider>{children}</MarketProvider></Suspense>);
}
