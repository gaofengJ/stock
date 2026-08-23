import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { useData, withBase } from 'vitepress';

type ArchiveItem = {
  text: string;
  link: string;
};

type ArchiveIndex = {
  years: Array<{ year: string; text: string }>;
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
    const items = ref<ArchiveItem[]>([]);
    const selectedYear = ref<string>();

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
      const archive = await loadArchive<ArchiveYear>(year);
      if (!archive) return;
      selectedYear.value = year;
      items.value = [...archive.items].sort((left, right) => archiveDate(right.link) - archiveDate(left.link));
    };

    const loadArchiveForPage = async () => {
      if (!isArchiveSection.value) return;
      const archiveIndex = await loadIndex();
      const defaultYear = currentYear.value || archiveIndex?.years.at(-1)?.year;
      await loadYear(defaultYear);
    };

    onMounted(loadArchiveForPage);
    watch(() => page.value.relativePath, loadArchiveForPage);

    return () => {
      if (!isArchiveSection.value || !index.value || !selectedYear.value) return null;

      return h('section', { class: 'aizaibingchuan-archive' }, [
        h('div', { class: 'aizaibingchuan-archive-years', role: 'tablist', 'aria-label': '复盘年份' }, index.value.years.map(({ year, text }) => h('button', {
          class: { active: year === selectedYear.value },
          type: 'button',
          role: 'tab',
          'aria-selected': year === selectedYear.value,
          onClick: () => loadYear(year),
        }, text))),
        h('div', { class: 'aizaibingchuan-archive-items' }, items.value.map((item) => h('a', {
          class: { active: page.value.relativePath === `${cleanLink(item.link).replace(/^\//, '')}.md` },
          href: withBase(cleanLink(item.link)),
        }, item.text))),
      ]);
    };
  },
});
