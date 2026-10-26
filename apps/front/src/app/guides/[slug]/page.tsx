import Link from 'next/link';
import { notFound } from 'next/navigation';
import DiscoveryShell from '@/discovery/Shell';
import StructuredData from '@/discovery/StructuredData';
import {
  guides, publicMetadata, siteName, siteUrl,
} from '@/discovery/site';
import { guideSections } from '@/discovery/content';
import { guestTrialMinutes } from '@/auth/trial';

export const dynamicParams = false;
export function generateStaticParams() { return guides.map((guide) => ({ slug: guide.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guides.find((item) => item.slug === slug);
  return guide ? publicMetadata(guide.title, guide.description, `/guides/${guide.slug}/`) : {};
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guides.find((item) => item.slug === slug);
  if (!guide) notFound();
  const url = `${siteUrl}/guides/${guide.slug}/`;
  return (
    <DiscoveryShell>
      <article className="discovery-article">
        <nav className="discovery-breadcrumb" aria-label="面包屑">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href="/guides/">使用指南</Link>
          <span>/</span>
          <span>{guide.toolName}</span>
        </nav>
        <StructuredData data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Article', headline: guide.title, description: guide.description, mainEntityOfPage: url, datePublished: '2026-10-06', dateModified: '2026-10-24', author: { '@type': 'Organization', name: siteName, url: siteUrl }, inLanguage: 'zh-CN',
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem', position: 1, name: '首页', item: `${siteUrl}/`,
                },
                {
                  '@type': 'ListItem', position: 2, name: '使用指南', item: `${siteUrl}/guides/`,
                },
                {
                  '@type': 'ListItem', position: 3, name: guide.title, item: url,
                },
              ],
            },
          ],
        }}
        />
        <h1>{guide.title}</h1>
        <p className="discovery-intro">{guide.description}</p>
        <div className="discovery-meta">
          <span>更新于2026年10月24日</span>
          <span>使用指南</span>
        </div>
        <aside className="discovery-tool-entry" aria-label="进入工具">
          <div>
            <strong>边看边操作</strong>
            <p>{`工具可体验 ${guestTrialMinutes} 分钟，公开指南不计时。`}</p>
          </div>
          <div className="discovery-actions"><Link className="discovery-action primary" href={guide.tool}>{`打开${guide.toolName}`}</Link></div>
        </aside>
        {guideSections[guide.slug].map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.steps && <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
          </section>
        ))}
        <section className="discovery-related">
          <h2>继续阅读</h2>
          <ul>{guides.filter((item) => item.slug !== guide.slug).map((item) => <li key={item.slug}><Link href={`/guides/${item.slug}/`}>{item.title}</Link></li>)}</ul>
        </section>
      </article>
    </DiscoveryShell>
  );
}
