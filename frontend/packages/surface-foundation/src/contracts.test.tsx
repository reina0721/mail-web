// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BulkActionBar, Collection } from './collection';
import { EntitySummary, SettingsLayout, Timeline } from './detail-settings';
import { Page, PageHeader, Section } from './layout';
import { PageLoadingSurface, StateRegion, type ViewState } from './states-operations';

describe('Surface Foundation contracts', () => {
  it('组合页面、Collection 与批量操作区域', () => {
    render(
      <Page>
        <PageHeader description="deterministic" title="Resource list" />
        <Collection content={<p>rows</p>} filters={<p>filters</p>} title="Collection" />
        <BulkActionBar
          actions={<button type="button">archive</button>}
          clearLabel="clear"
          onClear={() => undefined}
          selectionLabel="2 selected"
        />
      </Page>,
    );
    expect(screen.getByRole('heading', { name: 'Resource list' })).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: '2 selected' })).toBeTruthy();
  });

  it('组合详情、设置与时间线语义', () => {
    render(
      <SettingsLayout navigation={<p>settings navigation</p>}>
        <EntitySummary title="Entity" />
        <Section title="History">
          <Timeline
            items={[{ id: 'event', title: 'Created', tone: 'success' }]}
            label="Entity timeline"
          />
        </Section>
      </SettingsLayout>,
    );
    expect(screen.getByRole('heading', { name: 'Entity' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Entity timeline' })).toBeTruthy();
  });

  it.each<ViewState>(['ready', 'refreshing', 'background', 'partial', 'readonly'])(
    'StateRegion 在 %s 阶段保留内容实例',
    (state) => {
      const { getByRole, getByText, queryByText, unmount } = render(
        <StateRegion
          content={<p>stable content</p>}
          denied={<p>denied</p>}
          empty={<p>empty</p>}
          error={<p>error</p>}
          label="Surface readiness"
          loading={<p>loading</p>}
          partialNotice={<p>partial</p>}
          pending={<p>pending</p>}
          readonlyNotice={<p>readonly</p>}
          refreshing={<p>refreshing</p>}
          state={state}
        />,
      );

      const region = getByRole('region', { name: 'Surface readiness' });
      expect(getByText('stable content')).toBeTruthy();
      if (state === 'refreshing') expect(region.getAttribute('aria-busy')).toBe('true');
      if (state === 'background') expect(queryByText('refreshing')).toBeNull();
      unmount();
    },
  );

  it.each(['page', 'catalog', 'collection', 'form'] as const)(
    'PageLoadingSurface 提供 %s 稳定结构',
    (kind) => {
      const { getByRole, unmount } = render(
        <PageLoadingSurface kind={kind} label={`${kind} loading`} />,
      );
      expect(
        getByRole('status', { name: `${kind} loading` }).getAttribute('data-loading-kind'),
      ).toBe(kind);
      unmount();
    },
  );
});
