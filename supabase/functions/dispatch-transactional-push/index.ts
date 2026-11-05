import { createTransactionalPushHandler } from './handler.ts';

Deno.serve(createTransactionalPushHandler((name) => Deno.env.get(name)));
