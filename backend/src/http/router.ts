/**
 * HYDRAX - minimal HTTP router.
 *
 * Path patterns support `:name` segments. Deliberately small: this project
 * needs about a dozen routes, and a framework would be more moving parts than
 * the thing it routes for.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RequestContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
}

export type Handler = (ctx: RequestContext) => Promise<void> | void;

interface Route {
  readonly method: string;
  readonly segments: readonly string[];
  readonly handler: Handler;
}

function split(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method: method.toUpperCase(), segments: split(pattern), handler });
    return this;
  }

  get(pattern: string, handler: Handler): this {
    return this.add('GET', pattern, handler);
  }
  post(pattern: string, handler: Handler): this {
    return this.add('POST', pattern, handler);
  }
  patch(pattern: string, handler: Handler): this {
    return this.add('PATCH', pattern, handler);
  }

  put(pattern: string, handler: Handler): this {
    return this.add('PUT', pattern, handler);
  }

  /**
   * Finds a handler for the request. Returns `pathMatched` separately so the
   * server can answer 405 rather than 404 when the path exists but the method
   * does not.
   */
  resolve(
    method: string,
    pathname: string,
  ): { handler: Handler; params: Record<string, string> } | { pathMatched: boolean } {
    const segments = split(pathname);
    let pathMatched = false;

    for (const route of this.routes) {
      if (route.segments.length !== segments.length) continue;

      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const pattern = route.segments[i]!;
        const actual = segments[i]!;
        if (pattern.startsWith(':')) {
          params[pattern.slice(1)] = decodeURIComponent(actual);
        } else if (pattern !== actual) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;

      pathMatched = true;
      if (route.method === method.toUpperCase()) {
        return { handler: route.handler, params };
      }
    }

    return { pathMatched };
  }
}
