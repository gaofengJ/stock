import type { TableProps } from 'antd';

type Change<Row> = NonNullable<TableProps<Row>['onChange']>;
export interface TableView<Row> { filters: Parameters<Change<Row>>[1]; sorter: Parameters<Change<Row>>[2] }

/** Reapply the table's public sorter/filter contracts after its data refreshes. */
export function tableNavigationRows<Row extends object>(rows: readonly Row[], columns?: TableProps<Row>['columns'], view?: TableView<Row>): Row[] {
  const flatten = (items: NonNullable<TableProps<Row>['columns']>): NonNullable<TableProps<Row>['columns']> => items.flatMap((column) => ('children' in column ? flatten(column.children) : [column]));
  const leaves = flatten(columns || []);
  const keyFor = (column: typeof leaves[number], index: number) => String(column.key ?? ('dataIndex' in column && column.dataIndex ? [column.dataIndex].flat().join('.') : index));
  const filtered = rows.filter((row) => leaves.every((column, index) => {
    if (!('onFilter' in column) || !column.onFilter) return true;
    const key = keyFor(column, index);
    const saved = view && key in view.filters ? view.filters[key] : column.defaultFilteredValue;
    const values = column.filteredValue !== undefined ? column.filteredValue : saved;
    return !values?.length || values.some((value) => column.onFilter!(value, row));
  }));
  const stored = view ? [view.sorter].flat() : [];
  const sorts = leaves.map((column, index) => {
    const previous = stored.find((sorter) => String(sorter.columnKey) === keyFor(column, index));
    const order = 'sortOrder' in column && column.sortOrder !== undefined ? column.sortOrder : previous?.order ?? (!view && 'defaultSortOrder' in column ? column.defaultSortOrder : null);
    const sorter = 'sorter' in column ? column.sorter : undefined;
    let compare;
    if (typeof sorter === 'function') compare = sorter;
    else if (typeof sorter === 'object') compare = sorter.compare;
    return { order, compare, priority: typeof sorter === 'object' ? sorter.multiple || 0 : 0 };
  }).filter((sorter) => sorter.order && sorter.compare).sort((a, b) => b.priority - a.priority);
  return filtered.sort((a, b) => sorts.reduce((result, sorter) => result || sorter.compare!(a, b, sorter.order!) * (sorter.order === 'ascend' ? 1 : -1), 0));
}
