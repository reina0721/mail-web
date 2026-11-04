import { describe, expect, it } from 'vitest';

import { createFrontendI18n, formatDate, formatNumber, formatRelativeTime } from './index';

describe('Frontend i18n foundation', () => {
  it('切换受支持语言并隔离业务资源', async () => {
    const runtime = createFrontendI18n({
      defaultLocale: 'zh-CN',
      supportedLocales: ['zh-CN', 'en'],
      resources: {
        'zh-CN': { translation: { greeting: '你好' } },
        en: { translation: { greeting: 'Hello' } },
      },
    });

    expect(runtime.translate('greeting')).toBe('你好');
    await runtime.changeLocale('en');
    expect(runtime.locale()).toBe('en');
    expect(runtime.translate('greeting')).toBe('Hello');
    await expect(runtime.changeLocale('fr')).rejects.toThrow('Unsupported locale');
  });

  it('集中日期、数字与相对时间格式化', () => {
    expect(formatNumber('en', 1200)).toContain('1,200');
    expect(formatDate('en', '2026-08-31T00:00:00.000Z', { timeZone: 'UTC' })).toBeTruthy();
    expect(formatRelativeTime('en', -1, 'day')).toBe('yesterday');
  });

  it('按需注册资源共用同一语言运行时并保留原资源，非法语言在写入前拒绝', async () => {
    const runtime = createFrontendI18n({
      defaultLocale: 'zh-CN',
      supportedLocales: ['zh-CN', 'en'],
      resources: {
        'zh-CN': { translation: { common: { retained: '保留' } } },
        en: { translation: { common: { retained: 'Retained' } } },
      },
    });
    runtime.addResources({
      'zh-CN': { translation: { auth: { title: '登录' } } },
      en: { translation: { auth: { title: 'Sign in' } } },
    });
    expect(runtime.translate('common.retained')).toBe('保留');
    expect(runtime.translate('auth.title')).toBe('登录');
    await runtime.changeLocale('en');
    expect(runtime.translate('auth.title')).toBe('Sign in');
    expect(runtime.translate('common.retained')).toBe('Retained');
    expect(() =>
      runtime.addResources({
        en: { translation: { rejected: 'Must not be written' } },
        fr: { translation: {} },
      }),
    ).toThrow('Unsupported locale');
    expect(runtime.translate('rejected')).toBe('rejected');
  });
});
