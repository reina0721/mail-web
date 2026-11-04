import { Label } from '@heroui/react/label';
import { ProgressBar as HeroProgressBar } from '@heroui/react/progress-bar';

export type ProgressMeterProps = Readonly<{
  value: number;
  label: string;
}>;

export function ProgressMeter({ value, label }: ProgressMeterProps) {
  const normalizedValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <HeroProgressBar
      className="ui-progress-meter gap-2"
      maxValue={100}
      minValue={0}
      value={normalizedValue}
    >
      <Label>{label}</Label>
      <HeroProgressBar.Output>{normalizedValue}%</HeroProgressBar.Output>
      <HeroProgressBar.Track className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <HeroProgressBar.Fill className="h-full rounded-full bg-brand transition-all duration-standard" />
      </HeroProgressBar.Track>
    </HeroProgressBar>
  );
}
