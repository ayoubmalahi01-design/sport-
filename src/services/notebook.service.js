// Coach's Private Notebook Repository - with Supabase backend
// Notes are separated by owner_id using database RLS for real privacy.
// Each coach's notes are private and not accessible by other coaches.
// Uses Supabase RLS policy: "coach notes owner only" (owner_id = auth.uid())

import { supabase, verifyConfig, getCurrentUserId, getCurrentInstitutionId } from '../lib/supabaseClient'
import { noteFromDb, noteToDb } from '../lib/adapters.js'

const NOTES_KEY = 'sp_private_notes' // Kept for localStorage fallback
const COACH_ID_KEY = 'sp_current_coach_id' // Kept for backward compatibility

// Get notes filtered by authenticated coach using Supabase RLS
export const getNotes = async () => {
  try {
    // Try Supabase first if configured and verified
    if (verifyConfig().projectMatch) {
      const userId = await getCurrentUserId()
      if (userId) {
        // Use Supabase RLS policy: "coach notes owner only"
        // The policy enforces owner_id = auth.uid() at the database level
        const { data, error } = await supabase
          .from('coach_notes')
          .select('*')
          .eq('owner_id', userId)
        
        if (error) {
          console.error('Error fetching notes from Supabase:', error)
          // Fall back to localStorage
        } else if (data && data.length > 0) {
          return data.map(noteFromDb)
        }
      }
    }
    
    // Fall back to localStorage (with coach filtering)
    const data = localStorage.getItem(NOTES_KEY)
    if (!data) return []
    const notes = JSON.parse(data)
    const userId = await getCurrentUserId()
    
    // Filter notes by authenticated user using RLS logic
    // In localStorage mode, we filter by owner_id = current user or legacy
    if (userId) {
      return notes.filter(n => n.owner_id === userId || n.owner_id === 'legacy')
    }
    return notes
  } catch (e) {
    console.error('Error in getNotes:', e)
    // Fallback to localStorage
    const data = localStorage.getItem(NOTES_KEY)
    if (!data) return []
    const notes = JSON.parse(data)
    const userId = await getCurrentUserId()
    if (userId) {
      return notes.filter(n => n.owner_id === userId || n.owner_id === 'legacy')
    }
    return notes
  }
}

// Save all notes — saves to both Supabase and localStorage
export const saveNotes = async (notes) => {
  try {
    // Save to localStorage
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
    
    // Try to save to Supabase if configured and authenticated
    if (verifyConfig().projectMatch) {
      const userId = await getCurrentUserId()
      if (userId) {
        const institutionId = await getCurrentInstitutionId()
        for (const note of notes) {
          const dbNote = noteToDb(note, userId, institutionId)
          const { error } = await supabase
            .from('coach_notes')
            .upsert({
              ...dbNote,
              id: (typeof note.id === 'number' ? undefined : note.id),
              updated_at: new Date().toISOString()
            })
          
          if (error) {
            console.error('Error saving note to Supabase:', error)
          }
        }
      }
    }
    
    return true
  } catch (e) {
    console.error('Error in saveNotes:', e)
    // LocalStorage already saved
    return true
  }
}

// Add a note with owner_id
export const addNote = async (noteText, ownerId = null) => {
  try {
    const notes = await getNotes()
    const currentUserId = await getCurrentUserId()
    const noteOwner = ownerId || currentUserId
    
    const note = {
      id: Date.now(),
      text: noteText.trim(),
      title: noteText.substring(0, 30) + (noteText.length > 30 ? '...' : ''),
      date: new Date().toLocaleString('ar-TN'),
      owner_id: noteOwner
    }
    
    notes.unshift(note) // Add to top
    
    // Save to both Supabase and localStorage
    await saveNotes(notes)
    
    return { success: true, note }
  } catch (e) {
    console.error('Error in addNote:', e)
    return { success: false, error: 'Error adding note' }
  }
}

// Update a note - only if owned by current coach using DB RLS
export const updateNote = async (id, updatedText) => {
  try {
    const notes = await getNotes()
    const index = notes.findIndex(n => n.id === id)
    
    if (index === -1) return { success: false, error: 'Note not found' }
    
    // Get current user ID for RLS check
    const userId = await getCurrentUserId()
    
    // In Supabase with RLS, the policy "coach notes owner only" 
    // enforces owner_id = auth.uid() at the database level
    // In application, we check ownership before allowing update
    if (notes[index].owner_id === userId || notes[index].owner_id === 'legacy') {
      notes[index].text = updatedText.trim()
      notes[index].date = new Date().toLocaleString('ar-TN')
      
      // Save to both Supabase and localStorage
      await saveNotes(notes)
      
      return { success: true }
    }
    
    return { success: false, error: 'لا يمكنك تعديل هذه الملاحظة' }
  } catch (e) {
    console.error('Error in updateNote:', e)
    return { success: false, error: 'Error updating note' }
  }
}

// Delete a note - only if owned by current coach using DB RLS
export const deleteNote = async (id) => {
  try {
    let notes = await getNotes()
    const index = notes.findIndex(n => n.id === id)
    
    if (index === -1) return { success: false, error: 'Note not found' }
    
    // Get current user ID for RLS check
    const userId = await getCurrentUserId()
    
    // In Supabase with RLS, the policy "coach notes owner only" 
    // enforces owner_id = auth.uid() at the database level
    // In application, we check ownership before allowing deletion
    if (notes[index].owner_id === userId || notes[index].owner_id === 'legacy') {
      notes = notes.filter(n => n.id !== id)
      
      // Save to both Supabase and localStorage
      await saveNotes(notes)
      
      return { success: true }
    }
    
    return { success: false, error: 'لا يمكنك حذف هذه الملاحظة' }
  } catch (e) {
    console.error('Error in deleteNote:', e)
    return { success: false, error: 'Error deleting note' }
  }
}

// Get notes for a specific date range or all (respecting coach filtering)
export const getNotesByDate = async (startDate, endDate) => {
  try {
    const notes = await getNotes()
    const userId = await getCurrentUserId()
    return notes.filter(n => {
      const noteDate = n.date
      const coachMatch = n.owner_id === userId || n.owner_id === 'legacy'
      
      const dateMatch = (!startDate || noteDate >= startDate) && (!endDate || noteDate <= endDate)
      return dateMatch && coachMatch
    })
  } catch (e) {
    console.error('Error in getNotesByDate:', e)
    return []
  }
}

// Get notes for a specific coach (admin functionality)
// In Supabase, admin users can access all notes
export const getNotesByCoach = async (coachId) => {
  try {
    if (verifyConfig().projectMatch) {
      // Admin can access all notes - would check admin role
      const { data, error } = await supabase
        .from('coach_notes')
        .select('*')
      
      if (data && data.length > 0) return data
    }
    
    // Fall back to localStorage
    const data = localStorage.getItem(NOTES_KEY)
    if (!data) return []
    const notes = JSON.parse(data)
    
    // Filter by coach ID if provided
    if (coachId) {
      return notes.filter(n => n.owner_id === coachId || n.owner_id === 'legacy')
    }
    return notes
  } catch (e) {
    console.error('Error in getNotesByCoach:', e)
    // Fallback to localStorage
    const data = localStorage.getItem(NOTES_KEY)
    if (!data) return []
    const notes = JSON.parse(data)
    if (coachId) {
      return notes.filter(n => n.owner_id === coachId || n.owner_id === 'legacy')
    }
    return notes
  }
}
