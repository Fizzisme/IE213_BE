// Subset ICD-10 phổ biến cho demo EHR/LIS
export const ICD10_SUBSET = [
    { code: 'A41.9', name: 'Nhiễm trùng huyết', category: 'Infection', isSensitive: false },
    { code: 'J18.9', name: 'Viêm phổi không xác định', category: 'Infection', isSensitive: false },
    { code: 'B34.9', name: 'Nhiễm virus không xác định', category: 'Infection', isSensitive: false },
    { code: 'I10', name: 'Tăng huyết áp', category: 'Cardio', isSensitive: false },
    { code: 'I20', name: 'Đau thắt ngực', category: 'Cardio', isSensitive: false },
    { code: 'E11', name: 'Đái tháo đường type 2', category: 'Metabolic', isSensitive: false },
    { code: 'E78.5', name: 'Rối loạn lipid máu', category: 'Metabolic', isSensitive: false },
    { code: 'K29.7', name: 'Viêm dạ dày', category: 'Digestive', isSensitive: false },
    { code: 'B18.1', name: 'Viêm gan B mạn', category: 'Digestive', isSensitive: false },
    { code: 'Z11.4', name: 'Sàng lọc HIV', category: 'Immunology', isSensitive: true },
    { code: 'B20', name: 'HIV', category: 'Immunology', isSensitive: true },
    { code: 'J45', name: 'Hen suyễn', category: 'Respiratory', isSensitive: false },
    { code: 'R50.9', name: 'Sốt không rõ nguyên nhân', category: 'Symptom', isSensitive: false },
    { code: 'R53', name: 'Mệt mỏi', category: 'Symptom', isSensitive: false }
];

// Mapping ICD-10 → gợi ý test
export const ICD_TO_TESTS = {
    'A41.9': ['CBC', 'CRP', 'BLOOD_CULTURE'],
    'E11': ['GLUCOSE', 'HBA1C'],
    'B20': ['HIV'],
    'J18.9': ['CBC', 'CRP', 'X-RAY'],
    'I10': ['LIPID_PANEL'],
    'E78.5': ['LIPID_PANEL'],
    'K29.7': ['AST', 'ALT'],
    'B18.1': ['AST', 'ALT', 'HBV_DNA'],
    'Z11.4': ['HIV'],
    'J45': ['CBC', 'IgE'],
    'R50.9': ['CBC'],
    'R53': ['CBC']
};

// Danh mục test code hợp lệ (demo)
export const VALID_TEST_CODES = [
    'CBC', 'CRP', 'BLOOD_CULTURE', 'GLUCOSE', 'HBA1C', 'HIV', 'X-RAY', 'LIPID_PANEL', 'AST', 'ALT', 'HBV_DNA', 'IgE'
];

// Mapping test code → sampleType hợp lệ
export const TEST_SAMPLE_MAP = {
    'CBC': ['blood'],
    'CRP': ['blood'],
    'BLOOD_CULTURE': ['blood'],
    'GLUCOSE': ['blood'],
    'HBA1C': ['blood'],
    'HIV': ['blood'],
    'X-RAY': ['xray'],
    'LIPID_PANEL': ['blood'],
    'AST': ['blood'],
    'ALT': ['blood'],
    'HBV_DNA': ['blood'],
    'IgE': ['blood']
};
