import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'EHR API',
            version: '1.0.0',
            description: 'API documentation for EHR system with blockchain integration',
        },
        servers: [
            {
                url: 'http://localhost:8017',
                description: 'Local server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                PostLabResultRequest: {
                    type: 'object',
                    required: ['rawData'],
                    properties: {
                        rawData: {
                            type: 'object',
                            description: 'Dữ liệu kết quả xét nghiệm thô',
                            example: {
                                glucose: 140,
                                hba1c: 7.2,
                                cholesterol: 220,
                            },
                        },
                        note: {
                            type: 'string',
                            description: 'Ghi chú của lab tech',
                            example: 'Kết quả glucose cao hơn bình thường',
                        },
                    },
                },
                ClinicalInterpretationRequest: {
                    type: 'object',
                    required: ['interpretation', 'confirmedDiagnosis'],
                    properties: {
                        interpretation: {
                            type: 'string',
                            description: 'Diễn giải lâm sàng của bác sĩ',
                            example: 'WBC elevated (15K) indicates bacterial infection detected on chest X-ray',
                        },
                        recommendation: {
                            type: 'string',
                            description: 'Khuyến nghị điều trị',
                            example: 'Start amoxicillin 2g x 3/day for 7 days, follow-up in 3 days',
                        },
                        confirmedDiagnosis: {
                            type: 'string',
                            description: 'Confirmed diagnosis from doctor after reviewing lab results. REQUIRED - Cannot be auto-filled. Frontend should pre-fill from medical record.diagnosis to optimize UX',
                            example: 'Viêm phổi bacterial (confirmed by HbA1c 5.8%)',
                        },
                        interpreterNote: {
                            type: 'string',
                            description: 'Optional notes from interpreter',
                            example: 'Confirmed pneumonia by radiologist',
                        },
                    },
                },
                CreateLabOrderRequest: {
                    type: 'object',
                    required: ['patientAddress', 'recordType', 'testsRequested', 'medicalRecordId'],
                    properties: {
                        patientAddress: {
                            type: 'string',
                            pattern: '^0x[a-fA-F0-9]{40}$',
                            description: 'Địa chỉ ví bệnh nhân (phải khớp với database)',
                            example: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                        },
                        recordType: {
                            type: 'string',
                            enum: ['GENERAL', 'HIV_TEST', 'DIABETES_TEST', 'LAB_RESULT'],
                            description: 'Loại xét nghiệm',
                            example: 'DIABETES_TEST',
                        },
                        testsRequested: {
                            type: 'array',
                            minItems: 1,
                            items: {
                                type: 'object',
                                required: ['code', 'name'],
                                properties: {
                                    code: { type: 'string', example: 'GLUCOSE' },
                                    name: { type: 'string', example: 'Glucose (fasting)' },
                                    group: { type: 'string', example: 'metabolic' },
                                    urgent: { type: 'boolean', example: false },
                                    note: { type: 'string', example: 'NPO 8 hours' },
                                },
                            },
                        },
                        medicalRecordId: {
                            type: 'string',
                            pattern: '^[0-9a-fA-F]{24}$',
                            description: '🔥 REQUIRED - MongoDB ObjectId của medical record. Doctor phải specify chính xác hồ sơ (security: no auto-attach)',
                            example: '69d7d0e717b56dd8d0b93107',
                        },
                        priority: {
                            type: 'string',
                            enum: ['normal', 'urgent', 'emergency'],
                            description: 'Mức ưu tiên xử lý',
                            example: 'urgent',
                        },
                        clinicalNote: {
                            type: 'string',
                            description: 'Ghi chú lâm sàng',
                            example: 'Rule out diabetes. Polydipsia & polyuria.',
                        },
                        sampleType: {
                            type: 'string',
                            enum: ['blood', 'urine', 'stool', 'swab', 'other'],
                            example: 'blood',
                        },
                        diagnosisCode: {
                            type: 'string',
                            description: 'Mã ICD-10',
                            example: 'E11',
                        },
                        attachments: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'IPFS URIs',
                            example: ['ipfs://Qm...'],
                        },
                    },
                },
                GrantAccessRequest: {
                    type: 'object',
                    required: ['accessorAddress', 'level'],
                    properties: {
                        accessorAddress: {
                            type: 'string',
                            pattern: '^0x[a-fA-F0-9]{40}$',
                            description: 'Địa chỉ ví được cấp quyền',
                            example: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
                        },
                        level: {
                            type: 'string',
                            enum: ['FULL', 'SENSITIVE'],
                            description: 'Mức quyền',
                            example: 'FULL',
                        },
                        durationHours: {
                            type: 'number',
                            description: 'Thời hạn (giờ)',
                            example: 168,
                        },
                    },
                },
                RevokeAccessRequest: {
                    type: 'object',
                    required: ['accessorAddress'],
                    properties: {
                        accessorAddress: {
                            type: 'string',
                            pattern: '^0x[a-fA-F0-9]{40}$',
                            description: 'Địa chỉ ví bị thu hồi',
                            example: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
                        },
                    },
                },
                CheckAccessRequest: {
                    type: 'object',
                    required: ['patientAddress', 'accessorAddress', 'requiredLevel'],
                    properties: {
                        patientAddress: {
                            type: 'string',
                            pattern: '^0x[a-fA-F0-9]{40}$',
                            description: 'Địa chỉ bệnh nhân',
                            example: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                        },
                        accessorAddress: {
                            type: 'string',
                            pattern: '^0x[a-fA-F0-9]{40}$',
                            description: 'Địa chỉ người truy cập',
                            example: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
                        },
                        requiredLevel: {
                            type: 'string',
                            enum: ['NONE', 'EMERGENCY', 'FULL', 'SENSITIVE'],
                            description: 'Mức cần kiểm tra',
                            example: 'FULL',
                        },
                    },
                },
                VerifyHashRequest: {
                    type: 'object',
                    required: ['recordId', 'computedHash', 'hashType'],
                    properties: {
                        recordId: {
                            type: 'string',
                            description: 'ID record trên blockchain',
                            example: '1',
                        },
                        computedHash: {
                            type: 'string',
                            description: 'Keccak256 hash verify data',
                            example: '0xabc123def456789...',
                        },
                        hashType: {
                            type: 'number',
                            enum: [0, 1, 2],
                            description: 'Loại hash',
                            example: 1,
                        },
                    },
                },
            },
        },
    },
    apis: ['./src/routes/v1/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
};