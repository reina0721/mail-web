import { describe, expect, it } from 'vitest';

import {
  buildRoutePattern,
  collectParamNames,
  dynamicParamName,
  isDynamicSegment,
} from './contract';
import { resolveRouteTarget, createRegistry, hasDynamicSegments } from './registry';
import { analyzeHostCapability, HOST_MODE_CANNOT_DEPLOY } from './host';
import { encodeSegment, resolveTargetHref, route } from './target';
import type { RouteCatalog, FileRouteDescriptor } from './contract';

const plugin = { pluginId: 'reference-resources', mount: '/reference-resources' } as const;

const listRoute: FileRouteDescriptor = {
  routeId: 'reference-resources.list',
  pluginId: 'reference-resources',
  path: '',
  segments: [],
  pattern: '/reference-resources',
  paramNames: [],
};

const createRoute: FileRouteDescriptor = {
  routeId: 'reference-resources.create',
  pluginId: 'reference-resources',
  path: 'create',
  segments: ['create'],
  pattern: '/reference-resources/create',
  paramNames: [],
};

const detailRoute: FileRouteDescriptor = {
  routeId: 'reference-resources.detail',
  pluginId: 'reference-resources',
  path: '[id]',
  segments: ['[id]'],
  pattern: '/reference-resources/[id]',
  paramNames: ['id'],
};

const editRoute: FileRouteDescriptor = {
  routeId: 'reference-resources.edit',
  pluginId: 'reference-resources',
  path: '[id]/edit',
  segments: ['[id]', 'edit'],
  pattern: '/reference-resources/[id]/edit',
  paramNames: ['id'],
};

const aliases = [
  { groupId: 'reference', labelKey: 'shellNavigationGroups.reference', order: 0 },
] as const;

/** reference-resources：Group `reference` 下单一可导航 Parent（无 children）。 */
const referenceContribution = {
  pluginId: 'reference-resources',
  contribution: {
    parents: [
      {
        navigationId: 'reference-resources.root',
        labelKey: 'referenceResources.nav.root',
        groupId: 'reference',
        iconId: 'resource',
        routeId: 'reference-resources.list',
      },
    ],
  },
} as const;

const catalog: RouteCatalog = {
  plugins: [plugin],
  routes: [listRoute, createRoute, detailRoute, editRoute],
  aliases,
  contributions: [referenceContribution],
};

describe('Plugin Framework contract', () => {
  it('识别动态段并提取参数名', () => {
    expect(isDynamicSegment('[id]')).toBe(true);
    expect(isDynamicSegment('create')).toBe(false);
    expect(dynamicParamName('[id]')).toBe('id');
    expect(dynamicParamName('create')).toBeNull();
  });

  it('构造 pattern 并收集参数名', () => {
    expect(buildRoutePattern('/reference-resources', [])).toBe('/reference-resources');
    expect(buildRoutePattern('/reference-resources', ['[id]', 'edit'])).toBe(
      '/reference-resources/[id]/edit',
    );
    expect(collectParamNames('/reference-resources/[id]/edit')).toEqual(['id']);
  });
});

describe('Plugin Framework route target', () => {
  it('route() 只创建 symbolic target，不触发导航', () => {
    expect(route('reference-resources.detail', { id: 'abc' })).toEqual({
      routeId: 'reference-resources.detail',
      params: { id: 'abc' },
    });
  });

  it('逐段编码并替换动态参数', () => {
    expect(encodeSegment('a b/c')).toBe('a%20b%2Fc');
    expect(resolveTargetHref('/reference-resources/[id]', { id: 'a b' })).toBe(
      '/reference-resources/a%20b',
    );
  });
});

describe('Plugin Framework registry — Sidebar navigation (Group → Parent → Child)', () => {
  it('resolved navigation：Group(reference) → Parent(root) → 可导航（routeId 静态解析 href）', () => {
    const registry = createRegistry(catalog);
    expect(registry.navigation).toHaveLength(1);
    const group = registry.navigation[0];
    expect(group?.groupId).toBe('reference');
    expect(group?.labelKey).toBe('shellNavigationGroups.reference');
    expect(group?.parents).toHaveLength(1);
    const parent = group?.parents[0];
    expect(parent?.navigationId).toBe('reference-resources.root');
    expect(parent?.iconId).toBe('resource');
    expect(parent?.href).toBe('/reference-resources');
    expect(parent?.children).toEqual([]);
  });

  it('routes 是 routeId → descriptor 的纯索引（不含 route.meta 派生字段）', () => {
    const registry = createRegistry(catalog);
    const keys = Object.keys(registry.routes).sort();
    expect(keys).toEqual(
      [
        'reference-resources.list',
        'reference-resources.create',
        'reference-resources.detail',
        'reference-resources.edit',
      ].sort(),
    );
    expect(registry.routes['reference-resources.list']).toEqual(listRoute);
    expect(registry.routes['reference-resources.detail']?.paramNames).toEqual(['id']);
  });

  it('Parent 无 routeId → 纯 Disclosure（无 href）；无 routeId 且无 children → orphan-node 诊断', () => {
    const disclosureCatalog: RouteCatalog = {
      plugins: [plugin],
      routes: [listRoute],
      aliases,
      contributions: [
        {
          pluginId: 'reference-resources',
          contribution: {
            parents: [
              {
                navigationId: 'reference-resources.group',
                labelKey: 'nav.group',
                groupId: 'reference',
                children: [
                  {
                    navigationId: 'reference-resources.group.list',
                    labelKey: 'nav.list',
                    routeId: 'reference-resources.list',
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    const registry = createRegistry(disclosureCatalog);
    const parent = registry.navigation[0]?.parents[0];
    expect(parent?.href).toBeUndefined(); // 纯 Disclosure
    expect(parent?.children.map((child) => child.href)).toEqual(['/reference-resources']);

    const orphanNodeCatalog: RouteCatalog = {
      plugins: [plugin],
      routes: [listRoute],
      aliases,
      contributions: [
        {
          pluginId: 'reference-resources',
          contribution: {
            parents: [
              {
                navigationId: 'reference-resources.bad',
                labelKey: 'nav.bad',
                groupId: 'reference',
                // 无 routeId 且无 children
              },
            ],
          },
        },
      ],
    };
    const orphanNodeRegistry = createRegistry(orphanNodeCatalog);
    expect(orphanNodeRegistry.diagnostics.map((d) => d.code)).toContain('NAVIGATION_NODE_ORPHAN');
  });

  it('Sidebar Node 引用不存在 routeId / 动态 route → deterministic diagnostics', () => {
    const unknownTarget: RouteCatalog = {
      plugins: [plugin],
      routes: [listRoute],
      aliases,
      contributions: [
        {
          pluginId: 'reference-resources',
          contribution: {
            parents: [
              {
                navigationId: 'reference-resources.root',
                labelKey: 'nav',
                groupId: 'reference',
                routeId: 'reference-resources.nope',
              },
            ],
          },
        },
      ],
    };
    expect(createRegistry(unknownTarget).diagnostics.map((d) => d.code)).toContain(
      'UNKNOWN_NAVIGATION_ROUTE_TARGET',
    );

    const dynamicTarget: RouteCatalog = {
      plugins: [plugin],
      routes: [listRoute, detailRoute],
      aliases,
      contributions: [
        {
          pluginId: 'reference-resources',
          contribution: {
            parents: [
              {
                navigationId: 'reference-resources.root',
                labelKey: 'nav',
                groupId: 'reference',
                children: [
                  {
                    navigationId: 'reference-resources.detail',
                    labelKey: 'detail',
                    routeId: 'reference-resources.detail', // 动态 [id] route
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    expect(createRegistry(dynamicTarget).diagnostics.map((d) => d.code)).toContain(
      'NAVIGATION_DYNAMIC_TARGET_UNSUPPORTED',
    );
  });

  it('navigationId 越出 plugin namespace → deterministic diagnostics', () => {
    const badNamespace: RouteCatalog = {
      plugins: [plugin],
      routes: [listRoute],
      aliases,
      contributions: [
        {
          pluginId: 'reference-resources',
          contribution: {
            parents: [
              {
                navigationId: 'other-plugin.root',
                labelKey: 'nav',
                groupId: 'reference',
                routeId: 'reference-resources.list',
              },
            ],
          },
        },
      ],
    };
    expect(createRegistry(badNamespace).diagnostics.map((d) => d.code)).toContain(
      'NAVIGATION_NAMESPACE_VIOLATION',
    );
  });

  it('引用不存在的 Group Alias → UNKNOWN_NAVIGATION_GROUP', () => {
    const badAlias: RouteCatalog = {
      plugins: [plugin],
      routes: [listRoute],
      aliases,
      contributions: [
        {
          pluginId: 'reference-resources',
          contribution: {
            parents: [
              {
                navigationId: 'reference-resources.root',
                labelKey: 'nav',
                groupId: 'nope.missing',
                routeId: 'reference-resources.list',
              },
            ],
          },
        },
      ],
    };
    expect(createRegistry(badAlias).diagnostics.map((d) => d.code)).toContain(
      'UNKNOWN_NAVIGATION_GROUP',
    );
  });

  it('resolveRouteTarget 校验缺失/多余参数并编码', () => {
    const registry = createRegistry(catalog);
    const ok = resolveRouteTarget(registry, route('reference-resources.detail', { id: 'a b' }));
    expect(ok.diagnostics).toHaveLength(0);
    expect(ok.href).toBe('/reference-resources/a%20b');

    const missing = resolveRouteTarget(registry, route('reference-resources.detail', {}));
    expect(missing.diagnostics.map((d) => d.code)).toContain('MISSING_PARAMS');

    const extra = resolveRouteTarget(
      registry,
      route('reference-resources.detail', { id: '1', unused: 'x' }),
    );
    expect(extra.diagnostics.map((d) => d.code)).toContain('EXTRA_PARAMS');

    const unknown = resolveRouteTarget(registry, route('nope.missing', {}));
    expect(unknown.diagnostics.map((d) => d.code)).toContain('UNKNOWN_ROUTE');
  });
});

describe('Plugin Framework host capability', () => {
  it('static Mode 对动态 Plugin Route 失败（HOST_MODE_CANNOT_DEPLOY，措辞指向 Mode）', () => {
    const result = analyzeHostCapability([listRoute, detailRoute], 'static');
    expect(result.canDeploy).toBe(false);
    expect(result.unsupported.map((route) => route.routeId)).toEqual([
      'reference-resources.detail',
    ]);
    const diag = result.diagnostics.find((d) => d.code === HOST_MODE_CANNOT_DEPLOY);
    expect(diag).toBeTruthy();
    expect(diag?.message).toContain('Host Deployment Mode = static');
    expect(hasDynamicSegments('/reference-resources/[id]')).toBe(true);
    expect(hasDynamicSegments('/reference-resources')).toBe(false);
  });

  it('server Mode 放行动态 Route（运行时数据由 Next Server 处理）', () => {
    const result = analyzeHostCapability([listRoute, detailRoute], 'server');
    expect(result.canDeploy).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('缺省 mode = static：全静态 Route 集合可通过 Host capability gate', () => {
    const result = analyzeHostCapability([listRoute, createRoute]);
    expect(result.canDeploy).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });
});
