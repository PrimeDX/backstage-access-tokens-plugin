import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const knexModule = require('knex');

export function createSqliteClient() {
  return knexModule({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
}
