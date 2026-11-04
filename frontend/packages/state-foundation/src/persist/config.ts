/**
 * definePersistConfig —— PersistConfig 的类型约束 + 必要运行时校验。
 *
 * 返回 zustand persist 兼容的 options（类型映射到 PersistOptions）。
 * 不实现第二套 persist engine；底层仍是 zustand persist。
 */
import type { PersistOptions } from 'zustand/middleware';

import type { PersistConfig } from '../contract/persist';
import { createLocalStorage } from '../storage/local';
import { isManagedKey } from './namespace';

type PersistOptionsOf<S, P> = PersistOptions<S, P, unknown>;

/** 校验并转换为 zustand persist options。 */
export function definePersistConfig<S, P = Partial<S>>(
  config: PersistConfig<S, P>,
): PersistOptionsOf<S, P> {
  if (!config.name || config.name.trim() === '') {
    throw new Error('Persist config: name 不能为空');
  }
  if (!Number.isInteger(config.version) || config.version < 0) {
    throw new Error(`Persist config: version 必须为非负整数，收到 ${String(config.version)}`);
  }
  // 默认 namespace 管控：key 必须以受管前缀开头，防裸 key 散落。
  if (!isManagedKey(config.name)) {
    throw new Error(
      `Persist config: name 必须以受管 namespace 前缀开头（community-go.*），收到 ${config.name}`,
    );
  }
  if (config.migrate !== undefined && typeof config.migrate !== 'function') {
    throw new Error('Persist config: migrate 必须是函数');
  }
  if (config.partialize !== undefined && typeof config.partialize !== 'function') {
    throw new Error('Persist config: partialize 必须是函数');
  }

  const options: PersistOptionsOf<S, P> = {
    name: config.name,
    version: config.version,
  };
  if (config.migrate !== undefined) options.migrate = config.migrate;
  if (config.partialize !== undefined) options.partialize = config.partialize;
  if (config.merge !== undefined) options.merge = config.merge;
  if (config.skipHydration !== undefined) options.skipHydration = config.skipHydration;
  if (config.onRehydrateStorage !== undefined)
    options.onRehydrateStorage = config.onRehydrateStorage;
  if (config.storage !== undefined) {
    // storage 的 JSON 层运行时无类型；zustand persist 自行处理 partialize。
    options.storage = config.storage;
  } else {
    // SSR-safe：createLocalStorage 不在模块初始化读 window；默认 durable localStorage。
    options.storage = createLocalStorage();
  }
  return options;
}
