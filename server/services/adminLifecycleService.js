import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

function toError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function buildResolvedEmail(staff, username) {
  return `${(staff.phone_number || username).replace(/[^0-9+]/g, '') || username}@phone.local`;
}

export async function createStaffAccount(payload, repository) {
  return repository.withTransaction(async (repo) => {
    const staff = await repo.getActiveStaffById(payload.staff_profile_id);
    if (!staff) {
      throw toError('Staff profile not found or inactive', 404, 'STAFF_NOT_FOUND');
    }
    if (staff.linked_user_id) {
      throw toError('Staff profile already has an account', 400, 'STAFF_ALREADY_LINKED');
    }
    if (staff.role_preference === 'other') {
      throw toError('Staff with "other" role typically do not need accounts. Create a manager or cashier staff profile first.', 400, 'STAFF_ROLE_NOT_ELIGIBLE');
    }

    if (staff.role_preference !== payload.role) {
      throw toError('Account role must match the staff role preference.', 400, 'ROLE_MISMATCH');
    }

    const resolvedEmail = buildResolvedEmail(staff, payload.username);
    const resolvedLocationId = payload.location_id || staff.location_id || null;
    const password_hash = await bcrypt.hash(payload.password, SALT_ROUNDS);
    const existingUser = await repo.getUserByUsernameOrEmail(payload.username, resolvedEmail);

    let user;
    if (existingUser) {
      if (existingUser.is_active) {
        throw toError('Username or phone already exists', 409, 'ACCOUNT_ALREADY_EXISTS');
      }
      const linkedProfile = await repo.getLinkedProfileByUserId(existingUser.id, payload.staff_profile_id);
      if (linkedProfile) {
        throw toError('Archived account is linked to another staff profile', 409, 'ACCOUNT_LINKED_TO_OTHER_STAFF');
      }
      
      if (!payload.reactivate_confirm) {
        throw toError(
          `An archived account "${payload.username}" exists. To reactivate this account, please confirm by passing "reactivate_confirm: true" in the request.`,
          409,
          'ARCHIVED_ACCOUNT_EXISTS_RECONFIRM'
        );
      }
      
      user = await repo.reactivateUser({
        user_id: existingUser.id,
        username: payload.username,
        email: resolvedEmail,
        password_hash,
        role: payload.role,
        location_id: resolvedLocationId,
        full_name: staff.full_name,
        national_id: staff.national_id,
        phone_number: staff.phone_number,
        age: staff.age,
        monthly_salary: staff.monthly_salary,
        job_title: staff.job_title,
        hire_date: staff.hire_date || new Date().toISOString().slice(0, 10),
      });
    } else {
      user = await repo.createUser({
        username: payload.username,
        email: resolvedEmail,
        password_hash,
        role: payload.role,
        location_id: resolvedLocationId,
        full_name: staff.full_name,
        national_id: staff.national_id,
        phone_number: staff.phone_number,
        age: staff.age,
        monthly_salary: staff.monthly_salary,
        job_title: staff.job_title,
        hire_date: staff.hire_date || new Date().toISOString().slice(0, 10),
      });
    }

    if (resolvedLocationId) {
      await repo.upsertUserLocation(user.id, resolvedLocationId);
    }
    await repo.linkStaffProfile(user.id, payload.staff_profile_id);

    return { user, staff_profile_id: payload.staff_profile_id, reactivated: !!existingUser };
  });
}

export async function updateStaffAccount(payload, repository) {
  const existing = await repository.getUserById(payload.id);
  if (!existing) {
    return null;
  }

  if (payload.role && payload.role !== existing.role) {
    throw toError('Account role cannot be changed after creation.', 400, 'ROLE_IMMUTABLE');
  }

  const sanitizedPayload = { ...payload, role: undefined };
  if (payload.password) {
    const password_hash = await bcrypt.hash(payload.password, 10);
    return repository.updateUserWithPassword({ ...sanitizedPayload, password_hash });
  }
  return repository.updateUserWithoutPassword(sanitizedPayload);
}

export async function archiveStaffAccount(userId, repository) {
  const user = await repository.getUserById(userId);
  if (!user) {
    throw toError('Account not found', 404, 'ACCOUNT_NOT_FOUND');
  }
  if (user.role === 'admin') {
    throw toError('Cannot delete admin account', 400, 'ADMIN_DELETE_FORBIDDEN');
  }
  if (!user.is_active) {
    return { archived: true, already_inactive: true };
  }

  await repository.hardDeleteUser(userId);
  return { deleted: true };
}

export async function archiveStaffProfile(staffId, repository) {
  const staff = await repository.getStaffById(staffId);
  if (!staff) {
    throw toError('Staff member not found', 404, 'STAFF_NOT_FOUND');
  }
  if (staff.linked_user_id) {
    await repository.hardDeleteUser(staff.linked_user_id);
  }
  await repository.hardDeleteStaffProfile(staffId);
  return { deleted: true };
}
