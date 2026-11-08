// Student Repository - with Supabase backend
// Manages student data with localStorage fallback
// Supabase: profiles + students tables with RLS policies

import { supabase, verifyConfig, getCurrentInstitutionId } from '../lib/supabaseClient'
import { studentFromDb, studentToDb } from '../lib/adapters.js'

const STUDENTS_KEY = 'sp_students'

// Get all students — tries Supabase first, falls back to localStorage
export const getStudents = async () => {
  try {
    // Try Supabase first if configured and verified
    if (verifyConfig().projectMatch) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('institution_id', user.id)
        
        if (data && data.length > 0) {
          return data.map(studentFromDb)
        }
      }
    }
    
    // Fall back to localStorage
    const data = localStorage.getItem(STUDENTS_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error in getStudents:', e)
    // Fallback to localStorage
    const data = localStorage.getItem(STUDENTS_KEY)
    return data ? JSON.parse(data) : []
  }
}

// Save students — saves to both Supabase and localStorage
export const saveStudents = async (students) => {
  try {
    // Save to localStorage first
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(students))
    
    // Try to save to Supabase if configured and authenticated
    if (verifyConfig().projectMatch) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        const institutionId = await getCurrentInstitutionId() || student.institution_id || 'local'
        for (const student of students) {
          const dbStudent = studentToDb(student, institutionId)
          const { error } = await supabase
            .from('students')
            .upsert(dbStudent)

          if (error) {
            console.error('Error saving student to Supabase:', error)
          }
        }
      }
    }
    
    return true
  } catch (e) {
    console.error('Error in saveStudents:', e)
    // LocalStorage already saved
    return true
  }
}

// Add a student
export const addStudent = async (student) => {
  try {
    const students = await getStudents()
    
    // Check for duplicate student number within institution
    if (students.some(s => s.id === student.id)) {
      return { success: false, error: 'Student number already exists' }
    }
    
    const newStudent = {
      id: student.id || Date.now().toString(),
      institution_id: student.institution_id || (await getCurrentInstitutionId()),
      student_code: student.student_code || `SP-${String(students.length + 1).padStart(3, '0')}`,
      full_name: student.full_name,
      birth_date: student.birth_date,
      group_name: student.group_name || 'المجموعة A',
      status: student.status || 'active'
    }
    
    students.push(newStudent)
    
    // Save to both Supabase and localStorage
    await saveStudents(students)
    
    return { success: true, student: newStudent }
  } catch (e) {
    console.error('Error in addStudent:', e)
    return { success: false, error: 'Error adding student' }
  }
}

// Update a student
export const updateStudent = async (id, updatedData) => {
  try {
    const students = await getStudents()
    const index = students.findIndex(s => s.id === id)
    
    if (index === -1) return { success: false, error: 'Student not found' }
    
    // Preserve the student ID — never change it
    updatedData.id = students[index].id
    
    // Preserve institution_id — students belong to one institution
    if (!updatedData.institution_id) {
      updatedData.institution_id = students[index].institution_id
    }
    
    // Preserve student_code — ID must not change
    if (!updatedData.student_code) {
      updatedData.student_code = students[index].student_code
    }
    
    // Merge updated data with existing
    students[index] = { ...students[index], ...updatedData }
    
    // Save to both Supabase and localStorage
    await saveStudents(students)
    
    return { success: true }
  } catch (e) {
    console.error('Error in updateStudent:', e)
    return { success: false, error: 'Error updating student' }
  }
}

// Delete a student
export const deleteStudent = async (id) => {
  try {
    const students = await getStudents()
    const index = students.findIndex(s => s.id === id)
    
    if (index === -1) return { success: false, error: 'Student not found' }
    
    // Remove from localStorage array
    students.splice(index, 1)
    
    // Save to both Supabase and localStorage
    // Note: In Supabase, we might soft-delete or mark as inactive
    // rather than actual DELETE to preserve audit history
    await saveStudents(students)
    
    // Try to soft-delete in Supabase
    if (verifyConfig().projectMatch) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        const { error } = await supabase
          .from('students')
          .update({ status: 'deleted', deleted_at: new Date().toISOString() })
          .eq('id', id)
        
        if (error) {
          console.error('Error deleting student from Supabase:', error)
          // LocalStorage already updated
        }
      }
    }
    
    return { success: true }
  } catch (e) {
    console.error('Error in deleteStudent:', e)
    return { success: false, error: 'Error deleting student' }
  }
}

// Get student by ID
export const getStudentById = async (id) => {
  try {
    const students = await getStudents()
    return students.find(s => s.id === id) || null
  } catch (e) {
    console.error('Error in getStudentById:', e)
    return null
  }
}

// Search students
export const searchStudents = async (query) => {
  try {
    const students = await getStudents()
    if (!query) return students
    
    const lowerQuery = query.toString().toLowerCase()
    return students.filter(s => 
      s.full_name.toLowerCase().includes(lowerQuery) || 
      s.student_code.toLowerCase().includes(lowerQuery) ||
      s.group_name.toLowerCase().includes(lowerQuery)
    )
  } catch (e) {
    console.error('Error in searchStudents:', e)
    return []
  }
}

// Get students by institution
export const getStudentsByInstitution = async (institutionId) => {
  try {
    const students = await getStudents()
    return students.filter(s => s.institution_id === institutionId)
  } catch (e) {
    console.error('Error in getStudentsByInstitution:', e)
    return []
  }
}
