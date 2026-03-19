import test from 'node:test';
import assert from 'node:assert/strict';
import { __private__ } from './archiveService.js';

test('ensureArchiveTable adds missing source columns to archive tables', async () => {
  const calls = [];
  const columnsByTable = {
    inventory_batches: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'is_offline', data_type: 'boolean', udt_name: 'bool', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: null },
      { column_name: 'created_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    inventory_batches_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'created_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
  };

  const tx = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('FROM information_schema.columns')) {
        return { rows: columnsByTable[params[0]] || [] };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  await __private__.ensureArchiveTable(tx, 'inventory_batches', 'inventory_batches_archive');

  assert.ok(calls.some((call) => call.text.includes('CREATE TABLE IF NOT EXISTS "inventory_batches_archive"')));
  assert.ok(calls.some((call) => call.text.includes('ADD COLUMN IF NOT EXISTS "is_offline" boolean')));
});

test('getSharedColumns returns the source column order after archive expansion', async () => {
  const columnsByTable = {
    sales: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'receipt_number', data_type: 'character varying', udt_name: 'varchar', character_maximum_length: 50, numeric_precision: null, numeric_scale: null, datetime_precision: null },
    ],
    sales_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
    ],
  };

  const tx = {
    async query(text, params = []) {
      if (text.includes('FROM information_schema.columns')) {
        const rows = columnsByTable[params[0]] || [];
        if (text.includes("table_name = $1") && params[0] === 'sales_archive' && rows.length === 2) {
          columnsByTable.sales_archive = [...rows, columnsByTable.sales[2]];
        }
        return { rows };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const sharedColumns = await __private__.getSharedColumns(tx, 'sales', 'sales_archive');

  assert.deepEqual(sharedColumns, ['id', 'location_id', 'receipt_number']);
});
