import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { getSchemaIssues, type FoundationSchema } from './index';

describe('schema contract primitives', () => {
  it('保留结构化 issue 而不是压缩为错误字符串', () => {
    const schema: FoundationSchema<{ name: string }> = z.object({ name: z.string().min(2) });
    const result = schema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getSchemaIssues(result.error)).toEqual([{ path: ['name'], code: 'too_small' }]);
    }
  });
});
