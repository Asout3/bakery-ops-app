import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaffAccount, archiveStaffAccount, archiveStaffProfile } from './adminLifecycleService.js';

test('createStaffAccount reactivates inactive matching account', async () => {
  const calls = { reactivate: 0, create: 0 };
  const repository = {
    withTransaction: async (handler) => handler({
      getActiveStaffById: async () => ({
        id: 10,
        linked_user_id: null,
        role_preference: 'manager',
        phone_number: '555-1234',
        full_name: 'Jane Doe',
        national_id: null,
        age: 28,
        monthly_salary: 1000,
        job_title: 'Manager',
        hire_date: '2026-02-01',
      }),
      getUserByUsernameOrEmail: async () => ({ id: 7, is_active: false }),
      getLinkedProfileByUserId: async () => null,
      reactivateUser: async () => {
        calls.reactivate += 1;
        return { id: 7, username: 'jane', is_active: true };
      },
      createUser: async () => {
        calls.create += 1;
        return { id: 8, username: 'jane', is_active: true };
      },
      upsertUserLocation: async () => {},
      linkStaffProfile: async () => {},
    }),
  };

  const result = await createStaffAccount({ username: 'jane', password: 'Passw0rd!', role: 'manager', location_id: 1, staff_profile_id: 10 }, repository);

  assert.equal(result.user.id, 7);
  assert.equal(calls.reactivate, 1);
  assert.equal(calls.create, 0);
});

test('createStaffAccount rejects active duplicate account', async () => {
  const repository = {
    withTransaction: async (handler) => handler({
      getActiveStaffById: async () => ({ id: 10, linked_user_id: null, role_preference: 'manager', phone_number: '555-1234' }),
      getUserByUsernameOrEmail: async () => ({ id: 9, is_active: true }),
    }),
  };

  await assert.rejects(
    () => createStaffAccount({ username: 'jane', password: 'Passw0rd!', role: 'manager', location_id: 1, staff_profile_id: 10 }, repository),
    (err) => err.status === 409 && err.code === 'ACCOUNT_ALREADY_EXISTS'
  );
});

test('archiveStaffAccount returns already_inactive for inactive user', async () => {
  const repository = {
    getUserById: async () => ({ id: 4, role: 'manager', is_active: false }),
  };

  const result = await archiveStaffAccount(4, repository);
  assert.deepEqual(result, { archived: true, already_inactive: true });
});

test('archiveStaffProfile rejects when linked user exists', async () => {
  const repository = {
    getStaffById: async () => ({ id: 3, linked_user_id: 7 }),
  };

  await assert.rejects(
    () => archiveStaffProfile(3, repository),
    (err) => err.status === 400 && err.code === 'STAFF_HAS_ACTIVE_ACCOUNT'
  );
});
