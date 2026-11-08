// Attendance Repository - with Supabase backend
// Tracks both attendance and lateness as separate records
// Now includes rehabilitation notification tracking for students returning
// from 5+ consecutive absences

import { supabase, verifyConfig, getCurrentInstitutionId, getCurrentUserId } from '../lib/supabaseClient'
import { attendanceFromDb } from '../lib/adapters.js'

const ATTENDANCE_KEY = 'sp_attendance'

// Rehabilitation notification configuration
const REHAB_CONFIG = {
  // Trigger notification after student returns from this many consecutive absences
  MIN_ABSENCES_TO_TRIGGER: 5,
  // Notification duration in sessions after return
  DURATION_SESSIONS: 2,
  // Status values
  STATUS: {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    HANDLED: 'handled'
  }
}

// Attendance starts empty; no module-level initialization is required.
// NOTE: Do not call getAttendance() here — it is declared below as a const
// and calling it during module evaluation would hit the temporal dead zone.

// Get all attendance records — tries Supabase first, falls back to localStorage
export const getAttendance = async () => {
  try {
    // Try Supabase first if configured and verified
    if (verifyConfig().projectMatch) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('institution_id', user.id)
        
        if (data && data.length > 0) {
          return data.map(attendanceFromDb)
        }
      }
    }
    
    // Fall back to localStorage
    const data = localStorage.getItem(ATTENDANCE_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error loading attendance:', e)
    // Fallback to localStorage
    const data = localStorage.getItem(ATTENDANCE_KEY)
    return data ? JSON.parse(data) : []
  }
}

// Save attendance records
export const saveAttendance = (records) => {
  try {
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(records))
    return true
  } catch (e) {
    console.error('Error saving attendance:', e)
    return false
  }
}

// Attendance types
export const ATTENDANCE_TYPES = {
  PRESENT: 'حاضر',
  ABSENT: 'غائب',
  EXCUSED: 'إعفاء',
  PERMISSION: 'رخصة',
  DUTY: 'واجب'
}

// Record types: 'attendance' or 'lateness'
export const recordTypeNames = {
  attendance: 'حضور/غياب',
  lateness: 'تأخر'
}

// Mark attendance and track rehabilitation notifications
export const markAttendance = async (studentId, date, status, reason = '') => {
  const records = await getAttendance()
  
  // Check student's attendance history to determine consecutive absences
  const studentRecords = records.filter(r => r.studentId === studentId && r.recordType === 'attendance')
  const sortedRecords = studentRecords.sort((a, b) => new Date(a.date) - new Date(b.date))
  
  // Calculate consecutive absences ending on this date
  let consecutiveAbsences = 0
  let lastPresentDate = null
  
  // Count consecutive absences backwards from the current date
  for (let i = sortedRecords.length - 1; i >= 0; i--) {
    const rec = sortedRecords[i]
    if (new Date(rec.date) > new Date(date)) {
      // Future records or after current date - skip
      continue
    }
    if (rec.status === 'حاضر' || rec.status === 'PRESENT') {
      // Found a present record - this would break the absence streak
      if (consecutiveAbsences >= REHAB_CONFIG.MIN_ABSENCES_TO_TRIGGER) {
        // We already found enough absences - stop counting
        break
      } else {
        // Streak broken by present before 5 absences
        consecutiveAbsences = 0
        break
      }
    } else if (rec.status === 'غائب' || rec.status === 'ABSENT') {
      consecutiveAbsences++
    } else {
      // Other status (excused, permission, duty) - treat as not counting toward
      // the absence streak for rehab purposes, but don't reset unless we want
      // to be conservative
      // Just continue counting
    }
  }
  
  // Also check if there are records AFTER the current date that might affect the streak
  // For simplicity, we'll just count the consecutive absences leading up to today
  // We need to look at all records for this student
  
  let maxStreak = 0
  let currentStreak = 0
  
  // Sort by date ascending
  const allSorted = [...studentRecords].sort((a, b) => new Date(a.date) - new Date(b.date))
  
  allSorted.forEach(rec => {
    if (rec.status === 'ABSENT' || rec.status === 'غائب') {
      currentStreak++
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak
      }
    } else {
      // Any present/other status resets the streak
      currentStreak = 0
    }
  })
  
  consecutiveAbsences = maxStreak
  
  // Check if this mark triggers a rehabilitation notification
  let rehabNotification = null
  let shouldTriggerRehab = false
  
  if (status === 'PRESENT' || status === 'حاضر') {
    // Student is being marked present
    if (consecutiveAbsences >= REHAB_CONFIG.MIN_ABSENCES_TO_TRIGGER) {
      // TRIGGER: Student returns after 5+ consecutive absences
      shouldTriggerRehab = true
      rehabNotification = {
        id: 'rehab-notif-' + studentId + '-' + date,
        studentId,
        triggeredAt: date,
        sessionsCounted: 0,
        maxSessions: REHAB_CONFIG.DURATION_SESSIONS,
        status: REHAB_CONFIG_STATUS.ACTIVE,
        handled: false,
        description: `طالب عائد من ${consecutiveAbsences} غياب متتالي - تنبيه إعادة تأهيل`
      }
    }
  }
  
  // Find existing record for this student/date
  const existingIndex = records.findIndex(
    r => r.studentId === studentId && r.date === date && r.recordType === 'attendance'
  )
  
  const record = {
    id: Date.now(),
    studentId,
    date,
    status,
    reason,
    recordType: 'attendance',
    // Rehabilitation notification tracking fields
    rehabNotificationId: shouldTriggerRehab ? rehabNotification.id : null,
    rehabTriggered: shouldTriggerRehab || false,
    consecutiveAbsences,
    rehabSessionsCount: shouldTriggerRehab ? 0 : (records.findIndex(r => r.studentId === studentId && r.rehabNotificationId) >= 0 ? records.find(r => r.studentId === studentId && r.rehabNotificationId).rehabSessionsCount || 0 : 0),
    rehabStatus: shouldTriggerRehab ? REHAB_CONFIG_STATUS.ACTIVE : null
  }
  
  // Update existing or add new
  if (existingIndex >= 0) {
    records[existingIndex] = { ...records[existingIndex], ...record, id: records[existingIndex].id }
  } else {
    records.push(record)
  }
  
  // If rehab notification was triggered, also add a notification record to track it
  if (shouldTriggerRehab) {
    // Add notification metadata - we'll store it as part of the attendance system
    // but also ensure it's tracked separately for visibility
    record.rehabNotification = {
      ...rehabNotification,
      currentSessionAfterReturn: 0
    }
  }
  
  saveAttendance(records)
  return { success: true, record }
}

// Mark lateness as a separate record type
export const markLateness = async (studentId, date, status = 'متأخر', reason = '') => {
  const records = await getAttendance()
  const existingIndex = records.findIndex(
    r => r.studentId === studentId && r.date === date && r.recordType === 'lateness'
  )

  const record = {
    id: existingIndex >= 0 ? records[existingIndex].id : Date.now(),
    studentId,
    date,
    status,
    reason,
    recordType: 'lateness'
  }

  if (existingIndex >= 0) {
    records[existingIndex] = record
  } else {
    records.push(record)
  }

  saveAttendance(records)
  return { success: true, record }
}

// Get all attendance records for a student (attendance only)
export const getStudentAttendance = async (studentId) => {
  const records = await getAttendance()
  return records.filter(r => r.studentId === studentId && r.recordType === 'attendance')
}

// Get all lateness records for a student
export const getStudentLateness = async (studentId) => {
  const records = await getAttendance()
  return records.filter(r => r.studentId === studentId && r.recordType === 'lateness')
}

// Summarize attendance records by status
export const getAttendanceSummary = async () => {
  const records = await getAttendance()
  const attendanceRecords = records.filter(r => r.recordType === 'attendance')
  const summary = { total: attendanceRecords.length, present: 0, absent: 0, excused: 0, permission: 0, duty: 0 }

  attendanceRecords.forEach(record => {
    if (record.status === ATTENDANCE_TYPES.PRESENT || record.status === 'PRESENT') summary.present++
    else if (record.status === ATTENDANCE_TYPES.ABSENT || record.status === 'ABSENT') summary.absent++
    else if (record.status === ATTENDANCE_TYPES.EXCUSED || record.status === 'EXCUSED') summary.excused++
    else if (record.status === ATTENDANCE_TYPES.PERMISSION || record.status === 'PERMISSION') summary.permission++
    else if (record.status === ATTENDANCE_TYPES.DUTY || record.status === 'DUTY') summary.duty++
  })

  return summary
}

// Check and update rehabilitation notification status after a session
// This should be called when a new session starts/ends
export const checkRehabNotification = async (studentId, sessionDate) => {
  const records = await getAttendance()
  const studentRecordIndex = records.findIndex(
    r => r.studentId === studentId && r.rehabNotificationId
  )
  
  if (studentRecordIndex === -1) return null
  
  const studentRecord = records[studentRecordIndex]
  
  // If already expired or handled, no need to update
  if (studentRecord.rehabStatus === REHAB_CONFIG_STATUS.EXPIRED || 
      studentRecord.rehabStatus === REHAB_CONFIG_STATUS.HANDLED) {
    return { status: studentRecord.rehabStatus, sessionsCounted: studentRecord.rehabSessionsCount }
  }
  
  // Increment the session count
  const updatedSessionsCount = (studentRecord.rehabSessionsCount || 0) + 1
  
  // Check if we've reached the 2-session limit
  let updatedStatus = studentRecord.rehabStatus
  
  if (updatedSessionsCount >= REHAB_CONFIG.DURATION_SESSIONS) {
    // Auto-expire after 2 sessions
    updatedStatus = REHAB_CONFIG_STATUS.EXPIRED
  } else {
    updatedStatus = REHAB_CONFIG_STATUS.ACTIVE
  }
  
  // Update the record
  records[studentRecordIndex] = {
    ...studentRecord,
    rehabSessionsCount: updatedSessionsCount,
    rehabStatus: updatedStatus
  }
  
  saveAttendance(records)
  
  return { 
    status: updatedStatus, 
    sessionsCounted: updatedSessionsCount,
    notificationId: studentRecord.rehabNotificationId
  }
}

// Mark rehabilitation notification as handled
// Called when coach adds student to rehabilitation section
export const markRehabAsHandled = async (studentId) => {
  const records = await getAttendance()
  
  // Find all records for this student with active rehab notifications
  const studentRecords = records.filter(r => r.studentId === studentId && r.rehabNotificationId)
  
  studentRecords.forEach(recordIndex => {
    const idx = records.findIndex(r => r.id === recordIndex)
    if (idx !== -1) {
      records[idx] = {
        ...records[idx],
        rehabStatus: REHAB_CONFIG_STATUS.HANDLED,
        handled: true,
        handledAt: new Date().toLocaleString('ar-TN')
      }
    }
  })
  
  saveAttendance(records)
  return { success: true }
}

// Get rehabilitation notification status for a student
export const getRehabNotificationStatus = async (studentId) => {
  const records = await getAttendance()
  const studentRecords = records.filter(r => r.studentId === studentId && r.rehabNotificationId)
  
  if (studentRecords.length === 0) return null
  
  // Return the most recent/relevant notification
  const latest = studentRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
  const record = records.find(r => r.id === latest.id)
  
  return {
    studentId,
    triggeredAt: record.rehabTriggered ? record.rehabNotificationId : null,
    sessionsCounted: record.rehabSessionsCount || 0,
    maxSessions: REHAB_CONFIG.DURATION_SESSIONS,
    status: record.rehabStatus || 'inactive',
    handled: record.handled || false,
    consecutiveAbsences: record.consecutiveAbsences || 0
  }
}

// Get all students with active rehabilitation notifications
export const getStudentsWithActiveRehab = async () => {
  const records = await getAttendance()
  const students = []
  
  records.forEach(record => {
    if (record.rehabNotificationId && record.rehabStatus === REHAB_CONFIG_STATUS.ACTIVE) {
      // Check if this student is already in the list
      const alreadyInList = students.some(s => s.studentId === record.studentId)
      if (!alreadyInList) {
        students.push({
          studentId: record.studentId,
          consecutiveAbsences: record.consecutiveAbsences,
          triggeredAt: record.rehabNotificationId,
          sessionsCounted: record.rehabSessionsCount || 0,
          status: record.rehabStatus
        })
      }
    }
  })
  
  return students
}

// Get rehabilitation notification history (expired and handled)
export const getRehabNotificationHistory = async (studentId) => {
  const records = await getAttendance()
  const history = []
  
  records.forEach(record => {
    if (record.studentId === studentId && record.rehabNotificationId && 
        (record.rehabStatus === REHAB_CONFIG_STATUS.EXPIRED || 
         record.rehabStatus === REHAB_CONFIG_STATUS.HANDLED)) {
      history.push({
        triggeredAt: record.rehabTriggered ? record.rehabNotificationId : record.date,
        sessionsCounted: record.rehabSessionsCount || 0,
        status: record.rehabStatus,
        handled: record.handled || false,
        consecutiveAbsences: record.consecutiveAbsences || 0,
        date: record.date
      })
    }
  })
  
  return history
}

// Constants for rehab status
export const REHAB_CONFIG_STATUS = REHAB_CONFIG.STATUS

// Export for use in sessions checking
export { REHAB_CONFIG }