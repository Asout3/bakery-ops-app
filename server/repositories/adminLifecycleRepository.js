import { query, withTransaction } from '../db.js';

const withTx = (tx) => ({
  getActiveStaffById: async (staffProfileId) => {
    const result = await tx.query('SELECT * FROM staff_profiles WHERE id = $1 AND is_active = true', [staffProfileId]);
    return result.rows[0] || null;
  },
  getUserByUsernameOrEmail: async (username, email) => {
    const result = await tx.query(
      `SELECT id, is_active
       FROM users
       WHERE username = $1 OR email = $2
       LIMIT 1`,
      [username, email]
    );
    return result.rows[0] || null;
  },
  getLinkedProfileByUserId: async (userId, staffProfileId) => {
    const result = await tx.query(
      'SELECT id FROM staff_profiles WHERE linked_user_id = $1 AND id <> $2 LIMIT 1',
      [userId, staffProfileId]
    );
    return result.rows[0] || null;
  },
  reactivateUser: async (payload) => {
    const result = await tx.query(
      `UPDATE users
       SET username = $1,
           email = $2,
           password_hash = $3,
           role = $4,
           location_id = $5,
           full_name = $6,
           national_id = $7,
           phone_number = $8,
           age = $9,
           monthly_salary = $10,
           job_title = $11,
           hire_date = $12,
           termination_date = NULL,
           is_active = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING id, username, email, role, location_id, is_active, created_at, full_name, phone_number, age, monthly_salary, job_title, hire_date`,
      [
        payload.username,
        payload.email,
        payload.password_hash,
        payload.role,
        payload.location_id,
        payload.full_name,
        payload.national_id,
        payload.phone_number,
        payload.age,
        payload.monthly_salary,
        payload.job_title,
        payload.hire_date,
        payload.user_id,
      ]
    );
    return result.rows[0];
  },
  createUser: async (payload) => {
    const result = await tx.query(
      `INSERT INTO users
       (username, email, password_hash, role, location_id, full_name, national_id, phone_number, age, monthly_salary, job_title, hire_date, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
       RETURNING id, username, email, role, location_id, is_active, created_at, full_name, phone_number, age, monthly_salary, job_title, hire_date`,
      [
        payload.username,
        payload.email,
        payload.password_hash,
        payload.role,
        payload.location_id,
        payload.full_name,
        payload.national_id,
        payload.phone_number,
        payload.age,
        payload.monthly_salary,
        payload.job_title,
        payload.hire_date,
      ]
    );
    return result.rows[0];
  },
  upsertUserLocation: async (userId, locationId) => {
    await tx.query('INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, locationId]);
  },
  linkStaffProfile: async (userId, staffProfileId) => {
    await tx.query('UPDATE staff_profiles SET linked_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [userId, staffProfileId]);
  },
});

export const adminLifecycleRepository = {
  withTransaction: async (handler) => withTransaction(async (tx) => handler(withTx(tx))),
  hardDeleteUser: async (id) => withTransaction(async (tx) => {
    await tx.query('UPDATE staff_profiles SET linked_user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE linked_user_id = $1', [id]);
    const batchColumnsResult = await tx.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'inventory_batches'
         AND column_name = ANY($1::text[])`,
      [['created_by', 'original_actor_id', 'synced_by_id']]
    );
    const availableBatchColumns = new Set(batchColumnsResult.rows.map((row) => row.column_name));
    const updateAssignments = [];
    const whereClauses = [];

    ['created_by', 'original_actor_id', 'synced_by_id'].forEach((column) => {
      if (availableBatchColumns.has(column)) {
        updateAssignments.push(`${column} = NULL`);
        whereClauses.push(`${column} = $1`);
      }
    });

    if (updateAssignments.length && whereClauses.length) {
      await tx.query(
        `UPDATE inventory_batches
         SET ${updateAssignments.join(', ')}
         WHERE ${whereClauses.join(' OR ')}`,
        [id]
      );
    }
    await tx.query('UPDATE sales SET cashier_id = NULL, voided_by = NULL WHERE cashier_id = $1 OR voided_by = $1', [id]);
    await tx.query('UPDATE expenses SET created_by = NULL WHERE created_by = $1', [id]);
    await tx.query('UPDATE staff_payments SET user_id = NULL, created_by = NULL WHERE user_id = $1 OR created_by = $1', [id]);
    await tx.query('UPDATE activity_log SET user_id = NULL WHERE user_id = $1', [id]);
    await tx.query('UPDATE notifications SET user_id = NULL WHERE user_id = $1', [id]);
    await tx.query('UPDATE inventory_movements SET created_by = NULL WHERE created_by = $1', [id]);
    await tx.query('UPDATE kpi_events SET user_id = NULL WHERE user_id = $1', [id]);
    await tx.query('UPDATE alert_rules SET created_by = NULL WHERE created_by = $1', [id]);
    await tx.query('UPDATE products SET created_by = NULL WHERE created_by = $1', [id]);
    await tx.query('DELETE FROM user_locations WHERE user_id = $1', [id]);
    await tx.query('DELETE FROM users WHERE id = $1', [id]);
  }),
  getUserById: async (id) => {
    const result = await query('SELECT id, role, is_active FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  },
  updateUserWithPassword: async ({ id, username, role, location_id, password_hash }) => {
    const result = await query(
      `UPDATE users
       SET username = COALESCE($1::text, username),
           role = COALESCE($2::text, role),
           location_id = COALESCE($3::int, location_id),
           password_hash = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5::int
       RETURNING id, username, role, location_id, is_active`,
      [username || null, role || null, location_id ?? null, password_hash, id]
    );
    return result.rows[0] || null;
  },
  updateUserWithoutPassword: async ({ id, username, role, location_id }) => {
    const result = await query(
      `UPDATE users
       SET username = COALESCE($1::text, username),
           role = COALESCE($2::text, role),
           location_id = COALESCE($3::int, location_id),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4::int
       RETURNING id, username, role, location_id, is_active`,
      [username || null, role || null, location_id ?? null, id]
    );
    return result.rows[0] || null;
  },
  archiveUser: async (id) => {
    await query(
      `UPDATE users
       SET is_active = false,
           username = CONCAT(username, '__archived__', id, '__', EXTRACT(EPOCH FROM NOW())::bigint),
           email = CONCAT(id, '__archived__', EXTRACT(EPOCH FROM NOW())::bigint, '@archived.local'),
           termination_date = COALESCE(termination_date, CURRENT_DATE),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  },
  unlinkStaffFromUser: async (id) => {
    await query('UPDATE staff_profiles SET linked_user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE linked_user_id = $1', [id]);
  },
  deleteUserLocations: async (id) => {
    await query('DELETE FROM user_locations WHERE user_id = $1', [id]);
  },
  getStaffById: async (id) => {
    const result = await query('SELECT id, linked_user_id FROM staff_profiles WHERE id = $1', [id]);
    return result.rows[0] || null;
  },
  archiveStaff: async (id) => {
    await query(
      `UPDATE staff_profiles
       SET is_active = false,
           termination_date = COALESCE(termination_date, CURRENT_DATE),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  },
  hardDeleteStaffProfile: async (id) => withTransaction(async (tx) => {
    await tx.query('UPDATE staff_payments SET staff_profile_id = NULL WHERE staff_profile_id = $1', [id]);
    await tx.query('DELETE FROM staff_profiles WHERE id = $1', [id]);
  }),
};
