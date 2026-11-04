import { Tooltip } from '@heroui/react/tooltip';
import { cloneElement, isValidElement, type ComponentPropsWithRef, type ReactNode } from 'react';

/** The child must forward standard anchor props/ref (e.g. native a or Next Link). */
export default function NavigationHintContent({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  if (!isValidElement<ComponentPropsWithRef<'a'>>(children)) return children;
  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger<'a'>
        role="link"
        className={children.props.className ?? ''}
        render={(props) => cloneElement(children, props, children.props.children)}
      />
      <Tooltip.Content className="ui-navigation-hint" placement="right" showArrow>
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}
