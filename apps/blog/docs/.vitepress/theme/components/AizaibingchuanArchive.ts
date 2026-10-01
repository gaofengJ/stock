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
const archiveDate = (text: string) => {
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:-|$)/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : 0;
};

export default defineComponent({
  name: 'AizaibingchuanArchive',
  setup() {
    const { page } = useData();
    const index = ref<ArchiveIndex>();
    const yearItems = ref<Record<string, ArchiveItem[]>>({});
    const expandedMenu = ref<string>();
    const selectedDate = ref('');
    const error = ref('');

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
        [year]: [...archive.items].sort((left, right) => archiveDate(right.text) - archiveDate(left.text)),
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
      selectedDate.value = '';
      try { if (/^\d{4}$/.test(menu)) await loadYear(menu); }
      catch { error.value = '目录加载失败，请重新展开年份重试。'; }
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
        expanded ? renderItems(selectedDate.value && /^\d{4}$/.test(menu)
          ? items.filter(item => archiveDate(item.text) === Date.parse(`${selectedDate.value}T00:00:00Z`)) : items) : null,
        expanded && selectedDate.value && /^\d{4}$/.test(menu) && !items.some(item => archiveDate(item.text) === Date.parse(`${selectedDate.value}T00:00:00Z`))
          ? h('p', { class: 'archive-empty' }, '该日期未收录复盘。') : null,
      ]);
    };

    const loadSafely = () => { selectedDate.value = ''; loadArchiveForPage().catch(() => { error.value = '目录加载失败，请刷新重试。'; }); };
    onMounted(loadSafely);
    watch(() => page.value.relativePath, loadSafely);

    return () => {
      if (!isArchiveSection.value || !index.value) return null;

      return h('section', { class: 'aizaibingchuan-archive' }, [
        h('label', { class: 'archive-date-filter' }, ['查找复盘日期', h('input', {
          type: 'date', value: selectedDate.value,
          onChange: async (event: Event) => {
            selectedDate.value = (event.target as HTMLInputElement).value;
            if (!selectedDate.value) return;
            const year = selectedDate.value.slice(0, 4);
            if (!index.value?.years.some(item => item.year === year)) { error.value = '该年份尚未收录。'; return; }
            error.value = '';
            expandedMenu.value = year;
            try { await loadYear(year); } catch { error.value = '目录加载失败，请重新展开年份重试。'; }
          },
        })]),
        error.value ? h('p', { role: 'status', class: 'archive-empty' }, error.value) : null,
        renderMenu('highlights', '年度精华', index.value.highlights),
        ...[...index.value.years].reverse().map(({ year }) => renderMenu(year, year, yearItems.value[year] || [])),
        renderMenu('strategies', '交易战法', index.value.strategies),
      ]);
    };
  },
});
