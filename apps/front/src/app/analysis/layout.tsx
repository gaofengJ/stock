import { MarketProvider } from './components/MarketContext';

type Props = {
  children: React.ReactNode;
};

export default function Layout({ children }: Props) {
  return (<MarketProvider>{children}</MarketProvider>);
}
