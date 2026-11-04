import { Dropdown } from '@heroui/react/dropdown';
import { Label } from '@heroui/react/label';
import { Header } from '@heroui/react/header';
import { Separator } from '@heroui/react/separator';
import type { ReactNode } from 'react';

export type MenuAction = Readonly<{
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}>;

export type MenuChoice = Readonly<{
  id: string;
  label: string;
  icon?: ReactNode;
  value: string;
  selectedId: string;
  options: readonly MenuAction[];
}>;

export type MenuGroup = Readonly<{
  id: string;
  label: string;
  items: readonly (MenuAction | MenuChoice)[];
}>;

export type MenuButtonProps = Readonly<
  {
    label: ReactNode;
    ariaLabel: string;
    header?: ReactNode;
    submenuLayout?: 'adjacent' | 'stacked';
    defaultOpen?: boolean;
    onAction: (id: string) => void;
  } & (
    | { items: readonly MenuAction[]; groups?: never }
    | { items?: never; groups: readonly MenuGroup[] }
  )
>;

export function MenuButton({
  label,
  ariaLabel,
  items,
  groups,
  header,
  submenuLayout = 'adjacent',
  defaultOpen = false,
  onAction,
}: MenuButtonProps) {
  const renderAction = (item: MenuAction, selectable = false) => (
    <Dropdown.Item
      className={`ui-option ${item.tone === 'danger' ? 'text-danger data-[focused]:bg-danger-soft' : 'text-ink'}`}
      id={item.id}
      key={item.id}
      textValue={item.label}
    >
      {item.icon ? (
        <span aria-hidden="true" className="flex shrink-0 items-center text-ink-muted">
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <Label className="block whitespace-normal break-words font-medium">{item.label}</Label>
        {item.description ? (
          <span className="mt-0.5 block text-xs text-ink-muted">{item.description}</span>
        ) : null}
      </span>
      {selectable ? <Dropdown.ItemIndicator /> : null}
    </Dropdown.Item>
  );
  const renderItem = (item: MenuAction | MenuChoice) =>
    'options' in item ? (
      <Dropdown.SubmenuTrigger key={item.id}>
        <Dropdown.Item id={item.id} textValue={item.label} className="ui-option text-ink">
          {item.icon ? (
            <span aria-hidden="true" className="flex shrink-0 items-center text-ink-muted">
              {item.icon}
            </span>
          ) : null}
          <Label className="min-w-0 flex-1 font-medium">{item.label}</Label>
          <span className="text-xs text-ink-muted">{item.value}</span>
          <Dropdown.SubmenuIndicator />
        </Dropdown.Item>
        <Dropdown.Popover
          className="ui-overlay-surface ui-menu-surface ui-overlay-motion flex min-w-44 flex-col p-1.5"
          placement={submenuLayout === 'stacked' ? 'bottom end' : 'end top'}
        >
          <Dropdown.Menu
            className="min-h-0 max-h-overlay overflow-auto outline-none"
            aria-label={item.label}
            selectionMode="single"
            selectedKeys={[item.selectedId]}
            disabledKeys={item.options
              .filter((option) => option.disabled)
              .map((option) => option.id)}
            onAction={(key) => onAction(String(key))}
          >
            {item.options.map((option) => renderAction(option, true))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.SubmenuTrigger>
    ) : (
      renderAction(item)
    );
  return (
    <Dropdown defaultOpen={defaultOpen}>
      <Dropdown.Trigger aria-label={ariaLabel} className="ui-overlay-trigger">
        {label}
      </Dropdown.Trigger>
      <Dropdown.Popover
        className="ui-overlay-surface ui-menu-surface ui-overlay-motion flex min-w-60 flex-col p-1.5"
        placement="bottom end"
      >
        <div
          role="region"
          aria-label={ariaLabel}
          // W3C ACT 0ssw9k: this named overflow region must be reachable for native keyboard scrolling.
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- scroll-region focus is intentional; Axe and keyboard End are covered
          tabIndex={0}
          className="flex min-h-0 flex-col overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Dropdown.Menu
            className="min-h-0 overflow-visible outline-none"
            aria-label={ariaLabel}
            disabledKeys={(groups ? groups.flatMap((group) => group.items) : (items ?? []))
              .filter((item) => 'disabled' in item && item.disabled)
              .map((item) => item.id)}
            onAction={(key) => onAction(String(key))}
          >
            {groups
              ? groups.map((group, index) => (
                  <Dropdown.Section key={group.id} id={group.id}>
                    {index ? <Separator className="my-1 border-border" /> : null}
                    <Header className="px-3 pb-1 pt-2 text-xs font-semibold text-ink-muted">
                      {index === 0 && header ? (
                        <div className="mb-3 border-b border-border pb-3">{header}</div>
                      ) : null}
                      <span>{group.label}</span>
                    </Header>
                    {group.items.map(renderItem)}
                  </Dropdown.Section>
                ))
              : (items ?? []).map((item) => renderAction(item))}
          </Dropdown.Menu>
        </div>
      </Dropdown.Popover>
    </Dropdown>
  );
}
