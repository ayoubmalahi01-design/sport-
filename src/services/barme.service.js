// BARME (Scoring Scale) Repository - Local Storage
// Manages institution-specific scoring scales with import, analysis, and automatic scoring
// WARNING: localStorage is not secure! Real confidentiality requires Supabase
// authentication and Row Level Security (RLS). This is a simulation for development.

const BARMES_KEY = 'sp_barmes'
const INSTITUTIONS_KEY = 'sp_institutions'
const COACH_ID_KEY = 'sp_current_coach_id'

// Initialize barmes if not exists
if (!localStorage.getItem(BARMES_KEY)) {
  localStorage.setItem(BARMES_KEY, JSON.stringify([]))
}

// Get all barmes
export const getBarmes = () => {
  try {
    const data = localStorage.getItem(BARMES_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error loading barmes:', e)
    return []
  }
}

// Save barmes
export const saveBarmes = (barmes) => {
  try {
    localStorage.setItem(BARMES_KEY, JSON.stringify(barmes))
    return true
  } catch (e) {
    console.error('Error saving barmes:', e)
    return false
  }
}

// Get current institution ID
export const getCurrentInstitutionId = () => {
  try {
    const institutions = JSON.parse(localStorage.getItem(INSTITUTIONS_KEY) || '[]')
    return institutions.length > 0 ? institutions[0]?.id || null : null
  } catch (e) {
    console.error('Error loading institution ID:', e)
    return null
  }
}

// Get current coach ID
export const getCurrentCoachId = () => {
  try {
    return localStorage.getItem(COACH_ID_KEY) || 'legacy'
  } catch (e) {
    console.error('Error loading coach ID:', e)
    return 'legacy'
  }
}

// BARME types (tests/activities)
export const BARME_TYPES = {
  RUNNING: 'Running',
  STRENGTH: 'Strength',
  ENDURANCE: 'Endurance',
  FLEXIBILITY: 'Flexibility',
  COORDINATION: 'Coordination'
}

// Import status
export const IMPORT_STATUS = {
  PENDING: 'pending',
  ANALYZED: 'analyzed',
  VALIDATED: 'validated',
  ACTIVE: 'active',
  ARCHIVED: 'archived'
}

// Import a bareme from various sources
export const importBarme = (source, data, institutionId, name, description = '') => {
  const barmes = getBarmes()
  
  // Analyze the imported data
  const analysis = analyzeBarmeData(data, name, source)
  
  const newBarme = {
    id: Date.now().toString(),
    name,
    description,
    source,
    status: IMPORT_STATUS.PENDING,
    originalTable: data, // Preserve original imported table
    structuredConfiguration: analysis.structuredConfig, // Structured version
    analysis: analysis, // Analysis details
    institution_id: institutionId,
    created_at: new Date().toISOString(),
    created_by: getCurrentCoachId(),
    version: 1,
    isActive: false
  }
  
  barmes.unshift(newBarme)
  saveBarmes(barmes)
  return { success: true, barme: newBarme, analysis }
}

// Analyze imported bareme data
export const analyzeBarmeData = (data, name, source) => {
  const structuredConfig = {
    testName: name,
    scaleType: null, // e.g., '20', '10', '100', 'discrete'
    higherIsBetter: null, // true if higher performance = higher score
    thresholds: [], // Array of { rawValue, score, level }
    categories: [], // Array of { minRaw, maxRaw, score, label }
    rawColumnIndex: null, // Which column contains raw values
    scoreColumnIndex: null, // Which column contains scores
    valueType: null, // 'exact', 'range', 'threshold'
    detectedRange: { min, max }, // Detected performance range
    ambiguities: [], // List of detected ambiguities
    warnings: [] // List of warnings
  }
  
  // Parse the data - handle array of arrays or string data
  const rows = parseImportData(data)
  
  if (rows.length === 0) {
    return {
      structuredConfig: { ...structuredConfig, warnings: ['No data found in imported source'] },
      ambiguities: ['Empty data source']
    }
  }
  
  // Try to detect structure
  let detectedHigherIsBetter = null
  let detectedScaleType = null
  const ambiguities = []
  const warnings = []
  const thresholds = []
  const categories = []
  
  // Analyze rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.length < 2) {
      warnings.push(`Row ${i + 1}: Too few columns (less than 2)`)
      continue
    }
    
    const rawValue = parseValue(row[0])
    const scoreValue = parseValue(row[1])
    
    if (isNaN(rawValue) && row[0] !== undefined) {
      ambiguities.push(`Row ${i + 1}: Cannot parse raw value: "${row[0]}"`)
      continue
    }
    
    if (isNaN(scoreValue) && row[1] !== undefined) {
      ambiguities.push(`Row ${i + 1}: Cannot parse score value: "${row[1]}"`)
      continue
    }
    
    // Detect if higher raw value = higher score
    if (detectedHigherIsBetter === null && !isNaN(rawValue) && !isNaN(scoreValue)) {
      detectedHigherIsBetter = rawValue < rawValue // Will be set after comparing pairs
    }
    
    // Try to detect scale type from score values
    if (detectedScaleType === null && !isNaN(scoreValue)) {
      if (scoreValue >= 80) detectedScaleType = '100'
      else if (scoreValue >= 20) detectedScaleType = '20'
      else if (scoreValue >= 10) detectedScaleType = '10'
    }
    
    // Store threshold/range data
    if (!isNaN(rawValue) && !isNaN(scoreValue)) {
      thresholds.push({
        rawValue,
        score: scoreValue,
        level: i + 1,
        sourceRow: i
      })
    }
  }
  
  // Determine higher/lower is better by comparing first few valid pairs
  let higherIsBetter = null
  if (detectedHigherIsBetter !== null) {
    higherIsBetter = detectedHigherIsBetter
  } else {
    // Default: if scores increase with raw values, it's "higher is better"
    // We need at least 2 pairs to determine
    const validPairs = []
    for (let i = 0; i < thresholds.length - 1; i++) {
      for (let j = i + 1; j < thresholds.length; j++) {
        const rawI = thresholds[i].rawValue
        const rawJ = thresholds[j].rawValue
        const scoreI = thresholds[i].score
        const scoreJ = thresholds[j].score
        if (!isNaN(rawI) && !isNaN(rawJ) && !isNaN(scoreI) && !isNaN(scoreJ)) {
          validPairs.push({
            rawDiff: rawJ - rawI,
            scoreDiff: scoreJ - scoreI
          })
        }
      }
    }
    
    if (validPairs.length >= 2) {
      const positiveCount = validPairs.filter(p => p.scoreDiff > 0).length
      const negativeCount = validPairs.filter(p => p.scoreDiff < 0).length
      
      if (positiveCount > negativeCount) {
        higherIsBetter = true
      } else if (negativeCount > positiveCount) {
        higherIsBetter = false
      }
    }
  }
  
  structuredConfig.higherIsBetter = higherIsBetter
  structuredConfig.scaleType = detectedScaleType || '20'
  structuredConfig.thresholds = thresholds
  structuredConfig.ambiguities = ambiguities
  structuredConfig.warnings = warnings
  
  // Detect ranges and create categories
  // Sort thresholds by rawValue
  const sortedThresholds = [...thresholds].sort((a, b) => a.rawValue - b.rawValue)
  
  // Create categories from gaps between thresholds
  for (let i = 0; i < sortedThresholds.length - 1; i++) {
    const current = sortedThresholds[i]
    const next = sortedThresholds[i + 1]
    
    // If there's a gap between raw values, create a category
    if (next.rawValue > current.rawValue + 1) { // Gap of at least 1
      categories.push({
        minRaw: current.rawValue,
        maxRaw: next.rawValue - 1,
        score: current.score,
        label: `Range ${current.rawValue}-${next.rawValue - 1}`
      })
    }
  }
  
  // Add final category if last threshold exists
  if (sortedThresholds.length > 0) {
    const last = sortedThresholds[sortedThresholds.length - 1]
    categories.push({
      minRaw: last.rawValue,
      maxRaw: '∞',
      score: last.score,
      label: `≥ ${last.rawValue}`
    })
  }
  
  structuredConfig.categories = categories
  
  // Detect if the scale is discrete or continuous
  // Check if scores change at regular intervals
  const scoreDiffs = []
  for (let i = 1; i < sortedThresholds.length; i++) {
    scoreDiffs.push(sortedThresholds[i].score - sortedThresholds[i - 1].score)
  }
  
  // If all score diffs are the same, it's a regular discrete scale
  const firstDiff = scoreDiffs[0]
  const allSameDiff = scoreDiffs.every(d => d === firstDiff)
  
  structuredConfig.valueType = allSameDiff && firstDiff ? 'discrete' : 'mixed'
  
  return {
    structuredConfig,
    ambiguities,
    warnings
  }
}

// Parse import data from various formats
export const parseImportData = (data) => {
  // Handle string data that might be from Excel/Word paste
  if (typeof data === 'string') {
    // Try to parse as CSV first
    const lines = data.split(/\n|\r\n/)
    const rows = lines.map(line => {
      // Split by comma, tab, or semicolon (common in Excel/Word tables)
      const cells = line.split(/[,;\t]+/).map(cell => cell.trim())
      return cells.filter(c => c.length > 0)
    }).filter(row => row.length > 0)
    return rows
  }
  
  // Handle array of arrays
  if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
    return data
  }
  
  // Handle single array
  if (Array.isArray(data)) {
    return [data]
  }
  
  return []
}

// Parse a value (number or string)
export const parseValue = (val) => {
  if (val === undefined || val === null) return NaN
  // Remove spaces, replace comma with dot for decimal
  const str = String(val).trim().replace(',', '.')
  const num = parseFloat(str)
  return isNaN(num) ? NaN : num
}

// Export bareme to Excel-friendly format
export const exportBarmeToCSV = (barme) => {
  const config = barme.structuredConfiguration
  const rows = []
  
  // Header
  rows.push(['Raw Performance', 'Score', 'Level', 'Category'])
  
  // Add categories
  config.categories.forEach((cat, i) => {
    rows.push([`${cat.minRaw}-${cat.maxRaw}`, cat.score, i + 1, cat.label])
  })
  
  // Add thresholds
  config.thresholds.forEach(th => {
    rows.push([th.rawValue, th.score, th.level, ''])
  })
  
  return rows.map(row => row.join(',')).join('\n')
}

// Get bareme by ID
export const getBarmeById = (id) => {
  const barmes = getBarmes()
  return barmes.find(b => b.id === id) || null
}

// Get active bareme for an institution
export const getActiveBarme = (institutionId) => {
  const barmes = getBarmes()
  // Find active bareme for this institution
  for (const barme of barmes) {
    if (barme.institution_id === institutionId && barme.isActive) {
      return barme
    }
  }
  // Return most recent if no active found
  for (const barme of barmes.reverse()) {
    if (barme.institution_id === institutionId) {
      return barme
    }
  }
  return null
}

// Get barmes for institution
export const getBarmesByInstitution = (institutionId) => {
  const barmes = getBarmes()
  return barmes.filter(b => b.institution_id === institutionId)
}

// Validate a bareme - final confirmation
export const validateBarme = (barmeId) => {
  const barmes = getBarmes()
  const index = barmes.findIndex(b => b.id === barmeId)
  
  if (index === -1) return { success: false, error: 'Barme not found' }
  
  const barme = barmes[index]
  
  // Check if analysis is complete enough
  const { structuredConfig, ambiguities } = barme.analysis
  
  if (!structuredConfig.higherIsBetter) {
    return { success: false, error: 'Cannot validate: unable to determine if higher performance is better' }
  }
  
  if (structuredConfig.thresholds.length === 0) {
    return { success: false, error: 'Cannot validate: no scoring thresholds detected' }
  }
  
  // Mark as validated
  barmes[index].status = IMPORT_STATUS.VALIDATED
  barmes[index].validated_at = new Date().toISOString()
  barmes[index].validated_by = getCurrentCoachId()
  barmes[index].version += 1
  
  saveBarmes(barmes)
  return { success: true, barme }
}

// Activate a bareme for an institution
export const activateBarme = (barmeId) => {
  const barmes = getBarmes()
  const index = barmes.findIndex(b => b.id === barmeId)
  
  if (index === -1) return { success: false, error: 'Barme not found' }
  
  // Deactivate all barmes for this institution
  barmes.forEach(b => {
    if (b.institution_id === barmes[index].institution_id) {
      b.isActive = false
    }
  })
  
  // Activate this bareme
  barmes[index].isActive = true
  barmes[index].activated_at = new Date().toISOString()
  barmes[index].activated_by = getCurrentCoachId()
  
  saveBarmes(barmes)
  return { success: true, barme }
}

// Calculate score from raw result using bareme configuration
export const calculateScore = (rawResult, barme) => {
  if (!barme) {
    // Try to get active bareme
    const institutionId = getCurrentInstitutionId()
    barme = getActiveBarme(institutionId)
  }
  
  if (!barme) return { score: null, error: 'No bareme available' }
  
  const config = barme.structuredConfiguration
  const raw = typeof rawResult === 'number' ? rawResult : parseValue(rawResult)
  
  if (isNaN(raw)) return { score: null, error: 'Invalid raw value' }
  
  // Check for exact match in thresholds
  const exactMatch = config.thresholds.find(t => t.rawValue === raw)
  if (exactMatch) {
    return { score: exactMatch.score, match: 'exact', raw, scaled: exactMatch.score }
  }
  
  // Check categories
  const matchingCategory = config.categories.find(c => {
    const min = parseValue(c.minRaw)
    const max = c.maxRaw === '∞' ? Infinity : parseValue(c.maxRaw)
    return !isNaN(min) && raw >= min && raw <= max
  })
  
  if (matchingCategory) {
    return { score: matchingCategory.score, match: 'category', raw, scaled: matchingCategory.score }
  }
  
  // Try interpolation for discrete scales
  if (config.valueType === 'discrete' && config.scaleType) {
    const sortedThresholds = [...config.thresholds].sort((a, b) => a.rawValue - b.rawValue)
    
    // Find surrounding thresholds
    const lower = sortedThresholds.find(t => t.rawValue <= raw)
    const upper = sortedThresholds.find(t => t.rawValue > raw)
    
    if (lower && upper) {
      // Linear interpolation
      const rawRange = upper.rawValue - lower.rawValue
      const scoreRange = upper.score - lower.score
      const ratio = (raw - lower.rawValue) / rawRange
      const interpolatedScore = lower.score + ratio * scoreRange
      
      return { 
        score: Math.round(interpolatedScore), 
        match: 'interpolated', 
        raw, 
        scaled: Math.round(interpolatedScore),
        note: 'Interpolated per official rules'
      }
    }
  }
  
  // No match found - flag for review
  return { 
    score: null, 
    match: 'unmatched', 
    raw, 
    error: 'No matching score in bareme - requires administrator review',
    note: 'Value outside defined scale range'
  }
}

// Bulk calculate scores for multiple students
export const bulkCalculateScores = (rawResults, barme) => {
  const results = []
  
  rawResults.forEach((rawResult, index) => {
    const result = calculateScore(rawResult, barme)
    results.push({
      index,
      raw: rawResult,
      ...result
    })
  })
  
  return results
}

// Export barme data for Supabase integration (placeholder)
export const prepareBarmeForSupabase = (barme) => {
  return {
    id: barme.id,
    name: barme.name,
    description: barme.description,
    source: barme.source,
    status: barme.status,
    institution_id: barme.institution_id,
    original_table: barme.originalTable,
    structured_configuration: barme.structuredConfiguration,
    analysis: barme.analysis,
    created_at: barme.created_at,
    version: barme.version,
    is_active: barme.isActive
  }
}

// Re-export the BARME-based scoring helper so callers can import it
// from either the barme or tests service.
export { calculateScoreFromBarme } from './tests.service'

// Initialize with sample bareme if none exist
// This won't overwrite existing data
if (getBarmes().length === 0) {
  // No initialization - wait for administration to import
}