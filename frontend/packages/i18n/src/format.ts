/**
 * Intl formatters（i18n Foundation 唯一 Intl 边界）。
 *
 * 日期、数字、单位和相对时间统一经本包格式化；Feature/Plugin 不直接创建
 * `Intl.*Format`。纯日期不因时区偏移（业务按 dateFormat 排版）；时刻显示按
 * 所选时区（'auto' = 本地）输出。
 */

export type HourCycleOption = 'h24' | 'h12';

export type TimeDisplayOptions = Readonly<{
  /** 'auto' = 系统时区；其余 = IANA 时区名。 */
  timeZone: string;
  hourCycle: HourCycleOption;
  /** 是否显示秒。 */
  showSeconds: boolean;
}>;

/** 时刻显示：timeZone + hourCycle + showSeconds → Intl.DateTimeFormat。 */
export function formatTimeOfDay(
  locale: string,
  prefs: TimeDisplayOptions,
  value: Date | number | string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...(prefs.showSeconds ? { second: '2-digit' as const } : {}),
    ...(prefs.hourCycle === 'h24' ? { hourCycle: 'h23' as const } : { hour12: true }),
    ...(prefs.timeZone !== 'auto' ? { timeZone: prefs.timeZone } : {}),
  };
  return new Intl.DateTimeFormat(locale, options).format(date);
}
