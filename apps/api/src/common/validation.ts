import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', issues: result.error.issues });
  }
  return result.data;
}
