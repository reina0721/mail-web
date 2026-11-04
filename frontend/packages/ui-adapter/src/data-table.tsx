import { Table } from '@heroui/react/table';
import { Fragment, useState, type Key, type ReactNode } from 'react';

export type DataColumn<Row> = Readonly<{
  id: string;
  label: string;
  rowHeader?: boolean;
  sortable?: boolean;
  render: (row: Row) => ReactNode;
}>;

export type DataTableSingleSelection = Readonly<{
  mode?: 'single';
  selectedId?: string;
  onSelectionChange: (id: string) => void;
}>;

export type DataTableMultiSelection = Readonly<{
  mode: 'multiple';
  selectedIds: readonly string[];
  onSelectionChange: (ids: readonly string[]) => void;
}>;

export type DataTableSelection = DataTableSingleSelection | DataTableMultiSelection;

export type DataTableSort = Readonly<{
  columnId: string;
  direction: 'ascending' | 'descending';
  onSortChange: (columnId: string, direction: 'ascending' | 'descending') => void;
}>;

export type DataTableProps<Row extends Readonly<{ id: string }>> = Readonly<{
  label: string;
  columns: readonly DataColumn<Row>[];
  rows: readonly Row[];
  emptyContent: ReactNode;
  density?: 'comfortable' | 'compact';
  /** 行分隔/边界（默认开；settings 数据展示 → rowSeparators 消费）。 */
  rowSeparators?: boolean;
  /** 固定表头（默认开；settings 数据展示 → stickyHeader 消费）。 */
  stickyHeader?: boolean;
  /** 空数据渲染辅助说明（默认开；settings 数据展示 → emptyStateHint 消费）。 */
  emptyStateHint?: boolean;
  selection?: DataTableSelection;
  sort?: DataTableSort;
  columnWidths?: Readonly<Record<string, number>>;
  onColumnWidthsChange?: (widths: Readonly<Record<string, number>>) => void;
}>;

export function DataTable<Row extends Readonly<{ id: string }>>({
  label,
  columns,
  rows,
  emptyContent,
  density = 'comfortable',
  rowSeparators = true,
  stickyHeader = true,
  emptyStateHint = true,
  selection,
  sort,
  columnWidths,
  onColumnWidthsChange,
}: DataTableProps<Row>) {
  const [resizingWidths, setResizingWidths] = useState<Readonly<Record<string, number>> | null>(
    null,
  );
  const readWidths = (widths: ReadonlyMap<Key, number | string>) => {
    const next: Record<string, number> = {};
    for (const [id, width] of widths) {
      if (typeof width === 'number' && Number.isFinite(width)) next[String(id)] = width;
    }
    return next;
  };
  const widthProps = (id: string): Readonly<{ width?: number }> => {
    const width = (resizingWidths ?? columnWidths)?.[id];
    return width !== undefined ? { width } : {};
  };
  const ResizableContainer = onColumnWidthsChange ? Table.ResizableContainer : Fragment;
  const cellSpacing = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3.5';
  const selectedIds = selection
    ? selection.mode === 'multiple'
      ? selection.selectedIds
      : selection.selectedId
        ? [selection.selectedId]
        : []
    : [];
  return (
    <Table>
      <Table.ScrollContainer className="min-w-0 overflow-auto" data-table-scroll-container>
        <ResizableContainer
          {...(onColumnWidthsChange
            ? {
                onResize: (widths: ReadonlyMap<Key, number | string>) =>
                  setResizingWidths(readWidths(widths)),
                onResizeEnd: (widths: ReadonlyMap<Key, number | string>) => {
                  onColumnWidthsChange(readWidths(widths));
                  setResizingWidths(null);
                },
              }
            : {})}
        >
          <Table.Content
            aria-label={label}
            className="min-w-full border-separate border-spacing-0 text-left text-sm"
            {...(selection
              ? {
                  selectionMode:
                    selection.mode === 'multiple' ? ('multiple' as const) : ('single' as const),
                  selectionBehavior:
                    selection.mode === 'multiple' ? ('toggle' as const) : ('replace' as const),
                  disallowEmptySelection:
                    selection.mode !== 'multiple' && Boolean(selection.selectedId),
                  selectedKeys: new Set(selectedIds),
                  onSelectionChange: (keys: 'all' | Set<Key>) => {
                    if (selection.mode === 'multiple') {
                      selection.onSelectionChange(
                        keys === 'all' ? rows.map((row) => row.id) : [...keys].map(String),
                      );
                      return;
                    }
                    if (keys === 'all') return;
                    const selectedKey = keys.values().next().value;
                    if (selectedKey !== undefined) selection.onSelectionChange(String(selectedKey));
                  },
                }
              : {})}
            {...(sort
              ? {
                  sortDescriptor: { column: sort.columnId, direction: sort.direction },
                  onSortChange: (descriptor: {
                    column: Key;
                    direction: 'ascending' | 'descending';
                  }) => sort.onSortChange(String(descriptor.column), descriptor.direction),
                }
              : {})}
          >
            <Table.Header>
              {columns.map((column) => (
                <Table.Column
                  className={`${cellSpacing} ${stickyHeader ? 'sticky top-0' : ''} border-b border-border bg-surface-muted text-xs font-bold uppercase tracking-wider text-ink-muted`}
                  {...widthProps(column.id)}
                  id={column.id}
                  key={column.id}
                  {...(column.sortable ? { allowsSorting: true } : {})}
                  {...(column.rowHeader ? { isRowHeader: true } : {})}
                >
                  {({ sortDirection }) => (
                    <>
                      <Table.SortableColumnHeader {...(sortDirection ? { sortDirection } : {})}>
                        {column.label}
                      </Table.SortableColumnHeader>
                      {onColumnWidthsChange ? (
                        <Table.ColumnResizer className="translate-x-0" />
                      ) : null}
                    </>
                  )}
                </Table.Column>
              ))}
            </Table.Header>
            <Table.Body
              renderEmptyState={
                emptyStateHint
                  ? () => (
                      <div className="px-4 py-10 text-center text-sm text-ink-muted">
                        {emptyContent}
                      </div>
                    )
                  : () => null
              }
            >
              {rows.map((row) => (
                <Table.Row
                  className={selection ? 'cursor-pointer' : 'cursor-default'}
                  id={row.id}
                  key={row.id}
                >
                  {columns.map((column) => (
                    <Table.Cell
                      className={`${cellSpacing} ${rowSeparators ? 'border-b border-border' : ''} align-middle text-ink`}
                      key={column.id}
                    >
                      {column.render(row)}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </ResizableContainer>
      </Table.ScrollContainer>
    </Table>
  );
}
