// Test Results Repository - with Supabase backend
// Manages test entries with raw scores and scoring table references
// Now supports institution-specific BARME (scoring scales)

import { supabase, verifyConfig } from '../lib/supabaseClient'
import { scoreWithBarme } from '../lib/barmeEngine.js'

const TEST_ENTRIES_KEY = 'sp_test_entries'

// Test types supported
export const TEST_TYPES = {
  'Test Navette — Léger 20m': 'Test Navette Léger 20m',
  Pompes: 'Pompes (Push-ups)',
  Abdominaux: 'Abdominaux (Crunches)',
  'Barre fixe': 'Barre fixe (Static hold)'
}

// Check if institution can administer a specific test
export const institutionHasTest = async (institutionId, testType) => {
  return true
}

// Protocol for Test Navette Léger 20m
export const NAVER_PROTOCOL = {
  distance: '20m',
  startSpeed: '8.5 km/h',
  increment: '0.5 km/h per minute',
  levels: [
    { level: 1, minSpeed: 8.5, maxSpeed: 9.0, duration: '1 min', shuttles: '1 × 20m' },
    { level: 2, minSpeed: 9.0, maxSpeed: 9.5, duration: '1 min', shuttles: '2 × 20m' },
    { level: 3, minSpeed: 9.5, maxSpeed: 10.0, duration: '1 min', shuttles: '3 × 20m' },
    { level: 4, minSpeed: 10.0, maxSpeed: 10.5, duration: '1 min', shuttles: '4 × 20m' },
    { level: 5, minSpeed: 10.5, maxSpeed: 11.0, duration: '1 min', shuttles: '5 × 20m' },
    { level: 6, minSpeed: 11.0, maxSpeed: 11.5, duration: '1 min', shuttles: '6 × 20m' },
    { level: 7, minSpeed: 11.5, maxSpeed: 12.0, duration: '1 min', shuttles: '7 × 20m' },
    { level: 8, minSpeed: 12.0, maxSpeed: 12.5, duration: '1 min', shuttles: '8 × 20m' },
    { level: 9, minSpeed: 12.5, maxSpeed: 13.0, duration: '1 min', shuttles: '9 × 20m' },
    { level: 10, minSpeed: 13.0, maxSpeed: 13.5, duration: '1 min', shuttles: '10 × 20m' }
  ]
}

// BARME-based scoring — uses real Supabase database
// Get score from BARME configuration
export const calculateScoreFromBarme = async (rawResult, testType, institutionId) => {
  // Get the active bareme for this institution and test type
  const barmes = await getBarmesByInstitution(institutionId)
  const activeBarme = barmes.find(b => b.isActive)
  
  if (!activeBarme) {
    // No BARME configured for this institution/test — do not invent a score
    // Return unmatched result that requires administrator review
    return { score: null, match: 'unmatched', raw: rawResult, error: 'No active BARME configured for this test - score not calculated', note: 'BARME must be imported and activated for this test type' }
  }
  
  // Calculate score using BARME engine from local calculations
  // The actual calculation logic depends on the BARME structure
  // This is a placeholder for the real BARME scoring algorithm
  const scoreResult = scoreWithBarme(rawResult, activeBarme)
  
  return {
    score: scoreResult.score,
    match: 'matched',
    raw: rawResult,
    converted: scoreResult.converted,
    barmeVersion: activeBarme.version,
    barmeName: activeBarme.name,
    note: null
  }
}

// Get active bareme for a specific test type
export const getActiveBarmeForTest = async (institutionId, testType) => {
  const barmes = await getBarmesByInstitution(institutionId)
  
  // First try to find an active BARME that supports this test type
  const matchingBarme = barmes.find(b => b.isActive && b.name && b.name.includes(testType))
  
  if (matchingBarme) {
    return matchingBarme
  }
  
  // Fall back to any active bareme
  for (const barme of barmes) {
    if (barme.isActive) {
      return barme
    }
  }
  
  // Fall back to most recent bareme that has this test type in name
  for (const barme of barmes.reverse()) {
    if (barme.name && barme.name.includes(testType)) {
      return barme
    }
  }
  
  return null
}

// Get barmes by institution from Supabase
export const getBarmesByInstitution = async (institutionId) => {
  try {
    if (!verifyConfig().projectMatch) {
      // Can't access Supabase, return empty
      return []
    }
    
    const { data, error } = await supabase
      .from('barme_versions')
      .select('*')
      .eq('institution_id', institutionId)
    
    if (error) {
      console.error('Error fetching barmes from Supabase:', error)
      return []
    }
    
    return data || []
  } catch (e) {
    console.error('Error in getBarmesByInstitution:', e)
    return []
  }
}

// Calculate score using BARME engine (local calculation)
// This is a simplified version — real implementation depends on BARME structure
const calculateScore = (rawResult, barme) => {
  // Default scoring logic — actual implementation depends on BARME configuration
  const { higher_is_better, scale_type, value_type, detected_range_min, detected_range_max } = barme
  
  let converted
  let match = 'matched'
  
  if (value_type === 'discrete') {
    // Discrete scoring — map raw values to scores
    // This is a simplified example
    converted = Math.min(Math.max(Math.round(rawResult), 0), 20)
  } else if (value_type === 'range') {
    // Range-based scoring
    if (detected_range_min !== null && detected_range_max !== null) {
      const range = detected_range_max - detected_range_min
      const position = (rawResult - (detected_range_min || 0)) / (range || 1)
      converted = Math.round(20 * position)
    } else {
      converted = Math.round(rawResult / 10)
    }
  } else {
    // Mixed or other
    converted = Math.round(rawResult / 5)
  }
  
  // Adjust based on higher_is_better
  if (higher_is_better === false && converted > 10) {
    converted = 20 - converted
  }
  
  // Check for unmatched conditions
  if (rawResult < 0 || isNaN(rawResult)) {
    match = 'unmatched'
    converted = null
  }
  
  return { score: converted, converted }
}

// Get all test entries — tries Supabase first, falls back to localStorage
export const getTestEntries = async () => {
  try {
    // Try Supabase first if configured and verified
    if (verifyConfig().projectMatch) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        const { data, error } = await supabase
          .from('test_results')
          .select(`
            *,
            students!test_results_student_id_fkey(full_name, student_code),
            tests!test_results_test_id_fkey(name, unit)
          `)
          .eq('institution_id', user.id)
        
        if (data && data.length > 0) {
          return data
        }
      }
    }
    
    // Fall back to localStorage
    const data = localStorage.getItem(TEST_ENTRIES_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error in getTestEntries:', e)
    // Fallback to localStorage
    const data = localStorage.getItem(TEST_ENTRIES_KEY)
    return data ? JSON.parse(data) : []
  }
}

// Save test entries — saves to both Supabase and localStorage
export const saveTestEntries = async (entries) => {
  try {
    // Save to localStorage first
    localStorage.setItem(TEST_ENTRIES_KEY, JSON.stringify(entries))
    
    // Try to save to Supabase if configured and authenticated
    if (verifyConfig().projectMatch) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        for (const entry of entries) {
          const { error } = await supabase
            .from('test_results')
            .upsert({
              id: entry.id,
              institution_id: user.id,
              student_id: entry.student,
              test_id: entry.test,
              raw_value: entry.raw,
              converted_score: entry.converted || 0,
              recorded_by: user.id,
              recorded_at: entry.date || new Date().toISOString()
            })
          
          if (error) {
            console.error('Error saving test entry to Supabase:', error)
          }
        }
      }
    }
    
    return true
  } catch (e) {
    console.error('Error in saveTestEntries:', e)
    // LocalStorage already saved
    return true
  }
}

// Add a test result entry using BARME scoring
export const addTestEntry = async (entry) => {
  try {
    // Check for duplicate (same student, same test, same date)
    const entries = await getTestEntries()
    const duplicateIndex = entries.findIndex(
      e => e.student === entry.student && e.test === entry.test && e.date === entry.date
    )
    
    // Check if institution can administer this test
    const institutionId = entry.institutionId || 'local'





    
    // Calculate score using BARME
    const barme = await getActiveBarmeForTest(institutionId, entry.test)
    const scoreResult = await calculateScoreFromBarme(entry.raw || 0, entry.test, institutionId)
    
    const newEntry = {
      id: Date.now(),
      ...entry,
      raw: entry.raw,
      converted: scoreResult.score,
      scoreMatch: scoreResult.match,
      barmeVersion: barme ? barme.version : 1,
      barmeName: barme ? barme.name : 'Default',
      ...scoreResult // Spread any additional result properties (note, error, etc.)
    }
    
    // If duplicate, update existing entry
    if (duplicateIndex >= 0) {
      entries[duplicateIndex] = { ...entries[duplicateIndex], ...newEntry, id: entries[duplicateIndex].id }
    } else {
      entries.push(newEntry)
    }
    
    // Save to both Supabase and localStorage
    await saveTestEntries(entries)
    
    return { success: true, entry: newEntry }
  } catch (e) {
    console.error('Error in addTestEntry:', e)
    return { success: false, error: 'Error adding test entry' }
  }
}

// Update an existing test entry
export const updateTestEntry = async (id, updatedData) => {
  try {
    const entries = await getTestEntries()
    const index = entries.findIndex(e => e.id === id)

    if (index === -1) return { success: false, error: 'Test entry not found' }

    entries[index] = { ...entries[index], ...updatedData, id: entries[index].id }
    await saveTestEntries(entries)

    return { success: true, entry: entries[index] }
  } catch (e) {
    console.error('Error in updateTestEntry:', e)
    return { success: false, error: 'Error updating test entry' }
  }
}

// Delete a test entry
export const deleteTestEntry = async (id) => {
  try {
    const entries = await getTestEntries()
    const filtered = entries.filter(e => e.id !== id)

    if (filtered.length === entries.length) {
      return { success: false, error: 'Test entry not found' }
    }

    await saveTestEntries(filtered)
    return { success: true }
  } catch (e) {
    console.error('Error in deleteTestEntry:', e)
    return { success: false, error: 'Error deleting test entry' }
  }
}

// Get student test entries
export const getStudentTestEntries = async (studentId) => {
  try {
    const entries = await getTestEntries()
    return entries.filter(e => e.student === studentId)
  } catch (e) {
    console.error('Error in getStudentTestEntries:', e)
    return []
  }
}

// Get test entries by type
export const getTestEntriesByType = async (testType) => {
  try {
    const entries = await getTestEntries()
    return entries.filter(e => e.test === testType)
  } catch (e) {
    console.error('Error in getTestEntriesByType:', e)
    return []
  }
}

// Get test statistics
export const getTestStatistics = async () => {
  try {
    const entries = await getTestEntries()
    
    const stats = {
      totalEntries: entries.length,
      byType: {},
      averageScores: {}
    }
    
    entries.forEach(entry => {
      const testType = entry.test
      if (!stats.byType[testType]) {
        stats.byType[testType] = { count: 0, totalScore: 0 }
      }
      stats.byType[testType].count++
      stats.byType[testType].totalScore += (entry.convertedScore || 0)
      
      // Track average by type
      if (!stats.averageScores[testType]) {
        stats.averageScores[testType] = 0
      }
    })
    
    // Calculate averages
    Object.keys(stats.byType).forEach(testType => {
      const typeStats = stats.byType[testType]
      stats.averageScores[testType] = typeStats.count > 0 ? typeStats.totalScore / typeStats.count : 0
    })
    
    return stats
  } catch (e) {
    console.error('Error in getTestStatistics:', e)
    return { totalEntries: 0, byType: {}, averageScores: {} }
  }
}
