import { tv } from '@heroui/styles';
import { Breadcrumbs } from '@heroui/react/breadcrumbs';
import { Link as HeroLink } from '@heroui/react/link';
import { Pagination } from '@heroui/react/pagination';
import type { MouseEvent, ReactNode } from 'react';

export type BreadcrumbItem = Readonly<{
  id: string;
  label: string;
  content?: ReactNode;
  href?: string;
  disabled?: boolean;
}>;

export type BreadcrumbTrailProps = Readonly<{
  label: string;
  items: readonly BreadcrumbItem[];
}>;

export function BreadcrumbTrail({ label, items }: BreadcrumbTrailProps) {
  return (
    <Breadcrumbs
      aria-label={label}
      className="ui-breadcrumbs flex flex-wrap text-sm text-ink-muted"
      separator={<span aria-hidden="true">/</span>}
    >
      {items.map((item, index) => {
        const current = index === items.length - 1;
        return (
          <Breadcrumbs.Item
            className="font-medium text-ink-muted data-[current]:text-ink"
            key={item.id}
            {...(current ? { 'aria-current': 'page' as const } : {})}
            {...(!current && !item.disabled && item.href ? { href: item.href } : {})}
            {...(item.disabled !== undefined ? { isDisabled: item.disabled } : {})}
          >
            {current ? item.label : (item.content ?? item.label)}
          </Breadcrumbs.Item>
        );
      })}
    </Breadcrumbs>
  );
}

export type TextLinkProps = Readonly<{
  children: ReactNode;
  href: string;
  external?: boolean;
  tone?: 'brand' | 'neutral';
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  onNavigate?: () => void;
}>;

const textLinkStyles = tv({
  base: 'inline-flex items-center gap-1.5 rounded-control font-semibold underline-offset-4 outline-none hover:underline',
  defaultVariants: { tone: 'brand' },
  variants: {
    tone: {
      brand: 'text-brand hover:text-brand-strong',
      neutral: 'text-ink-muted hover:text-ink',
    },
  },
});

export function TextLink({
  children,
  href,
  external = false,
  tone = 'brand',
  leadingIcon,
  trailingIcon,
  onNavigate,
}: TextLinkProps) {
  return (
    <HeroLink
      className={textLinkStyles({ tone })}
      href={href}
      {...(onNavigate
        ? {
            onClick: (event: MouseEvent<Element>) => {
              if (
                event.button !== 0 ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onNavigate();
            },
          }
        : {})}
      {...(external ? { rel: 'noreferrer', target: '_blank' } : {})}
    >
      {leadingIcon ? (
        <span aria-hidden="true" className="grid size-icon-sm place-items-center">
          {leadingIcon}
        </span>
      ) : null}
      <span>{children}</span>
      {trailingIcon ? (
        <span aria-hidden="true" className="grid size-icon-sm place-items-center">
          {trailingIcon}
        </span>
      ) : null}
    </HeroLink>
  );
}

type PageToken = number | 'ellipsis';

function pageTokens(page: number, totalPages: number): readonly PageToken[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = [...new Set([1, totalPages, page - 1, page, page + 1])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((left, right) => left - right);
  const tokens: PageToken[] = [];
  for (const value of pages) {
    const previous = tokens.at(-1);
    if (typeof previous === 'number' && value - previous > 1) tokens.push('ellipsis');
    tokens.push(value);
  }
  return tokens;
}

export type PaginationControlProps = Readonly<{
  label: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  getPageLabel: (page: number) => string;
  disabled?: boolean;
}>;

const paginationButtonClass =
  'grid size-control-sm min-w-control-sm place-items-center rounded-control border border-transparent text-sm font-semibold text-ink-muted outline-none hover:border-border hover:bg-surface data-[active]:border-brand data-[active]:bg-brand-soft data-[active]:text-brand';

export function PaginationControl({
  label,
  page,
  totalPages,
  onPageChange,
  previousLabel,
  nextLabel,
  getPageLabel,
  disabled = false,
}: PaginationControlProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);

  return (
    <Pagination aria-label={label} className="max-w-full overflow-x-auto">
      <Pagination.Content className="flex min-w-max items-center gap-1">
        <Pagination.Item>
          <Pagination.Previous
            aria-label={previousLabel}
            className={paginationButtonClass}
            isDisabled={disabled || safePage === 1}
            onPress={() => onPageChange(safePage - 1)}
          >
            <span aria-hidden="true">‹</span>
          </Pagination.Previous>
        </Pagination.Item>
        {pageTokens(safePage, safeTotalPages).map((token, index) =>
          token === 'ellipsis' ? (
            <Pagination.Item key={`ellipsis-${index}`}>
              <Pagination.Ellipsis className="grid size-control-sm place-items-center text-ink-muted" />
            </Pagination.Item>
          ) : (
            <Pagination.Item key={token}>
              <Pagination.Link
                aria-label={getPageLabel(token)}
                className={paginationButtonClass}
                isActive={token === safePage}
                isDisabled={disabled}
                onPress={() => onPageChange(token)}
              >
                {token}
              </Pagination.Link>
            </Pagination.Item>
          ),
        )}
        <Pagination.Item>
          <Pagination.Next
            aria-label={nextLabel}
            className={paginationButtonClass}
            isDisabled={disabled || safePage === safeTotalPages}
            onPress={() => onPageChange(safePage + 1)}
          >
            <span aria-hidden="true">›</span>
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}
