// Audit Log Repository - Local Storage
// Structured audit records with actor_id, actor_role, entity_type, old/new values.
// WARNING: localStorage is not secure! Real confidentiality requires Supabase
// authentication and Row Level Security (RLS).

const AUDIT_KEY = 'sp_audit'
const INSTITUTIONS_KEY = 'sp_institutions'
const COACH_ID_KEY = 'sp_current_coach_id'

// Initialize institution list if not exists
if (!localStorage.getItem(INSTITUTIONS_KEY)) {
  localStorage.setItem(INSTITUTIONS_KEY, JSON.stringify([]))
}

// Get the current institution ID
export const getCurrentInstitutionId = () => {
  try {
    const institutions = JSON.parse(localStorage.getItem(INSTITUTIONS_KEY) || '[]')
    return institutions.length > 0 ? institutions[0]?.id || null : null
  } catch (e) {
    console.error('Error loading institution ID:', e)
    return null
  }
}

// Get the current coach ID
export const getCurrentCoachId = () => {
  try {
    return localStorage.getItem(COACH_ID_KEY) || 'legacy'
  } catch (e) {
    console.error('Error loading coach ID:', e)
    return 'legacy'
  }
}

// Get institution name from ID
export const getInstitutionName = (institutionId) => {
  try {
    const institutions = JSON.parse(localStorage.getItem(INSTITUTIONS_KEY) || '[]')
    const inst = institutions.find(i => i.id === institutionId)
    return inst ? inst.name : 'غير معروف'
  } catch (e) {
    console.error('Error loading institution name:', e)
    return 'غير معروف'
  }
}

// Structured audit record fields:
// id, institution_id, actor_id, actor_role, action, entity_type, entity_id,
// timestamp, old_value, new_value, details

// Get all audit records
export const getAudit = () => {
  try {
    const data = localStorage.getItem(AUDIT_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error loading audit log:', e)
    return []
  }
}

// Save audit records
export const saveAudit = (records) => {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(records))
    return true
  } catch (e) {
    console.error('Error saving audit log:', e)
    return false
  }
}

// Operation types
export const OPERATION_TYPES = {
  ADD: 'إضافة',
  EDIT: 'تعديل',
  DELETE: 'حذف',
  MARK_ATTENDANCE: 'تسجيل حضور/غياب',
  MARK_LATENESS: 'تسجيل تأخر',
  ADD_STUDENT: 'إضافة طالب',
  UPDATE_STUDENT: 'تعديل طالب',
  DELETE_STUDENT: 'حذف طالب',
  ADD_TEST: 'إدخال نتيجة اختبار',
  UPDATE_TEST: 'تعديل نتيجة اختبار',
  ADD_SESSION: 'تسجيل حصة',
  UPDATE_SESSION: 'تعديل حصة',
  ADD_INJURY: 'تسجيل إصابة',
  UPDATE_INJURY: 'تحديث إصابة',
  ADD_MEASUREMENT: 'تسجيل قياس',
  UPDATE_MEASUREMENT: 'تحديث قياس',
  UPDATE_SETTINGS: 'تحديث إعدادات'
}

// Actor roles
export const ACTOR_ROLES = {
  ADMIN: 'إدارة',
  COACH: 'مدرب',
  SYSTEM: 'نظام'
}

// Log a structured audit operation
export const logOperation = (operation, details, entityType, entityId, actorRole = ACTOR_ROLES.SYSTEM, oldValue = null, newValue = null) => {
  const records = getAudit()
  
  // Get current institution ID
  const institutionId = getCurrentInstitutionId()
  
  // Get current coach ID
  const actorId = getCurrentCoachId()
  
  const record = {
    id: Date.now(),
    institution_id: institutionId,
    actor_id: actorId,
    actor_role: actorRole || ACTOR_ROLES.SYSTEM,
    action: operation,
    entity_type: entityType || 'عام',
    entity_id: entityId || null,
    timestamp: new Date().toLocaleString('ar-TN'),
    old_value: oldValue,
    new_value: newValue,
    details: details || ''
  }
  
  records.unshift(record) // Add to top
  saveAudit(records)
  return { success: true, record }
}

// Get audit operations filtered by actor ID or role
export const getOperationsByActor = (actorIdOrRole) => {
  const records = getAudit()
  if (!actorIdOrRole) return records
  // Filter by actor_id OR actor_role
  return records.filter(r => r.actor_id === actorIdOrRole || r.actor_role === actorIdOrRole)
}

export const getOperationsByType = (operationType) => {
  const records = getAudit()
  return operationType ? records.filter(r => r.action === operationType) : records
}

export const getRecentOperations = (limit = 10) => {
  const records = getAudit()
  return records.slice(0, limit)
}

// Initialize with empty audit log
if (getAudit().length === 0) {
  // No initialization needed
}