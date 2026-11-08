// Reports Repository - Local Storage
// Generates reports from all collected data

const REPORTS_KEY = 'sp_reports'
function ls(key, fb){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fb))}catch{return fb}}

export const getReports = () => {
  try {
    const data = localStorage.getItem(REPORTS_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error loading reports:', e)
    return []
  }
}

export const saveReports = (reports) => {
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports))
    return true
  } catch (e) {
    console.error('Error saving reports:', e)
    return false
  }
}

// Generate a student report
export const generateStudentReport = (studentId) => {
  const students = ls('sp_students', [])
  const student = students.find(s => s.id === studentId)
  if (!student) return null
  
  const attendanceRecords = ls('sp_attendance', []).filter(r => r.studentId === studentId)
  const injuries = ls('sp_injuries', []).filter(i => i.studentId === studentId)
  const measurements = ls('sp_measurements', []).filter(m => m.studentId === studentId)
  const testEntries = ls('sp_test_entries', []).filter(e => e.student === studentId)
  
  // Calculate attendance stats
  const totalDays = attendanceRecords.length
  const presentDays = attendanceRecords.filter(r => r.status === 'حاضر').length
  const absenceDays = attendanceRecords.filter(r => r.status === 'غائب').length
  const lateDays = attendanceRecords.filter(r => /تأخر|تأخير/.test(r.reason || '')).length
  
  // Calculate attendance percentage
  const attendancePercent = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : 0
  
  // Calculate test stats
  const testStatsByType = {}
  const testTypes = ['Test Navette — Léger 20m', 'Pompes', 'Abdominaux', 'Barre fixe']
  
  testTypes.forEach(type => {
    const stats = getTestStatistics(type)
    if (stats && stats.count > 0) {
      testStatsByType[type] = {
        count: stats.count,
        averageRaw: stats.averageRaw,
        averageConverted: stats.averageConverted,
        minRaw: stats.minRaw,
        maxRaw: stats.maxRaw
      }
    }
  })
  
  return {
    student,
    attendance: {
      totalDays,
      presentDays,
      absenceDays,
      lateDays,
      attendancePercent
    },
    injuries: {
      count: injuries.length,
      active: injuries.filter(i => i.status === 'نشط').length,
      resolved: injuries.filter(i => i.status === 'تعافٍ').length
    },
    measurements: {
      count: measurements.length,
      latest: measurements.length > 0 ? {
        type: measurements[0]?.type,
        value: measurements[0]?.value
      } : null
    },
    tests: testStatsByType,
    generatedAt: new Date().toLocaleString('ar-TN')
  }
}

// Generate institution report
export const generateInstitutionReport = () => {
  const students = ls('sp_students', [])
  const attendanceSummary = { total: 0, present: 0, absent: 0 }
  const testStatsPromises = ['Test Navette — Léger 20m', 'Pompes', 'Abdominaux', 'Barre fixe'].map(type => getTestStatistics(type))
  // 'await' removed - using synchronous mapping instead
  const testStats = testStatsPromises.map(s => ({
    count: s.count || 0,
    averageRaw: s.averageRaw || 'N/A',
    averageConverted: s.averageConverted || 'N/A'
  }))
  
  // This is simplified - in a real app would use Promise.all
  const testStatsSync = testStatsPromises.map(s => ({
    count: s.count || 0,
    averageRaw: s.averageRaw || 'N/A',
    averageConverted: s.averageConverted || 'N/A'
  }))
  
  return {
    totalStudents: students.length,
    absenceSummary: attendanceSummary,
    testResults: testStatsSync,
    generatedAt: new Date().toLocaleString('ar-TN')
  }
}

// Export report to CSV format
export const exportToCSV = (data, filename) => {
  if (!data || typeof data !== 'object') return false
  
  const csvRows = []
  const headers = Object.keys(data[0] || {})
  
  headers.forEach(header => {
    csvRows.push(`"${header}"`)
  })
  csvRows.unshift(csvRows.shift() + '\n')
  
  data.forEach(item => {
    const values = headers.map(header => {
      const val = item[header]
      return val === null || val === undefined ? '' : `"${val}"`
    })
    csvRows.push(values.join(','))
  })
  
  const csvContent = csvRows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename || 'report.csv'
  link.click()
  return true
}