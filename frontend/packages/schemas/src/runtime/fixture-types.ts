/**
 * Runtime 测试夹具类型（仅测试使用）。
 *
 * 测试需要“破坏”真实 Schema fixture 的深层结构以验证失败路径；本文件提供
 * 结构化可变视图，避免在测试里使用 any / unsafe member access。
 * 类型只覆盖测试实际访问/修改的字段。
 */

/** 可变 token source（测试只改 light.brand / dark 删除 / durationBase.fast）。 */
export type MutableTokenSource = {
  colors: {
    roleOrder: string[];
    light: Record<string, string>;
    /** 测试会删除 dark 以验证 required 校验，故标记可选。 */
    dark?: Record<string, string>;
  };
  theme: {
    radii: Record<string, string>;
    fontSans: string;
  };
  rootMotion: {
    durationBase: Record<string, string>;
  };
};

/** 可变 x-community-go 元数据。 */
export type MutableMeta = {
  protocolVersion: number;
  authorityId: string;
  /** registry-owned 字段不得重新声明：测试会尝试添加，故标记可选。 */
  maturity?: string;
  owner?: string;
  contractRef: { file: string; pointer: string };
  source: {
    tokens: MutableTokenSource;
    motionLanguage?: Record<string, unknown>;
  };
  facts: Array<Record<string, unknown>>;
  authoring: { patchableSourcePointers: string[] };
  artifacts: Array<{
    target: string;
    generator: string;
    options: {
      regions?: Array<{
        regionId: string;
        bindings: Array<Record<string, unknown>>;
      }>;
    };
  }>;
};

/** 可变 Schema 文档（根还可带 unknown keyword / 其它 $schema 供 strict 测试）。 */
export type MutableSchemaDocument = {
  $schema: string;
  $defs: Record<string, unknown>;
  someUnknownKeyword?: boolean;
  'x-community-go': MutableMeta;
};

/** 把解析出的 JSON 文档转成可变视图（unknown 单跳断言；仅测试用）。 */
export function asMutableDocument(value: Record<string, unknown>): MutableSchemaDocument {
  return value as unknown as MutableSchemaDocument;
}
