import { bearerAuth } from 'hono/bearer-auth';
import { HTTPException } from 'hono/http-exception';
import { timingSafeEqual } from 'hono/utils/buffer';

import type { Env } from '..';

// Two tokens (AccountKitV3/saas-ak-app#2057): every reader holds TURBO_READ_TOKEN,
// and only CI on a push to main holds TURBO_WRITE_TOKEN, so nothing else can
// change what the next run replays.
const READ_METHODS = new Set(['GET', 'HEAD']);

// An unset secret never matches, so a missing TURBO_WRITE_TOKEN refuses every write.
const matches = async (secret: string | undefined, token: string) =>
  !!secret && (await timingSafeEqual(secret, token));

export const bearerAuthFromEnv = bearerAuth<{ Bindings: Env }>({
  verifyToken: async (token, c) => {
    if (await matches(c.env.TURBO_WRITE_TOKEN, token)) return true;
    if (!(await matches(c.env.TURBO_READ_TOKEN, token))) return false;
    if (READ_METHODS.has(c.req.method)) return true;
    // A known reader asking to write: 403, rather than bearerAuth's 401 for an
    // unknown token, in the { error: { code, message } } shape turbo parses.
    throw new HTTPException(403, {
      res: Response.json(
        { error: { code: 'forbidden', message: 'This token can only read' } },
        { status: 403 },
      ),
    });
  },
});
