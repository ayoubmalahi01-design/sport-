// Role helpers. Client-side only; server authority is RLS.
export const ROLES = {
  PLATFORM_OWNER: 'platform_owner',
  INSTITUTION_ADMIN: 'institution_admin',
  INSTITUTION_STAFF: 'institution_staff',
  COACH: 'coach',
};

export const ROLE_LABELS = {
  platform_owner: 'مالك المنصة',
  institution_admin: 'مدير المؤسسة',
  institution_staff: 'موظف إدارة',
  coach: 'مدرب',
};

export function isPlatformOwner(role) { return role === ROLES.PLATFORM_OWNER; }
export function isInstitutionAdmin(role) { return role === ROLES.INSTITUTION_ADMIN; }
export function isInstitutionStaff(role) { return role === ROLES.INSTITUTION_STAFF; }
export function isCoach(role) { return role === ROLES.COACH; }

export function canManageInstitutions(role) { return isPlatformOwner(role); }
export function canApproveFirstAdmin(role) { return isPlatformOwner(role); }
export function canManageInstitution(role) { return isPlatformOwner(role) || isInstitutionAdmin(role); }
export function canApproveAccounts(role) { return isPlatformOwner(role) || isInstitutionAdmin(role); }
export function canManageStudents(role) { return isPlatformOwner(role) || isInstitutionAdmin(role) || hasPerm(role, 'students'); }
export function canEnterResults(role) { return isPlatformOwner(role) || isInstitutionAdmin(role) || hasPerm(role, 'results'); }
export function canManageBarme(role) { return isPlatformOwner(role) || isInstitutionAdmin(role) || hasPerm(role, 'barme'); }
export function canAttendance(role) { return isPlatformOwner(role) || isInstitutionAdmin(role) || isInstitutionStaff(role) || isCoach(role); }
export function canSessions(role) { return isPlatformOwner(role) || isInstitutionAdmin(role) || isInstitutionStaff(role) || isCoach(role); }
export function canManageStaffPerms(role) { return isPlatformOwner(role) || isInstitutionAdmin(role); }

// institution_staff permissions are granted by admin and stored in profile.permissions (jsonb array)
export function hasPerm(role, perm) {
  if (isPlatformOwner(role) || isInstitutionAdmin(role)) return true;
  // staff permissions are checked against a provided permissions list; default false
  return false;
}

export function hasStaffPermission(permissions, perm) {
  return Array.isArray(permissions) && permissions.includes(perm);
}

export function isOwner(note, userId) {
  return !!note && (note.owner_id === userId || note.by === userId);
}