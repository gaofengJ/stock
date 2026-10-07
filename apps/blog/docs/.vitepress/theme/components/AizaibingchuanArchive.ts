import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData, withBase } from 'vitepress';
import { archiveDate, archiveLabel, archiveMonths, type ArchiveItem } from '../archive-utils';


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

export default defineComponent({
  name: 'AizaibingchuanArchive',
  setup() {
    const { page } = useData();
    const index = ref<ArchiveIndex>();
    const yearItems = ref<Record<string, ArchiveItem[]>>({});
    const expandedMenu = ref<string>();
    const expandedMonth = ref<string>();
    const selectedDate = ref('');
    const error = ref('');
    const busy = ref(false);
    let request = 0;

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
      if (!archive) throw new Error('Missing archive');
      yearItems.value = {
        ...yearItems.value,
        [year]: [...archive.items].sort((left, right) => archiveDate(right).localeCompare(archiveDate(left))),
      };
    };

    const loadArchiveForPage = async () => {
      if (!isArchiveSection.value) return;
      const id = ++request;
      const relativePath = page.value.relativePath;
      const archiveIndex = await loadIndex();
      if (!archiveIndex || id !== request) return;
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
      if (id !== request || expandedMenu.value !== defaultYear) return;
      const active = (yearItems.value[defaultYear || ''] || []).find(item => isActiveLink(item.link));
      expandedMonth.value = active ? archiveDate(active).slice(0, 7) : archiveMonths(yearItems.value[defaultYear || ''] || [])[0]?.month;
    };

    const toggleMenu = async (menu: string) => {
      const id = ++request;
      error.value = '';
      if (expandedMenu.value === menu) {
        expandedMenu.value = undefined;
        busy.value = false;
        return;
      }
      expandedMenu.value = menu;
      selectedDate.value = '';
      expandedMonth.value = undefined;
      busy.value = true;
      try {
        if (/^\d{4}$/.test(menu)) {
          await loadYear(menu);
          if (id === request) expandedMonth.value = archiveMonths(yearItems.value[menu] || [])[0]?.month;
        }
      }
      catch { if (id === request) error.value = '目录加载失败，请重新展开年份重试。'; }
      finally { if (id === request) busy.value = false; }
    };

    const isActiveLink = (link: string) => (
      cleanLink(link).replace(/^\//, '') === page.value.relativePath.replace(/\.md$/, '')
    );

    const renderItems = (items: ArchiveItem[]) => h(
      'div',
      { class: 'aizaibingchuan-menu-items' },
      items.map((item) => h('a', {
        class: { active: isActiveLink(item.link) },
        'aria-current': isActiveLink(item.link) ? 'page' : undefined,
        title: item.title || item.text,
        href: withBase(cleanLink(item.link)),
      }, archiveDate(item) ? archiveLabel(item) : item.text)),
    );

    const renderYear = (menu: string, items: ArchiveItem[]) => {
      if (busy.value && !yearItems.value[menu]) return h('p', { class: 'archive-empty', role: 'status' }, '正在加载目录…');
      if (selectedDate.value) {
        const matches = items.filter(item => archiveDate(item) === selectedDate.value);
        return matches.length ? renderItems(matches) : h('p', { class: 'archive-empty', role: 'status' }, '该日期未收录复盘。');
      }
      return archiveMonths(items).map(({ month, items: entries }) => h('section', { class: 'archive-month' }, [
        h('button', {
          type: 'button', class: 'archive-month-button', 'aria-expanded': expandedMonth.value === month,
          'aria-controls': `archive-month-${month}`, onClick: () => { expandedMonth.value = expandedMonth.value === month ? undefined : month; },
        }, [h('span', `${Number(month.slice(5))} 月`), h('span', { class: 'archive-month-count' }, `${entries.length} 篇`)]),
        expandedMonth.value === month ? h('div', { id: `archive-month-${month}` }, [renderItems(entries)]) : null,
      ]));
    };

    const renderMenu = (menu: string, label: string, items: ArchiveItem[]) => {
      const expanded = expandedMenu.value === menu;
      return h('section', { class: 'aizaibingchuan-menu-group' }, [
        h('button', {
          class: { 'aizaibingchuan-menu-button': true, active: expanded },
          type: 'button',
          'aria-expanded': expanded,
          'aria-controls': `archive-group-${menu}`,
          onClick: () => toggleMenu(menu),
        }, [
          h('span', label),
          h('span', { class: 'aizaibingchuan-menu-chevron', 'aria-hidden': 'true' }),
        ]),
        expanded ? h('div', { id: `archive-group-${menu}` }, /^\d{4}$/.test(menu) ? renderYear(menu, items) : renderItems(items)) : null,
      ]);
    };

    const loadSafely = () => { selectedDate.value = ''; error.value = ''; loadArchiveForPage().catch(() => { error.value = '目录加载失败，请刷新重试。'; }); };
    onMounted(loadSafely);
    onBeforeUnmount(() => { ++request; });
    watch(() => page.value.relativePath, loadSafely);

    return () => {
      if (!isArchiveSection.value) return null;
      if (!index.value) return error.value ? h('p', { class: 'archive-empty', role: 'status' }, error.value) : null;

      return h('section', { class: 'aizaibingchuan-archive' }, [
        h('a', { class: 'archive-all-link', href: withBase('/reviews/') }, '全部复盘与年度精华'),
        h('label', { class: 'archive-date-filter' }, ['筛选复盘日期', h('input', {
          type: 'date', value: selectedDate.value,
          onChange: async (event: Event) => {
            const id = ++request;
            error.value = '';
            selectedDate.value = (event.target as HTMLInputElement).value;
            if (!selectedDate.value) return;
            const year = selectedDate.value.slice(0, 4);
            if (!index.value?.years.some(item => item.year === year)) { expandedMenu.value = undefined; error.value = '该年份尚未收录。'; return; }
            error.value = '';
            expandedMenu.value = year;
            busy.value = true;
            try { await loadYear(year); } catch { if (id === request) error.value = '目录加载失败，请重新展开年份重试。'; }
            finally { if (id === request) busy.value = false; }
          },
        })]),
        selectedDate.value ? h('button', { type: 'button', class: 'archive-clear', onClick: loadSafely }, '清除日期筛选') : null,
        error.value ? h('p', { role: 'status', class: 'archive-empty' }, error.value) : null,
        renderMenu('highlights', '年度精华', [...index.value.highlights].reverse()),
        ...[...index.value.years].reverse().map(({ year }) => renderMenu(year, year, yearItems.value[year] || [])),
        renderMenu('strategies', '交易战法', index.value.strategies),
      ]);
    };
  },
});
