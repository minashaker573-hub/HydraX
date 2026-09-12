/**
 * HYDRAX - Vercel Function entry.
 *
 * Every dynamic request (/api/*, /health, /assets/uploads/*) is routed here by
 * vercel.json. All behaviour lives in backend/src/vercel.ts, which is tested
 * with the rest of the backend. This file imports its COMPILED form from
 * backend/dist, produced during the Vercel build by scripts/vercel-build.mjs,
 * so nothing here depends on how Vercel handles TypeScript.
 */

import { bootstrap } from '../backend/dist/bootstrap.js';
import { createVercelHandler } from '../backend/dist/vercel.js';

export default createVercelHandler({ boot: () => bootstrap(process.env) });
