// Sessions Repository - with Supabase backend
// Every session stores: id, institution_id, coach_id, coach_name_snapshot, date, start_time, end_time, duration, created_at
// WARNING: localStorage is not secure! Real session management requires Supabase
// authentication and RLS. This is a simulated data architecture for development.

import { supabase, verifyConfig, getCurrentUserId } from '../lib/supabaseClient'
import { checkRehabNotification } from './attendance.service'

const SESSIONS_KEY = 'sp_sessions'
const INSTITUTIONS_KEY = 'sp_institutions'
const COACH_ID_KEY = 'sp_current_coach_id'

// Initialize sessions if not exists
if (!localStorage.getItem(SESSIONS_KEY)) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([]))
}

// Initialize institutions if not exists
if (!localStorage.getItem(INSTITUTIONS_KEY)) {
  localStorage.setItem(INSTITUTIONS_KEY, JSON.stringify([{ id: 'default-1', name: 'المؤسسة الرياضية النموذجية', logo: '' }]))
}

// Get all sessions — tries Supabase first, falls back to localStorage
export const getSessions = async () => {
  try {
    // Try Supabase first if configured and verified
    if (verifyConfig().projectMatch) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('institution_id', user.id)
          .order('started_at', { ascending: false })
        
        if (data && data.length > 0) {
          return data
        }
      }
    }
    
    // Fall back to localStorage
    const data = localStorage.getItem(SESSIONS_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error loading sessions:', e)
    // Fallback to localStorage
    const data = localStorage.getItem(SESSIONS_KEY)
    return data ? JSON.parse(data) : []
  }
}

// Save sessions
export const saveSessions = (sessions) => {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
    return true
  } catch (e) {
    console.error('Error saving sessions:', e)
    return false
  }
}

// Get current institution ID
export const getCurrentInstitutionId = async () => {
  try {
    // Try Supabase first
    if (verifyConfig().projectMatch) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        return user.institution_id || null
      }
    }
    
    // Fall back to localStorage
    const institutions = JSON.parse(localStorage.getItem(INSTITUTIONS_KEY) || '[]')
    return institutions.length > 0 ? institutions[0]?.id || null : null
  } catch (e) {
    console.error('Error loading current institution ID:', e)
    // Fallback to localStorage
    const institutions = JSON.parse(localStorage.getItem(INSTITUTIONS_KEY) || '[]')
    return institutions.length > 0 ? institutions[0]?.id || null : null
  }
}

// Get current coach ID
export const getCurrentCoachId = async () => {
  try {
    // Try Supabase first — gets the authenticated user's ID
    if (verifyConfig().projectMatch) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        return user.id || 'legacy'
      }
    }
    
    // Fall back to localStorage
    return localStorage.getItem(COACH_ID_KEY) || 'legacy'
  } catch (e) {
    console.error('Error loading coach ID:', e)
    // Fallback to localStorage
    return localStorage.getItem(COACH_ID_KEY) || 'legacy'
  }
}

// Get current coach name (snapshot from when session was created)
export const getCurrentCoachName = async () => {
  try {
    const coachId = await getCurrentCoachId()
    // Return the coach name based on ID - for simulation purposes
    const coachNames = {
      'legacy': 'مدرب - عرض تجريبي',
      'coach-1': 'مدرب أحمد',
      'coach-2': 'مدرب محمد'
    }
    return coachNames[coachId] || 'مدرب'
  } catch (e) {
    console.error('Error loading coach name:', e)
    return 'مدرب'
  }
}

// Add a new session
export const addSession = async (sessionData) => {
  try {
    const sessions = await getSessions()
    const currentCoachId = await getCurrentCoachId()
    const currentInstitutionId = await getCurrentInstitutionId()
    const coachName = await getCurrentCoachName()
    
    const session = {
      id: Date.now().toString(),
      institution_id: currentInstitutionId,
      coach_id: currentCoachId,
      coach_name: coachName,
      date: sessionData.date || new Date().toISOString().slice(0, 10),
      start_time: sessionData.start_time || new Date().toLocaleTimeString('ar-TN', { hour: '2-digit', minute: '2-digit' }),
      end_time: sessionData.end_time || '',
      duration: sessionData.duration || 0,
      created_at: new Date().toISOString()
    }
    
    sessions.unshift(session) // Add to top
    saveSessions(sessions)
    
    // Check and update rehabilitation notifications for students
    // after this session is added
    try {
      const attendanceRecords = await getAttendance()
      const studentIdsWithRehab = attendanceRecords
        .filter(r => r.rehabNotificationId && r.rehabStatus === 'active')
        .map(r => r.studentId)
      
      for (const studentId of studentIdsWithRehab) {
        const result = await checkRehabNotification(studentId, session.date)
        // Optionally flash result if needed
      }
    } catch (e) {
      console.error('Error checking rehab notifications after session:', e)
    }
    
    return { success: true, session }
  } catch (e) {
    console.error('Error in addSession:', e)
    return { success: false, error: 'Error adding session' }
  }
}

// Get sessions for current institution
export const getInstitutionSessions = async () => {
  try {
    const institutionId = await getCurrentInstitutionId()
    const sessions = await getSessions()
    return institutionId ? sessions.filter(s => s.institution_id === institutionId) : sessions
  } catch (e) {
    console.error('Error in getInstitutionSessions:', e)
    return []
  }
}

// Get sessions for current coach
export const getCoachSessions = async () => {
  try {
    const coachId = await getCurrentCoachId()
    const sessions = await getSessions()
    return coachId ? sessions.filter(s => s.coach_id === coachId) : sessions
  } catch (e) {
    console.error('Error in getCoachSessions:', e)
    return []
  }
}

// Update a session (end time and duration)
export const updateSession = async (sessionId, endTime, duration) => {
  try {
    const sessions = await getSessions()
    const index = sessions.findIndex(s => s.id === sessionId)
    
    if (index === -1) return { success: false, error: 'حصة غير موجودة' }
    
    sessions[index].end_time = endTime
    sessions[index].duration = duration
    // Update created_at to reflect modification
    sessions[index].updated_at = new Date().toISOString()
    saveSessions(sessions)
    return { success: true, session: sessions[index] }
  } catch (e) {
    console.error('Error in updateSession:', e)
    return { success: false, error: 'Error updating session' }
  }
}

// Delete a session
export const deleteSession = async (sessionId) => {
  try {
    const sessions = await getSessions()
    const filtered = sessions.filter(s => s.id !== sessionId)
    saveSessions(filtered)
    return { success: true }
  } catch (e) {
    console.error('Error in deleteSession:', e)
    return { success: false, error: 'Error deleting session' }
  }
}

// Get session by ID
export const getSessionById = async (sessionId) => {
  try {
    const sessions = await getSessions()
    return sessions.find(s => s.id === sessionId) || null
  } catch (e) {
    console.error('Error in getSessionById:', e)
    return null
  }
}

// Get session statistics
export const getSessionStatistics = async () => {
  try {
    const sessions = await getSessions()
    const totalSessions = sessions.length
    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0)
    
    // Sessions by coach
    const coachStats = {}
    sessions.forEach(s => {
      const coachId = s.coach_id
      if (!coachStats[coachId]) {
        coachStats[coachId] = { count: 0, totalDuration: 0, coachName: s.coach_name }
      }
      coachStats[coachId].count++
      coachStats[coachId].totalDuration += s.duration || 0
    })
    
    return {
      totalSessions,
      totalDuration,
      coachStats
    }
  } catch (e) {
    console.error('Error in getSessionStatistics:', e)
    return { totalSessions: 0, totalDuration: 0, coachStats: {} }
  }
}