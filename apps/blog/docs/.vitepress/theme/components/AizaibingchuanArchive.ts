import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { useData, withBase } from 'vitepress';

type ArchiveItem = {
  text: string;
  link: string;
};

type ArchiveIndex = {
  highlights: ArchiveItem[];
  years: Array<{ year: string; text: string }>;
  strategies: ArchiveItem[];
};

type ArchiveYear = {
  year: string;
  items: ArchiveItem[];
};

const archiveFiles = import.meta.glob<{ default: ArchiveIndex | ArchiveYear }>(
  '../aizaibingchuan-sidebar/*.json',
);

const loadArchive = async <T>(name: string) => {
  const loader = archiveFiles[`../aizaibingchuan-sidebar/${name}.json`];
  if (!loader) return;
  const archive = await loader();
  return archive.default as T;
};

const cleanLink = (link: string) => link.replace(/\.md$/, '');
const archiveDate = (link: string) => {
  const match = link.match(/\/(\d{4})-(\d{1,2})-(\d{1,2})(?:-|\.|$)/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : 0;
};

export default defineComponent({
  name: 'AizaibingchuanArchive',
  setup() {
    const { page } = useData();
    const index = ref<ArchiveIndex>();
    const yearItems = ref<Record<string, ArchiveItem[]>>({});
    const expandedMenu = ref<string>();

    const currentYear = computed(() => (
      page.value.relativePath.match(/^reviews\/aizaibingchuan\/(\d{4})\//)?.[1]
    ));
    const isArchiveSection = computed(() => (
      page.value.relativePath === 'reviews/index.md'
      || page.value.relativePath.startsWith('reviews/aizaibingchuan/')
    ));

    const loadIndex = async () => {
      if (index.value) return index.value;
      index.value = await loadArchive<ArchiveIndex>('index');
      return index.value;
    };

    const loadYear = async (year?: string) => {
      if (!year) return;
      await loadIndex();
      if (yearItems.value[year]) return;
      const archive = await loadArchive<ArchiveYear>(year);
      if (!archive) return;
      yearItems.value = {
        ...yearItems.value,
        [year]: [...archive.items].sort((left, right) => archiveDate(right.link) - archiveDate(left.link)),
      };
    };

    const loadArchiveForPage = async () => {
      if (!isArchiveSection.value) return;
      const archiveIndex = await loadIndex();
      if (!archiveIndex) return;
      const relativePath = page.value.relativePath;
      if (/^reviews\/aizaibingchuan\/review-summary-\d{4}\.md$/.test(relativePath)) {
        expandedMenu.value = 'highlights';
        return;
      }
      if (relativePath.startsWith('reviews/aizaibingchuan/strategies/')) {
        expandedMenu.value = 'strategies';
        return;
      }
      const defaultYear = currentYear.value || archiveIndex.years.at(-1)?.year;
      expandedMenu.value = defaultYear;
      await loadYear(defaultYear);
    };

    const toggleMenu = async (menu: string) => {
      if (expandedMenu.value === menu) {
        expandedMenu.value = undefined;
        return;
      }
      expandedMenu.value = menu;
      if (/^\d{4}$/.test(menu)) await loadYear(menu);
    };

    const isActiveLink = (link: string) => (
      cleanLink(link).replace(/^\//, '') === page.value.relativePath.replace(/\.md$/, '')
    );

    const renderItems = (items: ArchiveItem[]) => h(
      'div',
      { class: 'aizaibingchuan-menu-items' },
      items.map((item) => h('a', {
        class: { active: isActiveLink(item.link) },
        href: withBase(cleanLink(item.link)),
      }, item.text)),
    );

    const renderMenu = (menu: string, label: string, items: ArchiveItem[]) => {
      const expanded = expandedMenu.value === menu;
      return h('section', { class: 'aizaibingchuan-menu-group' }, [
        h('button', {
          class: { 'aizaibingchuan-menu-button': true, active: expanded },
          type: 'button',
          'aria-expanded': expanded,
          onClick: () => toggleMenu(menu),
        }, [
          h('span', label),
          h('span', { class: 'aizaibingchuan-menu-chevron', 'aria-hidden': 'true' }),
        ]),
        expanded ? renderItems(items) : null,
      ]);
    };

    onMounted(loadArchiveForPage);
    watch(() => page.value.relativePath, loadArchiveForPage);

    return () => {
      if (!isArchiveSection.value || !index.value) return null;

      return h('section', { class: 'aizaibingchuan-archive' }, [
        renderMenu('highlights', '年度精华', index.value.highlights),
        ...index.value.years.map(({ year }) => renderMenu(year, year, yearItems.value[year] || [])),
        renderMenu('strategies', '交易战法', index.value.strategies),
      ]);
    };
  },
});
