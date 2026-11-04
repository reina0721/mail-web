/* Library entry同时导出 runtime、Hook、Provider 与 formatter，不是应用 Fast Refresh 边界。 */
/* eslint-disable react-refresh/only-export-components */
import i18next, { type i18n as I18nextInstance } from 'i18next';
import {
  I18nextProvider,
  initReactI18next,
  useTranslation as useVendorTranslation,
} from 'react-i18next';
import type { ReactNode } from 'react';

export type TranslationResources = Readonly<
  Record<string, Readonly<{ translation: Readonly<Record<string, unknown>> }>>
>;

export type FrontendI18nRuntime = Readonly<{
  locale: () => string;
  changeLocale: (locale: string) => Promise<void>;
  translate: (key: string, values?: Readonly<Record<string, unknown>>) => string;
  addResources: (resources: TranslationResources) => void;
}>;

const runtimeInstances = new WeakMap<FrontendI18nRuntime, I18nextInstance>();

export function createFrontendI18n({
  resources,
  defaultLocale,
  supportedLocales,
}: Readonly<{
  resources: TranslationResources;
  defaultLocale: string;
  supportedLocales: readonly string[];
}>): FrontendI18nRuntime {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: defaultLocale,
    fallbackLng: defaultLocale,
    supportedLngs: [...supportedLocales],
    interpolation: { escapeValue: false },
  });

  const runtime: FrontendI18nRuntime = {
    locale: () => instance.language,
    changeLocale: async (locale) => {
      if (!supportedLocales.includes(locale)) throw new Error(`Unsupported locale: ${locale}`);
      await instance.changeLanguage(locale);
    },
    translate: (key, values) => (values ? instance.t(key, values) : instance.t(key)),
    addResources: (additional) => {
      for (const locale of Object.keys(additional)) {
        if (!supportedLocales.includes(locale)) throw new Error(`Unsupported locale: ${locale}`);
      }
      for (const [locale, resource] of Object.entries(additional)) {
        instance.addResourceBundle(locale, 'translation', resource.translation, true, true);
      }
    },
  };
  runtimeInstances.set(runtime, instance);
  return runtime;
}

export function FrontendI18nProvider({
  runtime,
  children,
}: Readonly<{ runtime: FrontendI18nRuntime; children: ReactNode }>) {
  const instance = runtimeInstances.get(runtime);
  if (!instance) throw new Error('Frontend i18n runtime is not active.');
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

export function useFrontendTranslation() {
  const { t, i18n } = useVendorTranslation();
  return { t, locale: i18n.language } as const;
}

export function formatDate(
  locale: string,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatNumber(
  locale: string,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatRelativeTime(
  locale: string,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
}

export { formatTimeOfDay, type HourCycleOption, type TimeDisplayOptions } from './format';
