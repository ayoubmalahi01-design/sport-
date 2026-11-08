// Header synonym mapping (AR/EN/FR) for bulk import.
export const STUDENT_SYNONYMS = {
  code: ['رقم', 'الرقم', 'رمز', 'رقم التلميذ', 'code', 'id', 'matricule', 'student code', 'student_code', 'numero'],
  name: ['الاسم', 'الاسم الكامل', 'التلميذ', 'name', 'nom', 'full name', 'full_name', 'student name'],
  group: ['القسم', 'المجموعة', 'class', 'groupe', 'group', 'classe', 'group_name'],
};

export const RESULT_SYNONYMS = {
  code: ['رقم', 'الرقم', 'رمز', 'رقم التلميذ', 'code', 'id', 'matricule', 'student code', 'student_code'],
  test: ['اختبار', 'test', 'epreuve', 'épreuve', 'test name', 'test_name'],
  raw: ['نتيجة', 'قيمة', 'raw', 'score', 'value', 'valeur', 'result', 'resultat', 'résultat'],
  date: ['تاريخ', 'date', 'jour'],
};

export function autoMap(headers, synonyms) {
  const map = {};
  headers.forEach((h, idx) => {
    const norm = String(h || '').trim().toLowerCase();
    for (const field of Object.keys(synonyms)) {
      if (map[field] !== undefined) continue;
      if (synonyms[field].some(s => s.toLowerCase() === norm)) {
        map[field] = idx;
      }
    }
  });
  return map;
}

export const STUDENT_REQUIRED = ['code', 'name'];
export const RESULT_REQUIRED_WIDE = ['code'];
export const RESULT_REQUIRED_LONG = ['code', 'test', 'raw'];