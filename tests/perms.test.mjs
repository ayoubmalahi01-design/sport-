import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlatformOwner, isInstitutionAdmin, isCoach, canManageStudents, canEnterResults, canAttendance } from '../src/lib/perms.js';

test('role checks', () => {
  assert.equal(isPlatformOwner('platform_owner'), true);
  assert.equal(isInstitutionAdmin('institution_admin'), true);
  assert.equal(isCoach('coach'), true);
  assert.equal(isPlatformOwner('coach'), false);
});

test('permissions', () => {
  assert.equal(canManageStudents('platform_owner'), true);
  assert.equal(canManageStudents('coach'), false);
  assert.equal(canEnterResults('institution_admin'), true);
  assert.equal(canAttendance('coach'), true);
});