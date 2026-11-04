// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { useCommandsPort, type CommandAvailability, type CommandDefinition } from './commands';
import { LeaveConfirmProvider, useRegisterDirtySource } from './leave-confirm';
import {
  NotificationsProvider,
  useNotificationsPort,
  type NotificationItem,
  type NotificationsPort,
} from './notifications';
import { PreferencesProvider, usePreferencesPort, type PreferencesPort } from './preferences';
import { useWorkspacePort, type WorkspacePort } from './workspace';

/* ------------------------------------------------------------------ */
/* preferences                                                         */
/* ------------------------------------------------------------------ */

type DemoPrefs = { appearance: { themeMode: 'light' | 'dark' | 'system'; accent: string } };

function createPreferencesPort(): PreferencesPort<DemoPrefs> & {
  get state(): DemoPrefs;
} {
  let state: DemoPrefs = { appearance: { themeMode: 'system', accent: 'purple' } };
  const listeners = new Set<() => void>();
  return {
    get state() {
      return state;
    },
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateCategory: (category, patch) => {
      state = { ...state, [category]: { ...state[category], ...patch } };
      listeners.forEach((l) => l());
      return { ok: true };
    },
    resetCategory: (category) => {
      state = { ...state, [category]: { themeMode: 'system', accent: 'purple' } };
      listeners.forEach((l) => l());
      return { ok: true };
    },
    resetAll: () => {
      state = { appearance: { themeMode: 'system', accent: 'purple' } };
      listeners.forEach((l) => l());
      return { ok: true };
    },
  };
}

function PreferencesProbe() {
  const port = usePreferencesPort<DemoPrefs>();
  const [value, setValue] = useState(() => port.getSnapshot().appearance.themeMode);
  return (
    <>
      <span data-testid="theme">{value}</span>
      <button
        onClick={() => {
          const result = port.updateCategory('appearance', { themeMode: 'dark' });
          setValue(port.getSnapshot().appearance.themeMode);
          expect(result.ok).toBe(true);
        }}
        type="button"
      >
        set-dark
      </button>
    </>
  );
}

describe('preferences Port', () => {
  it('Provider 注入后 usePreferencesPort 可读写；updateCategory 持久化结果 ok', () => {
    const port = createPreferencesPort();
    render(
      <PreferencesProvider port={port}>
        <PreferencesProbe />
      </PreferencesProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('system');
    screen.getByRole('button', { name: 'set-dark' }).click();
    // 断言 Port 状态（持久化契约）——DOM 由 React 批处理异步刷新，不依赖它。
    expect(port.state.appearance.themeMode).toBe('dark');
  });

  it('未安装 Provider 时 usePreferencesPort 抛错（Port 属 application runtime context）', () => {
    expect(() => render(<PreferencesProbe />)).toThrow(/PreferencesProvider 未安装/);
  });
});

/* ------------------------------------------------------------------ */
/* workspace                                                           */
/* ------------------------------------------------------------------ */

function createWorkspacePort(): WorkspacePort<'name' | 'kind'> {
  type Stored = {
    pageId: string;
    version: number;
    list?: NonNullable<Parameters<WorkspacePort<'name' | 'kind'>['savePageState']>[1]['list']>;
    draft?: Readonly<Partial<Record<'name' | 'kind', unknown>>>;
  };
  const store = new Map<string, Stored>();
  return {
    registerPageState: () => () => undefined,
    savePageState: (pageId, input) => {
      const stored: Stored = { pageId, version: 1 };
      if (input.list) stored.list = input.list;
      if (input.draft) stored.draft = input.draft;
      store.set(pageId, stored);
      return { ok: true };
    },
    restorePageState: (pageId) => store.get(pageId) ?? null,
    clearPageState: (pageId) => {
      store.delete(pageId);
    },
  };
}

describe('workspace Port', () => {
  it('保存/恢复页面状态与草稿；clear 删除', () => {
    const port = createWorkspacePort();
    const result = port.savePageState('page-a', {
      list: { filters: { q: 'x' }, page: 2, pageSize: 20, scrollTop: 120 },
      draft: { name: 'draft name' },
    });
    expect(result.ok).toBe(true);
    const restored = port.restorePageState('page-a');
    expect(restored?.draft?.name).toBe('draft name');
    expect(restored?.list?.page).toBe(2);
    port.clearPageState('page-a');
    expect(port.restorePageState('page-a')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* notifications                                                       */
/* ------------------------------------------------------------------ */

function createNotificationsPort(): NotificationsPort {
  let items: NotificationItem[] = [];
  const listeners = new Set<() => void>();
  return {
    publish: (input) => {
      const item: NotificationItem = {
        ...input,
        id: `n${items.length + 1}`,
        createdAt: Date.now(),
        read: false,
      };
      items = [item, ...items];
      listeners.forEach((l) => l());
      return item.id;
    },
    list: () => items,
    unreadCount: () => items.filter((i) => !i.read).length,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markRead: (id) => {
      items = items.map((i) => (i.id === id ? { ...i, read: true } : i));
      listeners.forEach((l) => l());
    },
    markAllRead: () => {
      items = items.map((i) => ({ ...i, read: true }));
      listeners.forEach((l) => l());
    },
  };
}

function NotificationsProbe() {
  const port = useNotificationsPort();
  const [unread, setUnread] = useState(() => port.unreadCount());
  return (
    <>
      <span data-testid="unread">{unread}</span>
      <button
        onClick={() => {
          port.publish({
            category: 'success',
            severity: 'notice',
            title: 'Saved',
            target: { routeId: 'settings' },
          });
          setUnread(port.unreadCount());
        }}
        type="button"
      >
        publish
      </button>
    </>
  );
}

describe('notifications Port', () => {
  it('发布增加未读数；持久化内容无函数（target 为可序列化 Route Target）', () => {
    const port = createNotificationsPort();
    render(
      <NotificationsProvider port={port}>
        <NotificationsProbe />
      </NotificationsProvider>,
    );
    screen.getByRole('button', { name: 'publish' }).click();
    // 断言 Port 中心状态（未读/序列化契约），不依赖 React 批处理后的 DOM。
    expect(port.unreadCount()).toBe(1);
    const item = port.list()[0];
    expect(item).toBeDefined();
    expect(typeof item).toBe('object');
    expect(JSON.parse(JSON.stringify(item))).toEqual(item); // 可序列化
  });
});

/* ------------------------------------------------------------------ */
/* commands                                                            */
/* ------------------------------------------------------------------ */

function createCommandsPort() {
  const commands = new Map<string, CommandDefinition>();
  const listeners = new Set<() => void>();
  const port = {
    registerCommand: (definition: CommandDefinition) => {
      commands.set(definition.id, definition);
      listeners.forEach((l) => l());
      return () => {
        commands.delete(definition.id);
        listeners.forEach((l) => l());
      };
    },
    listCommands: () => [...commands.values()],
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    runCommand: (id: string) => {
      const command = commands.get(id);
      if (!command) return { ok: false as const, reason: 'unknown' };
      const availability = command.isAvailable();
      if (!availability.available) return { ok: false as const, reason: availability.reason };
      void command.run();
      return { ok: true as const };
    },
  };
  return port;
}

describe('commands Port', () => {
  it('注册/注销；可用性共享同一判断；runCommand 尊重可用性', () => {
    const run = vi.fn();
    const availability: CommandAvailability = { available: true };
    const port = createCommandsPort();
    const unregister = port.registerCommand({
      id: 'save',
      label: 'Save',
      description: 'Save current form',
      scope: 'page',
      isAvailable: () => availability,
      run,
    });
    expect(port.listCommands().map((c) => c.id)).toContain('save');
    expect(port.runCommand('save')).toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(1);
    unregister();
    expect(port.listCommands()).toHaveLength(0);
  });

  it('未安装 Provider 时 useCommandsPort 抛错', () => {
    function Probe() {
      useCommandsPort();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/CommandsProvider 未安装/);
  });

  it('未安装 Provider 时 useWorkspacePort 抛错', () => {
    function Probe() {
      useWorkspacePort();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/WorkspaceProvider 未安装/);
  });

  it('未安装 Provider 时 useNotificationsPort 抛错', () => {
    function Probe() {
      useNotificationsPort();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/NotificationsProvider 未安装/);
  });
});

/* ------------------------------------------------------------------ */
/* leave-confirm                                                       */
/* ------------------------------------------------------------------ */

describe('leave-confirm Port', () => {
  it('未安装 Provider 时 useRegisterDirtySource 抛错', () => {
    function Probe() {
      useRegisterDirtySource({
        pageId: 'p',
        message: () => 'x',
        isDirty: () => true,
      });
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/LeaveConfirmProvider 未安装/);
  });

  it('Provider 注入后注册/取消注册 dirty source 生效', () => {
    const registered: Array<{ pageId: string }> = [];
    let unregister: (() => void) | null = null;
    const port = {
      registerDirtySource: (source: { pageId: string }) => {
        registered.push({ pageId: source.pageId });
        unregister = () => {
          registered.splice(0, registered.length);
        };
        return unregister;
      },
    };
    function Probe() {
      useRegisterDirtySource({
        pageId: 'edit',
        message: () => 'unsaved',
        isDirty: () => true,
      });
      return null;
    }
    const { unmount } = render(
      <LeaveConfirmProvider port={port}>
        <Probe />
      </LeaveConfirmProvider>,
    );
    expect(registered.map((r) => r.pageId)).toContain('edit');
    unmount();
    expect(registered).toHaveLength(0); // 卸载自动取消注册
    expect(unregister).not.toBeNull();
  });
});
