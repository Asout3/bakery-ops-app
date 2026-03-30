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

test('moveRowsToArchive builds explicit archive column lists instead of SELECT * copies', async () => {
  const calls = [];
  const columnsByTable = {
    inventory_batches: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'created_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    inventory_batches_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'created_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    sales: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'sale_date', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    sales_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'sale_date', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    inventory_movements: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'created_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    inventory_movements_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'created_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    activity_log: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'created_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    activity_log_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'created_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    expenses: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'expense_date', data_type: 'date', udt_name: 'date', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: null },
    ],
    expenses_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'expense_date', data_type: 'date', udt_name: 'date', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: null },
    ],
    waste_records: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'wasted_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    waste_records_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'wasted_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    customer_orders: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'pickup_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    customer_orders_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'pickup_at', data_type: 'timestamp without time zone', udt_name: 'timestamp', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: 6 },
    ],
    staff_payments: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'payment_date', data_type: 'date', udt_name: 'date', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: null },
    ],
    staff_payments_archive: [
      { column_name: 'id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'location_id', data_type: 'integer', udt_name: 'int4', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0, datetime_precision: null },
      { column_name: 'payment_date', data_type: 'date', udt_name: 'date', character_maximum_length: null, numeric_precision: null, numeric_scale: null, datetime_precision: null },
    ],
  };

  const tx = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('FROM information_schema.columns')) {
        return { rows: columnsByTable[params[0]] || [] };
      }
      if (text.includes('SELECT COUNT(*)::int AS count')) {
        return { rows: [{ count: 0 }] };
      }
      return { rows: [], rowCount: 1 };
    },
  };

  const counts = await __private__.moveRowsToArchive(tx, {
    locationId: 1,
    cutoffAt: '2026-03-01T00:00:00.000Z',
  });

  assert.deepEqual(counts, {
    inventory_batches: 0,
    sales: 0,
    inventory_movements: 0,
    activity_log: 0,
    expenses: 0,
    waste_records: 0,
    customer_orders: 0,
    staff_payments: 0,
  });
  assert.ok(calls.some((call) => call.text.includes('INSERT INTO "inventory_batches_archive" ("id", "location_id", "created_at")')));
  assert.ok(calls.some((call) => call.text.includes('INSERT INTO "waste_records_archive" ("id", "location_id", "wasted_at")')));
  assert.ok(calls.some((call) => call.text.includes('SELECT "id", "location_id", "created_at"')));
  assert.ok(calls.some((call) => call.text.includes('AND pickup_at < $2')));
  assert.ok(calls.every((call) => !call.text.includes('SELECT * FROM inventory_batches')));
  assert.ok(calls.every((call) => !call.text.includes('INSERT INTO inventory_batches_archive\n      SELECT *')));
});
