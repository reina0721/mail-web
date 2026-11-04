// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { requestFoundationFormLeave, useFoundationForm } from './index';

const schema = z.object({ name: z.string().min(3), enabled: z.boolean() });

describe('useFoundationForm', () => {
  it('统一 dirty、reset 与字段错误生命周期', async () => {
    const { result } = renderHook(() =>
      useFoundationForm({ schema, defaultValues: { name: 'valid', enabled: false } }),
    );

    expect(result.current.lifecycle).toBe('pristine');
    act(() => result.current.setValue('name', 'x', { validate: true }));
    await waitFor(() => expect(result.current.hasError('name')).toBe(true));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.lifecycle).toBe('invalid');

    act(() => result.current.reset());
    expect(result.current.lifecycle).toBe('pristine');
  });

  it('只在 dirty 时调用离开确认 Port', async () => {
    const { result } = renderHook(() =>
      useFoundationForm({ schema, defaultValues: { name: 'valid', enabled: false } }),
    );
    const calls: string[] = [];
    const port = {
      confirmLeave: (message: string) => {
        calls.push(message);
        return Promise.resolve(false);
      },
    };

    await expect(
      requestFoundationFormLeave({ form: result.current, port, message: 'Unsaved changes' }),
    ).resolves.toBe(true);
    act(() => result.current.setValue('enabled', true));
    await expect(
      requestFoundationFormLeave({ form: result.current, port, message: 'Unsaved changes' }),
    ).resolves.toBe(false);
    expect(calls).toEqual(['Unsaved changes']);
  });
});
