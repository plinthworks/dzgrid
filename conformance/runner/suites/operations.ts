import { makeQuery, resolveOperations, splitQuery } from '@dzgrid/core';
import type { Suite } from './index.js';

export const operations: Record<string, Suite> = {
  operations: ({ input, hasSource }) => {
    const r = resolveOperations(input ?? undefined, hasSource);
    return { ops: r.ops, problems: r.problems.map((p) => ({ code: p.code, severity: p.severity, path: p.path })) };
  },
  'split-query': ({ query, ops }) => {
    const { server, client } = splitQuery(makeQuery(query), ops);
    const { key: _k, ...serverParts } = server;
    return { server: serverParts, client: { sort: client.sort, filter: client.filter, quick: client.quick } };
  },
};
