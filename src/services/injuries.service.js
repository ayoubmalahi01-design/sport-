// Injuries Repository - Local Storage
// Tracks student injuries with dates, types, and recovery status

const INJURIES_KEY = 'sp_injuries'

export const getInjuries = () => {
  try {
    const data = localStorage.getItem(INJURIES_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error loading injuries:', e)
    return []
  }
}

export const saveInjuries = (injuries) => {
  try {
    localStorage.setItem(INJURIES_KEY, JSON.stringify(injuries))
    return true
  } catch (e) {
    console.error('Error saving injuries:', e)
    return false
  }
}

// Injury types
export const INJURY_TYPES = {
  STRAIN: 'تمدد عضلي',
  FRACTURE: 'كسر',
  DISLOCATION: 'خلع',
  CONTUSION: 'دمة/كدمة',
  BURNS: 'حروق',
  OTHER: 'آخر'
}

// Add an injury record
export const addInjury = (studentId, type, date, description, expectedRecovery, status = 'نشط') => {
  const injuries = getInjuries()
  const injury = {
    id: Date.now(),
    studentId,
    type,
    date: date || new Date().toISOString().slice(0, 10),
    description: description || '',
    expectedRecovery: expectedRecovery || '',
    status: status || 'نشط', // 'نشط', 'متوقف', 'متعافٍ'
    createdAt: new Date().toLocaleString('ar-TN')
  }
  
  injuries.push(injury)
  saveInjuries(injuries)
  return { success: true, injury }
}

// Get injuries for a specific student
export const getStudentInjuries = (studentId) => {
  const injuries = getInjuries()
  return injuries.filter(i => i.studentId === studentId)
}

// Update injury status
export const updateInjury = (id, updatedData) => {
  const injuries = getInjuries()
  const index = injuries.findIndex(i => i.id === id)
  if (index === -1) return { success: false, error: 'Injury record not found' }
  
  injuries[index] = { ...injuries[index], ...updatedData }
  saveInjuries(injuries)
  return { success: true }
}

// Delete injury record
export const deleteInjury = (id) => {
  const injuries = getInjuries().filter(i => i.id !== id)
  saveInjuries(injuries)
  return { success: true }
}

// Get injury statistics
export const getInjuryStatistics = () => {
  const injuries = getInjuries()
  const stats = {
    totalInjuries: injuries.length,
    byType: {},
    byStatus: { نشط: 0, متوقف: 0, متعافٍ: 0 },
    activeCount: 0
  }
  
  injuries.forEach(inj => {
    // Count by type
    const type = inj.type || 'غير معروف'
    stats.byType[type] = (stats.byType[type] || 0) + 1
    
    // Count by status
    const status = inj.status || 'نشط'
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1
    
    if (status === 'نشط') stats.activeCount++
  })
  
  return stats
}