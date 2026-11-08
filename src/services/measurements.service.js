// Physical Measurements Repository - Local Storage
// Tracks student growth and body measurements over time

const MEASUREMENTS_KEY = 'sp_measurements'

export const getMeasurements = () => {
  try {
    const data = localStorage.getItem(MEASUREMENTS_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Error loading measurements:', e)
    return []
  }
}

export const saveMeasurements = (measurements) => {
  try {
    localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(measurements))
    return true
  } catch (e) {
    console.error('Error saving measurements:', e)
    return false
  }
}

// Measurement types
export const MEASUREMENT_TYPES = {
  WEIGHT: 'وزن (kg)',
  HEIGHT: 'طول (cm)',
  BMI: 'مؤشر كتلة الجسم',
  MUSCLE_MASS: 'الكتلة العضلية',
  BODY_FAT: 'نسبة الدهون',
  INBODY: 'تحليل InBody'
}

// Add a measurement record
export const addMeasurement = (studentId, type, value, date, notes = '') => {
  const measurements = getMeasurements()
  const measurement = {
    id: Date.now(),
    studentId,
    type,
    value: typeof value === 'number' ? value : 0,
    date: date || new Date().toISOString().slice(0, 10),
    notes: notes || '',
    createdAt: new Date().toLocaleString('ar-TN')
  }
  
  measurements.push(measurement)
  saveMeasurements(measurements)
  return { success: true, measurement }
}

// Get measurements for a specific student
export const getStudentMeasurements = (studentId) => {
  const measurements = getMeasurements()
  return measurements.filter(m => m.studentId === studentId)
}

// Get the latest measurement of a specific type for a student
export const getLatestMeasurement = (studentId, type) => {
  const measurements = getStudentMeasurements(studentId)
  const typeMeasurements = measurements.filter(m => m.type === type)
  return typeMeasurements.length > 0 
    ? typeMeasurements.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    : null
}

// Get measurement history and calculate BMI
export const getMeasurementHistory = (studentId) => {
  const measurements = getStudentMeasurements(studentId)
  const history = measurements.sort((a, b) => new Date(a.date) - new Date(b.date))
  
  // Calculate BMI trends if we have weight and height
  const bmiTrend = []
  for (let i = 0; i < history.length; i++) {
    const m = history[i]
    if (m.type === MEASUREMENT_TYPES.WEIGHT && i + 1 < history.length) {
      const next = history[i + 1]
      if (next.type === MEASUREMENT_TYPES.HEIGHT) {
        const heightM = next.value / 100
        const bmi = (m.value / (heightM * heightM)).toFixed(1)
        bmiTrend.push({
          date: m.date,
          weight: m.value,
          height: next.value,
          bmi: parseFloat(bmi)
        })
      }
    }
  }
  
  return { measurements, bmiTrend }
}