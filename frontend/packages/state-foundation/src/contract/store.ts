/**
 * Store Ownership Contract —— 状态分层契约。
 *
 * 只提供「静态 metadata + 类型约束 + diagnostics」：
 * - 声明一个 store 属于哪个 scope（host / plugin-private / feature-local）；
 * - 声明是否持久化、namespace。
 *
 * 它**不是 Registry**：不收集 store、不要求中央登记、不影响运行。
 * Filesystem ownership（如 surfaces/plugins/<plugin>/stores/*）才是真实 ownership；
 * 本契约只让 metadata 可被文档 / testing / diagnostics 复用。
 */

/** Store 的归属范围。scope 只用于 metadata / namespace / diagnostics，不建立中央枚举体系。 */
export type StoreScope = 'host' | 'plugin-private' | 'feature-local';

/** 该 store 是否持久化（显式 opt-in；见 persist policy）。 */
export type StorePersistence = 'none' | 'durable' | 'session';

export type StoreContract = Readonly<{
  /** store 语义名（用于 namespace / 文档；不要求全局唯一枚举）。 */
  name: string;
  /** 归属范围。 */
  scope: StoreScope;
  /** 持久化策略（默认 none = 不持久化）。 */
  persistence?: StorePersistence;
  /** 可选：owner 描述（如 "system-tools plugin"），只用于文档/diagnostics。 */
  owner?: string;
}>;

/**
 * 声明一个 store 的静态契约。
 *
 * 仅用于 metadata / 文档 / testing 辅助，运行时无任何注册副作用。
 * 例：
 *   export const shellStoreContract = defineStoreContract({
 *     name: 'shell', scope: 'host', persistence: 'durable', owner: 'apps/web shell',
 *   });
 */
export function defineStoreContract(contract: StoreContract): StoreContract {
  if (!contract.name || contract.name.trim() === '') {
    throw new Error('Store contract: name 不能为空');
  }
  if (!['host', 'plugin-private', 'feature-local'].includes(contract.scope)) {
    throw new Error(`Store contract: 非法 scope ${String(contract.scope)}`);
  }
  if (
    contract.persistence !== undefined &&
    !['none', 'durable', 'session'].includes(contract.persistence)
  ) {
    throw new Error(`Store contract: 非法 persistence ${String(contract.persistence)}`);
  }
  return Object.freeze({ persistence: 'none', ...contract });
}
