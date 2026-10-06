import Link from 'next/link';
import DiscoveryShell from '@/discovery/Shell';
import { guides, publicMetadata } from '@/discovery/site';

export const metadata = publicMetadata('A股选股与复盘使用指南', '从实际操作了解策略筛选、历史信号统计、每日复盘与券商月度金股查询。无需登录即可阅读完整指南。', '/guides/');
export default function Page() {
  return (
    <DiscoveryShell>
      <h1>A股选股与复盘使用指南</h1>
      <p className="discovery-intro">围绕一个具体任务了解操作步骤和统计口径。指南公开阅读，工具入口沿用现有访问权限。</p>
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
