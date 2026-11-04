/**
 * Schema Runtime —— I/O 层。
 *
 * - 读取/解析 JSON（失败抛 SchemaIoError）；
 * - 原子写回（temp + rename，同目录保证同卷）；
 * - 文件监听（recursive=false 的精确文件 watch：防抖 + 串行去重 + 失败重订阅）；
 * - workspace Ownership 防护：schema 文件与生成目标 realpath 必须落在
 *   workspaceRoot 内；symlink 越界（realpath 在根外）一律拒绝。
 */

import { constants } from 'node:fs';
import { watch } from 'node:fs';
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

export class SchemaIoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaIoError';
  }
}

export function parseJsonFile(content: string, pathLabel: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new SchemaIoError(`JSON 解析失败 ${pathLabel}: ${String(error)}`);
  }
}

/** 把路径限定在 workspaceRoot 内（禁止 path traversal / symlink 越界）。 */
export async function assertInsideWorkspace(
  workspaceRoot: string,
  target: string,
): Promise<string> {
  const rootReal = await realpath(workspaceRoot);
  let targetReal: string;
  try {
    targetReal = await realpath(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // 目标尚不存在（原子写 temp 场景）：解析父级目录。
      const parentReal = await realpath(dirname(target));
      const base = relative(workspaceRoot, dirname(target));
      if (base.startsWith('..') || (base === '' && dirname(target) !== workspaceRoot)) {
        throw new SchemaIoError(`路径越界: ${target}`);
      }
      if (base.startsWith('..')) throw new SchemaIoError(`路径越界: ${target}`);
      return resolve(parentReal, target.split(sep).pop() ?? '');
    }
    throw error;
  }
  const rel = relative(rootReal, targetReal);
  if (rel.startsWith('..') || (rel === '' && targetReal !== rootReal)) {
    throw new SchemaIoError(`路径越界（symlink 指向 workspace 之外）: ${target}`);
  }
  return targetReal;
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, 'utf8');
  return parseJsonFile(content, filePath);
}

/** 原子写回：先写同目录临时文件再 rename。失败时不触碰原文件。 */
export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = join(
    dir,
    `.${filePath.split(sep).pop()}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
  );
  await writeFile(tempPath, content, 'utf8');
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export type WatchListener = (event: 'change' | 'rename', fileName: string) => void;

export type UnwatchFn = () => void;

/** 内部 watcher 形态（node:fs 回调风格 watch 的 close 是同步 void）。 */
interface WatcherHandle {
  on(event: 'error', handler: () => void): void;
  close(): void;
}

/**
 * 监听单个文件的稳定 watch：合并重复事件（防抖）、串行化回调、失败自动重订阅。
 * 仅在文件路径存在时监听；文件被删除/重命名后等待其重新出现。
 */
export async function watchFile(
  filePath: string,
  listener: WatchListener,
  options: { debounceMs?: number } = {},
): Promise<UnwatchFn> {
  const debounceMs = options.debounceMs ?? 100;
  let closed = false;
  let timer: NodeJS.Timeout | null = null;
  let currentWatcher: WatcherHandle | null = null;
  let pending: { event: 'change' | 'rename'; fileName: string } | null = null;
  let scheduled = false;

  const emit = (event: 'change' | 'rename', fileName: string): void => {
    if (closed) return;
    pending = { event, fileName };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (scheduled || !pending) return;
      scheduled = true;
      const item = pending;
      pending = null;
      try {
        listener(item.event, item.fileName);
      } finally {
        scheduled = false;
      }
    }, debounceMs);
  };

  const setup = async (): Promise<void> => {
    if (closed) return;
    if (!(await pathExists(filePath))) {
      // 文件尚未存在：轮询目录等待出现（500ms 节流），出现后建立 watcher。
      const poll = setInterval(() => {
        void (async () => {
          if (closed) {
            clearInterval(poll);
            return;
          }
          if (await pathExists(filePath)) {
            clearInterval(poll);
            await setup();
          }
        })();
      }, 500);
      return;
    }
    try {
      const watcher = watch(dirname(filePath), (_event, name) => {
        if (!name) return;
        if (
          relative(dirname(filePath), filePath).replace(/\\/g, '/') === name.replace(/\\/g, '/')
        ) {
          emit('change', String(name));
        }
      });
      const watcherWithEvents = watcher as unknown as {
        on(event: 'error', handler: () => void): void;
        close(): void;
      };
      currentWatcher = watcherWithEvents;
      watcherWithEvents.on('error', () => {
        // 监听失败：关闭并重订阅（失败恢复）。
        try {
          watcherWithEvents.close();
        } catch {
          // noop
        }
        currentWatcher = null;
        void setup();
      });
    } catch {
      // watch 启动失败（如目录权限）：稍后重试。
      setTimeout(() => void setup(), 500);
    }
  };

  await setup();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    if (currentWatcher) {
      try {
        currentWatcher.close();
      } catch {
        // noop
      }
      currentWatcher = null;
    }
  };
}
