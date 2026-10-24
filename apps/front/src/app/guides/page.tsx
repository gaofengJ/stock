import Link from 'next/link';
import DiscoveryShell from '@/discovery/Shell';
import { guides, publicMetadata } from '@/discovery/site';

export const metadata = publicMetadata('A股选股与复盘使用指南', '从实际操作了解策略筛选、历史信号统计、每日复盘与券商月度金股查询。无需登录即可阅读完整指南。', '/guides/');
export default function Page() {
  return (
    <DiscoveryShell>
      <h1>使用指南</h1>
      <p className="discovery-intro">选一个任务，按步骤开始。无需登录即可阅读。</p>
      <div className="discovery-grid guides">
        {guides.map((guide) => (
          <article className="discovery-card" key={guide.slug}>
            <h2>{guide.title}</h2>
            <p>{guide.description}</p>
            <Link href={`/guides/${guide.slug}/`}>阅读完整指南</Link>
          </article>
        ))}
      </div>
    </DiscoveryShell>
  );
}
