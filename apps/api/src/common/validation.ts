import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { z } from 'zod';

export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', issues: result.error.issues });
  }
  return result.data;
}

/**
 * PLACEHOLDER AUTH. Reads the caller's user id from the x-user-id header so
 * the skeleton can be exercised end to end. Replace with OIDC session /
 * token verification before anything is deployed: as written, any caller
 * can claim to be any user.
 */
export function currentUserId(headers: Record<string, string | string[] | undefined>): number {
  const raw = headers['x-user-id'];
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw new UnauthorizedException();
  return id;
}
