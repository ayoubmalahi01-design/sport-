// Institution Repository - with Supabase backend
// Manages institution data and settings with localStorage fallback
// Future Supabase: institutions table with RLS policies

import { supabase, verifyConfig } from '../lib/supabaseClient'

const INSTITUTIONS_KEY = 'sp_institutions'
const CURRENT_INSTITUTION_KEY = 'sp_current_institution'

// Default institution structure
const INSTITUTION_DEFAULTS = {
  name: 'المؤسسة الرياضية النموذجية',
  logo: '',
  absenceReasons: ['غياب عادي', 'رخصة', 'إعفاء', 'واجب'],
  scoringTables: {},
  // BARME (Scoring Scales) per institution - each institution defines its own
  baremes: [],
  // Institution-specific sports infrastructure configuration
  infrastructure: {
    // Sports facilities available at this institution
    facilities: {
      runningTrack: false,
      gym: false,
      field: false,
      pool: false,
      other: []
    },
    // Available sports equipment
    equipment: {
      cones: false,
      hurdles: false,
      mats: false,
      weights: false,
      timers: false,
      measuringTape: false,
      other: []
    }
  },
  // Per-institution test program - which tests are enabled
  testProgram: {
    'Test Navette — Léger 20m': true,
    Pompes: true,
    Abdominaux: true,
    'Barre fixe': true
  }
}

// Check if Supabase is configured and connection is verified
const supabaseConfigVerified = verifyConfig().projectMatch

// =============================================================================
// INSTITUTION CRUD OPERATIONS
// Uses Supabase as primary data source, localStorage as fallback
// =============================================================================

// Get all institutions — tries Supabase first, falls back to localStorage
export const getInstitutions = async () => {
  try {
    // Try Supabase first if configured and verified
    if (supabaseConfigVerified) {
      const { data, error } = await supabase
        .from('institutions')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Error fetching institutions from Supabase:', error)
        // Fall back to localStorage
      } else if (data && data.length > 0) {
        return data
      }
    }
    
    // Fall back to localStorage
    const data = localStorage.getItem(INSTITUTIONS_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error in getInstitutions:', e)
    // Fallback to localStorage
    const data = localStorage.getItem(INSTITUTIONS_KEY)
    return data ? JSON.parse(data) : []
  }
}

// Get current institution — tries Supabase first, falls back to localStorage
export const getCurrentInstitution = async () => {
  try {
    // Try Supabase first if configured and verified
    if (supabaseConfigVerified) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        
        if (data) {
          // Transform to match expected UI structure
          return {
            id: data.id || Date.now().toString(),
            name: data.name || 'المؤسسة الرياضية النموذجية',
            logo: data.logo_url || '',
            absenceReasons: data.absenceReasons || ['غياب عادي', 'رخصة', 'إعفاء', 'واجب'],
            scoringTables: data.scoringTables || {},
            baremes: data.baremes || [],
            infrastructure: data.infrastructure || {
              facilities: { runningTrack: false, gym: false, field: false, pool: false, other: [] },
              equipment: { cones: false, hurdles: false, mats: false, weights: false, timers: false, measuringTape: false, other: [] }
            },
            testProgram: data.testProgram || {
              'Test Navette — Léger 20m': true,
              Pompes: true,
              Abdominaux: true,
              'Barre fixe': true
            }
          }
        }
      }
    }
    
    // Fall back to localStorage
    const data = localStorage.getItem(CURRENT_INSTITUTION_KEY)
    return data ? JSON.parse(data) : { ...INSTITUTION_DEFAULTS }
  } catch (e) {
    console.error('Error in getCurrentInstitution:', e)
    // Fallback to localStorage
    const data = localStorage.getItem(CURRENT_INSTITUTION_KEY)
    return data ? JSON.parse(data) : { ...INSTITUTION_DEFAULTS }
  }
}

// Set current institution — updates both Supabase profiles and localStorage
export const setCurrentInstitution = async (institution) => {
  try {
    // Update localStorage first for immediate UI responsiveness
    localStorage.setItem(CURRENT_INSTITUTION_KEY, JSON.stringify(institution))
    
    // Try to update Supabase profiles if authenticated and configured
    if (supabaseConfigVerified) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        // Update the profiles table with institution data
        const { error } = await supabase
          .from('profiles')
          .update({ 
            institution_id: institution.id,
            ...(institution.name && { name: institution.name }),
            ...(institution.logo && { logo_url: institution.logo })
          })
          .eq('id', user.id)
        
        if (error) {
          console.error('Error updating institution in Supabase:', error)
          // LocalStorage already updated, so user has local view
        } else {
          // Successfully updated in Supabase
        }
      }
    }
    
    return true
  } catch (e) {
    console.error('Error in setCurrentInstitution:', e)
    // LocalStorage already updated
    return true
  }
}

// Save all institutions — saves to both Supabase and localStorage
export const saveInstitutions = async (institutions) => {
  try {
    // Save to localStorage first
    localStorage.setItem(INSTITUTIONS_KEY, JSON.stringify(institutions))
    
    // Try to save to Supabase if configured and authenticated
    if (supabaseConfigVerified) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        // For now, we update the current institution's data
        // Full institutional CRUD would require a more complex approach
        // This ensures the current institution's data syncs
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            institution_id: institutions[0]?.id,
            role: 'coach'


          })
        
        if (error) {
          console.error('Error saving institutions to Supabase:', error)
        }
      }
    }
    
    return true
  } catch (e) {
    console.error('Error in saveInstitutions:', e)
    // LocalStorage already saved
    return true
  }
}

// Add a new institution
export const addInstitution = async (name, logoUrl = '') => {
  try {
    const institutions = await getInstitutions()
    
    // Check for duplicate name
    if (institutions.some(inst => inst.name === name)) {
      return { success: false, error: 'اسم المؤسسة موجود بالفعل' }
    }
    
    const newInst = {
      id: Date.now().toString(),
      name,
      logo: logoUrl,
      createdAt: new Date().toISOString(),
      ...INSTITUTION_DEFAULTS
    }
    
    institutions.push(newInst)
    
    // Save to both Supabase and localStorage
    await saveInstitutions(institutions)
    
    // Set as current institution
    await setCurrentInstitution(newInst)
    
    return { success: true, institution: newInst }
  } catch (e) {
    console.error('Error in addInstitution:', e)
    return { success: false, error: 'Error adding institution' }
  }
}

// Update institution
export const updateInstitution = async (id, updatedData) => {
  try {
    const institutions = await getInstitutions()
    const index = institutions.findIndex(inst => inst.id === id)
    
    if (index === -1) return { success: false, error: 'Institution not found' }
    
    institutions[index] = { ...institutions[index], ...updatedData }
    
    // Save to both Supabase and localStorage
    await saveInstitutions(institutions)
    
    // Set as current if it's the current institution
    if (getCurrentInstitution().id === id) {
      await setCurrentInstitution(institutions[index])
    }
    
    return { success: true }
  } catch (e) {
    console.error('Error in updateInstitution:', e)
    return { success: false, error: 'Error updating institution' }
  }
}

// Remove institution (only if not current)
export const removeInstitution = async (id) => {
  try {
    const current = await getCurrentInstitution()
    if (current.id === id) return { success: false, error: 'Cannot remove current institution' }
    
    const institutions = await getInstitutions().filter(inst => inst.id !== id)
    
    // Save to both Supabase and localStorage
    await saveInstitutions(institutions)
    
    // If current institution was removed, reset to default
    const currentInstit = await getCurrentInstitution()
    if (currentInstit.id === id) {
      await setCurrentInstitution({ ...INSTITUTION_DEFAULTS })
    }
    
    return { success: true }
  } catch (e) {
    console.error('Error in removeInstitution:', e)
    return { success: false, error: 'Error removing institution' }
  }
}

// Get absence reasons for current institution
export const getAbsenceReasons = async () => {
  const current = await getCurrentInstitution()
  return current.absenceReasons || ['غياب عادي', 'رخصة', 'إعفاء', 'واجب']
}

// Update absence reasons
export const updateAbsenceReasons = async (reasons) => {
  return await updateInstitution(await getCurrentInstitution().id, { absenceReasons: reasons })
}

// Get scoring tables for current institution
export const getScoringTables = async () => {
  const current = await getCurrentInstitution()
  return current.scoringTables || {}
}

// Update scoring tables
export const updateScoringTables = async (tables) => {
  return await updateInstitution(await getCurrentInstitution().id, { scoringTables: tables })
}

// BARME (Scoring Scale) management per institution

// Get barmes for current institution
export const getCurrentInstitutionBarmes = async () => {
  try {
    // Try Supabase first
    if (supabaseConfigVerified) {
      const userId = await supabase.auth.getUser()
      const { data: { user} } = await userId
      
      if (user) {
        const { data, error } = await supabase
          .from('barme_versions')
          .select('*')
          .eq('institution_id', user.id)
        
        if (data && data.length > 0) {
          return data
        }
      }
    }
    
    // Fall back to localStorage
    const current = await getCurrentInstitution()
    return current.baremes || []
  } catch (e) {
    console.error('Error in getCurrentInstitutionBarmes:', e)
    // Fallback to localStorage
    const current = await getCurrentInstitution()
    return current.baremes || []
  }
}

// Get active bareme for current institution
export const getCurrentActiveBarme = async () => {
  try {
    const barmes = await getCurrentInstitutionBarmes()
    return barmes.find(b => b.isActive) || barmes[barmes.length - 1] || null
  } catch (e) {
    console.error('Error in getCurrentActiveBarme:', e)
    return null
  }
}

// Get all barmes for current institution with status
export const getBarmesWithStatus = async () => {
  try {
    const barmes = await getCurrentInstitutionBarmes()
    return barmes || []
  } catch (e) {
    console.error('Error in getBarmesWithStatus:', e)
    return []
  }
}

// Add a new bareme to current institution
export const addBarme = async (barmeData) => {
  try {
    const institutions = await getInstitutions()
    const currentInstitution = await getCurrentInstitution()
    const currentInstIndex = institutions.findIndex(inst => inst.id === currentInstitution.id)
    
    if (currentInstIndex === -1) return { success: false, error: 'Current institution not found' }
    
    const newBarme = {
      id: Date.now().toString(),
      name: barmeData.name,
      description: barmeData.description || '',
      source: barmeData.source || 'manual',
      status: 'pending',
      originalTable: barmeData.originalTable || [],
      structuredConfiguration: barmeData.structuredConfiguration || {},
      analysis: barmeData.analysis || {},
      institution_id: institutions[currentInstIndex].id,  // Use institution ID from localStorage
      created_at: new Date().toISOString(),
      created_by: (await supabase.auth.getUser()).then(r => r.data?.user?.id || 'legacy'),
      version: 1,
      isActive: false
    }
    
    // Add to localStorage institutions
    institutions[currentInstIndex].baremes.push(newBarme)
    await saveInstitutions(institutions)
    
    // Also add to Supabase barmes table if configured
    if (supabaseConfigVerified) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        const { error } = await supabase
          .from('barme_versions')
          .insert({
            id: newBarme.id,
            institution_id: newBarme.institution_id,
            name: newBarme.name,
            description: newBarme.description,
            source: newBarme.source,
            status: 'pending',
            version: 1,
            isActive: false,
            original_table_json: JSON.stringify(newBarme.originalTable),
            structured_config_json: JSON.stringify(newBarme.structuredConfiguration),
            analysis: JSON.stringify(newBarme.analysis),
            created_at: newBarme.created_at,
            created_by: user.id
          })
        
        if (error) {
          console.error('Error adding bareme to Supabase:', error)
          // LocalStorage already updated
        }
      }
    }
    
    return { success: true, barme: newBarme }
  } catch (e) {
    console.error('Error in addBarme:', e)
    return { success: false, error: 'Error adding bareme' }
  }
}

// Set a bareme as active for current institution
export const setActiveBarme = async (barmeId) => {
  try {
    const institutions = await getInstitutions()
    const currentInstitution = await getCurrentInstitution()
    const currentInstIndex = institutions.findIndex(inst => inst.id === currentInstitution.id)
    
    if (currentInstIndex === -1) return { success: false, error: 'Current institution not found' }
    
    // Deactivate all barmes for this institution
    institutions[currentInstIndex].baremes.forEach(b => {
      b.isActive = false
    })
    
    // Activate the selected bareme
    const barmeToActivate = institutions[currentInstIndex].baremes.find(b => b.id === barmeId)
    if (barmeToActivate) {
      barmeToActivate.isActive = true
      barmeToActivate.activated_at = new Date().toISOString()
      barmeToActivate.activated_by = (await supabase.auth.getUser()).then(r => r.data?.user?.id || 'legacy')
    }
    
    // Save to localStorage
    await saveInstitutions(institutions)
    
    // Also update in Supabase barmes table if configured
    if (supabaseConfigVerified) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        // Update the bareme in Supabase
        const { error } = await supabase
          .from('barme_versions')
          .update({ isActive: true, activated_at: new Date().toISOString(), activated_by: user.id })
          .eq('id', barmeId)
          .eq('institution_id', user.id)
        
        if (error) {
          console.error('Error activating bareme in Supabase:', error)
          // LocalStorage already updated
        }
      }
    }
    
    return { success: true }
  } catch (e) {
    console.error('Error in setActiveBarme:', e)
    return { success: false, error: 'Error activating bareme' }
  }
}

// Update a bareme
export const updateBarme = async (barmeId, updatedData) => {
  try {
    const institutions = await getInstitutions()
    const currentInstitution = await getCurrentInstitution()
    const currentInstIndex = institutions.findIndex(inst => inst.id === currentInstitution.id)
    
    if (currentInstIndex === -1) return { success: false, error: 'Current institution not found' }
    
    const barme = institutions[currentInstIndex].baremes.find(b => b.id === barmeId)
    if (!barme) return { success: false, error: 'Barme not found in institution' }
    
    // Update the bareme
    Object.assign(barme, updatedData)
    
    // If status is validated, update version
    if (updatedData.status === 'validated' && barme.version) {
      barme.version += 1
    }
    
    // Save to localStorage
    await saveInstitutions(institutions)
    
    // Also update in Supabase barmes table if configured
    if (supabaseConfigVerified) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        const { error } = await supabase
          .from('barme_versions')
          .update({ 
            status: updatedData.status,
            version: barme.version,
            updated_at: new Date().toISOString()
          })
          .eq('id', barmeId)
          .eq('institution_id', user.id)
        
        if (error) {
          console.error('Error updating bareme in Supabase:', error)
          // LocalStorage already updated
        }
      }
    }
    
    return { success: true }
  } catch (e) {
    console.error('Error in updateBarme:', e)
    return { success: false, error: 'Error updating bareme' }
  }
}

// Remove a bareme (only if not active and not the last one)
export const removeBarme = async (barmeId) => {
  try {
    const institutions = await getInstitutions()
    const currentInstitution = await getCurrentInstitution()
    const currentInstIndex = institutions.findIndex(inst => inst.id === currentInstitution.id)
    
    if (currentInstIndex === -1) return { success: false, error: 'Current institution not found' }
    
    // Check if it's the last bareme
    const currentBarmes = institutions[currentInstIndex].baremes
    if (currentBarmes.length <= 1) {
      return { success: false, error: 'Cannot remove the only bareme' }
    }
    
    // Check if it's active
    if (currentBarmes.some(b => b.id === barmeId && b.isActive)) {
      return { success: false, error: 'Cannot remove an active bareme. Deactivate first.' }
    }
    
    // Remove from localStorage institutions
    institutions[currentInstIndex].baremes = currentBarmes.filter(b => b.id !== barmeId)
    await saveInstitutions(institutions)
    
    // Also remove from Supabase barmes table if configured
    if (supabaseConfigVerified) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        const { error } = await supabase
          .from('barme_versions')
          .delete()
          .eq('id', barmeId)
          .eq('institution_id', user.id)
        
        if (error) {
          console.error('Error removing bareme from Supabase:', error)
          // LocalStorage already updated
        }
      }
    }
    
    return { success: true }
  } catch (e) {
    console.error('Error in removeBarme:', e)
    return { success: false, error: 'Error removing bareme' }
  }
}

// BARME Infrastructure and Test Program Management

// Get institution infrastructure configuration
export const getInstitutionInfrastructure = async (institutionId) => {
  try {
    // Try Supabase first
    if (supabaseConfigVerified) {
      const { data, error } = await supabase
        .from('infrastructure')
        .select('*')
        .eq('institution_id', institutionId)
      
      if (data && data.length > 0) {
        const facilities = {}
        data.forEach(f => {
          facilities[f.facility_name] = f.is_active
        })
        
        const equipment = {}
        // Would need institution_equipment table
        
        return {
          facilities,
          equipment: {},  // Would be fetched from separate table
          testProgram: {}  // Would be fetched from separate table
        }
      }
    }
    
    // Fall back to localStorage
    const institutions = await getInstitutions()
    const instIndex = institutions.findIndex(inst => inst.id === institutionId)
    if (instIndex === -1) return { facilities: {}, equipment: {}, testProgram: {} }
    
    const inst = institutions[instIndex]
    return {
      facilities: inst.infrastructure?.facilities || { runningTrack: false, gym: false, field: false, pool: false, other: [] },
      equipment: inst.infrastructure?.equipment || { cones: false, hurdles: false, mats: false, weights: false, timers: false, measuringTape: false, other: [] },
      testProgram: inst.testProgram || { 'Test Navette — Léger 20m': true, Pompes: true, Abdominaux: true, 'Barre fixe': true }
    }
  } catch (e) {
    console.error('Error in getInstitutionInfrastructure:', e)
    // Fallback to localStorage
    const institutions = await getInstitutions()
    const instIndex = institutions.findIndex(inst => inst.id === institutionId)
    if (instIndex === -1) return { facilities: {}, equipment: {}, testProgram: {} }
    
    const inst = institutions[instIndex]
    return {
      facilities: inst.infrastructure?.facilities || { runningTrack: false, gym: false, field: false, pool: false, other: [] },
      equipment: inst.infrastructure?.equipment || { cones: false, hurdles: false, mats: false, weights: false, timers: false, measuringTape: false, other: [] },
      testProgram: inst.testProgram || { 'Test Navette — Léger 20m': true, Pompes: true, Abdominaux: true, 'Barre fixe': true }
    }
  }
}

// Get institution test program (which tests are enabled)
export const getInstitutionTestProgram = async (institutionId) => {
  try {
    // Try Supabase first
    if (supabaseConfigVerified) {
      const { data, error } = await supabase
        .from('institution_test_program')
        .select('test_id, is_enabled')
        .eq('institution_id', institutionId)
      
      if (data && data.length > 0) {
        const testProgram = {}
        data.forEach(row => {
          testProgram[row.test_id] = row.is_enabled
        })
        return testProgram
      }
    }
    
    // Fall back to localStorage
    const institutions = await getInstitutions()
    const instIndex = institutions.findIndex(inst => inst.id === institutionId)
    if (instIndex === -1) return { 'Test Navette — Léger 20m': true, Pompes: true, Abdominaux: true, 'Barre fixe': true }
    
    return institutions[instIndex].testProgram || { 'Test Navette — Léger 20m': true, Pompes: true, Abdominaux: true, 'Barre fixe': true }
  } catch (e) {
    console.error('Error in getInstitutionTestProgram:', e)
    // Fallback to localStorage
    const institutions = await getInstitutions()
    const instIndex = institutions.findIndex(inst => inst.id === institutionId)
    if (instIndex === -1) return { 'Test Navette — Léger 20m': true, Pompes: true, Abdominaux: true, 'Barre fixe': true }
    
    return institutions[instIndex].testProgram || { 'Test Navette — Léger 20m': true, Pompes: true, Abdominaux: true, 'Barre fixe': true }
  }
}

// Check if institution can administer a specific test
export const institutionHasTest = async (institutionId, testType) => {
  const testProgram = await getInstitutionTestProgram(institutionId)
  return testProgram[testType] === true
}

// Set institution facilities configuration
export const setInstitutionFacilities = async (institutionId, facilities) => {
  try {
    const institutions = await getInstitutions()
    const instIndex = institutions.findIndex(inst => inst.id === institutionId)
    
    if (instIndex === -1) return { success: false, error: 'Institution not found' }
    
    // Merge provided facilities with defaults
    const currentFacilities = institutions[instIndex].infrastructure?.facilities || {}
    institutions[instIndex].infrastructure = {
      facilities: { ...currentFacilities, ...facilities },
      equipment: institutions[instIndex].infrastructure?.equipment || { cones: false, hurdles: false, mats: false, weights: false, timers: false, measuringTape: false, other: [] }
    }
    
    // Save to localStorage
    await saveInstitutions(institutions)
    
    // Try to save to Supabase institution_facilities table if configured
    if (supabaseConfigVerified) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        // Would need to insert/update institution_facilities table
        // For now, localStorage sync is the primary mechanism
      }
    }
    
    return { success: true }
  } catch (e) {
    console.error('Error in setInstitutionFacilities:', e)
    return { success: false, error: 'Error setting institution facilities' }
  }
}

// Set institution equipment configuration
export const setInstitutionEquipment = async (institutionId, equipment) => {
  try {
    const institutions = await getInstitutions()
    const instIndex = institutions.findIndex(inst => inst.id === institutionId)
    
    if (instIndex === -1) return { success: false, error: 'Institution not found' }
    
    const currentEquipment = institutions[instIndex].infrastructure?.equipment || {}
    institutions[instIndex].infrastructure = {
      facilities: institutions[instIndex].infrastructure?.facilities || { runningTrack: false, gym: false, field: false, pool: false, other: [] },
      equipment: { ...currentEquipment, ...equipment }
    }
    
    // Save to localStorage
    await saveInstitutions(institutions)
    
    return { success: true }
  } catch (e) {
    console.error('Error in setInstitutionEquipment:', e)
    return { success: false, error: 'Error setting institution equipment' }
  }
}

// Set institution test program (enable/disable tests)
export const setInstitutionTestProgram = async (institutionId, testProgram) => {
  try {
    const institutions = await getInstitutions()
    const instIndex = institutions.findIndex(inst => inst.id === institutionId)
    
    if (instIndex === -1) return { success: false, error: 'Institution not found' }
    
    // Validate that testProgram is an object
    if (typeof testProgram !== 'object') return { success: false, error: 'Invalid test program format' }
    
    // Update the test program
    institutions[instIndex].testProgram = testProgram
    
    // Save to localStorage
    await saveInstitutions(institutions)
    
    // Try to save to Supabase institution_test_program table if configured
    if (supabaseConfigVerified) {
      const { data: { user} } = await supabase.auth.getUser()
      if (user) {
        // Would upsert into institution_test_program table
        // For now, localStorage sync is the primary mechanism
        for (const [testName, enabled] of Object.entries(testProgram)) {
          const { error } = await supabase
            .from('institution_test_program')
            .upsert({
              institution_id: user.id,
              test_id: testName,  // Would use test IDs, not names
              is_enabled: enabled
            })

          if (error) {
            console.error('Error saving test program to Supabase:', error)
          }
        }
      }
    }

    return { success: true }
  } catch (e) {
    console.error('Error in setInstitutionTestProgram:', e)
    return { success: false, error: 'Error setting institution test program' }
  }
}

// Get available tests for an institution (only enabled ones)
export const getAvailableTests = async (institutionId) => {
  const testProgram = await getInstitutionTestProgram(institutionId)
  const available = []
  const allTests = ['Test Navette — Léger 20m', 'Pompes', 'Abdominaux', 'Barre fixe']
  allTests.forEach(test => {
    if (testProgram[test] === true) available.push(test)
  })
  return available
}

