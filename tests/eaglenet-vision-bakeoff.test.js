const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    buildBakeoffPlan,
    buildGeminiRequestPreview,
    buildOpenAiRequestPreview,
    extractGeminiOutputText,
    extractOpenAiOutputText,
    loadImageBatch,
    parseStructuredJson,
    summarizeBatchExtraction
} = require('../server/eaglenet-vision-bakeoff.cjs');

describe('EagleNET vision bakeoff helpers', () => {
    let tempRoot;

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eaglenet-bakeoff-'));
    });

    afterEach(() => {
        if (tempRoot && fs.existsSync(tempRoot)) {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    function writeImage(relativePath) {
        const absolutePath = path.join(tempRoot, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, Buffer.from('fake-image-data'));
        return absolutePath;
    }

    test('loads a nested screenshot folder and infers term hints from folder names', () => {
        writeImage('cscd fall 2025/cscd fall 2025 1.png');
        writeImage('cscd winter 2026/cscd winter 2026 2.png');
        writeImage('notes/readme.txt');

        const batch = loadImageBatch({ folderPath: tempRoot });

        expect(batch.rootLabel).toBe(path.basename(tempRoot));
        expect(batch.imageCount).toBe(2);
        expect(batch.termCounts).toMatchObject({
            fall: 1,
            winter: 1
        });
        expect(batch.images.map((image) => image.relativePath)).toEqual([
            'cscd fall 2025/cscd fall 2025 1.png',
            'cscd winter 2026/cscd winter 2026 2.png'
        ]);
        expect(batch.images[0].termHint).toBe('Fall Quarter 2025');
        expect(batch.images[1].termHint).toBe('Winter Quarter 2026');
    });

    test('builds OpenAI and Gemini request payloads with interleaved screenshot labels and image parts', () => {
        writeImage('cscd fall 2025/cscd fall 2025 1.png');
        writeImage('cscd spring 2026/cscd spring 2026 1.png');

        const plan = buildBakeoffPlan({
            folderPath: tempRoot,
            workspaceLabel: 'Computer Science',
            subjectDescriptionMap: {
                'Computer Science': 'CSCD',
                Cybersecurity: 'CYBR'
            },
            openaiModel: 'gpt-5.4',
            geminiModel: 'gemini-2.5-pro'
        });

        expect(plan.prompt).toMatch(/Computer Science/);
        expect(plan.prompt).toMatch(/computer science => CSCD/i);
        expect(plan.openaiRequest.model).toBe('gpt-5.4');
        expect(plan.openaiRequest.input[0].content[1]).toMatchObject({
            type: 'input_text'
        });
        expect(plan.openaiRequest.input[0].content[2]).toMatchObject({
            type: 'input_image'
        });
        expect(plan.geminiRequest.model).toBe('gemini-2.5-pro');
        expect(plan.geminiRequest.contents[0].parts[1]).toMatchObject({
            text: expect.stringContaining('Screenshot 1:')
        });
        expect(plan.geminiRequest.contents[0].parts[2]).toMatchObject({
            inline_data: {
                mime_type: 'image/png',
                data: expect.any(String)
            }
        });

        const openAiPreview = buildOpenAiRequestPreview(plan.openaiRequest);
        const geminiPreview = buildGeminiRequestPreview(plan.geminiRequest);

        expect(openAiPreview.input[0].content[2].image_url).toMatch(/<omitted>/);
        expect(geminiPreview.contents[0].parts[2].inline_data.data).toMatch(/<omitted base64>/);
    });

    test('extracts provider JSON text and summarizes grid-field completeness', () => {
        const providerPayload = {
            schema_version: 'eaglenet-vision-v1',
            workspace_label: 'Computer Science',
            image_count: '1',
            images: [
                {
                    image_name: 'cscd fall 2025 1.png',
                    relative_path: 'cscd fall 2025/cscd fall 2025 1.png',
                    term_hint: 'Fall Quarter 2025',
                    notes: [],
                    follow_up_questions: ['Confirm room for CSCD 110 section 001.'],
                    rows: [
                        {
                            source_image: 'cscd fall 2025 1.png',
                            row_index_on_image: '1',
                            title: 'INTRODUCTION TO PROGRAMMING',
                            subject_description: 'Computer Science',
                            subject_code: 'CSCD',
                            course_number: '110',
                            section: '001',
                            hours: '5',
                            crn: '40668',
                            term: 'Fall Quarter 2025',
                            instructor_name: 'Lemelin, Rob',
                            meeting_days: ['M', 'T', 'W', 'R', 'F'],
                            meeting_days_text: 'MTWRF',
                            meeting_time_text: '09:00 AM - 09:50 AM',
                            meeting_time_start: '09:00',
                            meeting_time_end: '09:50',
                            meeting_type: 'Class',
                            room: '',
                            campus: 'Cheney',
                            schedule_type: 'Lecture w Practicum',
                            attribute: 'State Support Funding',
                            status_text: '9 of 40 seats remaining, 5 of 5 waitlist seats remaining',
                            seats_remaining: '9',
                            seat_capacity: '40',
                            waitlist_current: '0',
                            waitlist_capacity: '5',
                            confidence: 'medium',
                            uncertainty_notes: ['Room not visible in screenshot.']
                        }
                    ]
                }
            ],
            batch_follow_up_questions: []
        };

        const openAiText = extractOpenAiOutputText({
            output: [
                {
                    type: 'message',
                    content: [
                        {
                            type: 'output_text',
                            text: JSON.stringify(providerPayload)
                        }
                    ]
                }
            ]
        });
        const geminiText = extractGeminiOutputText({
            candidates: [
                {
                    content: {
                        parts: [
                            { text: JSON.stringify(providerPayload) }
                        ]
                    }
                }
            ]
        });

        expect(parseStructuredJson(openAiText)).toEqual(providerPayload);
        expect(parseStructuredJson(geminiText)).toEqual(providerPayload);

        const summary = summarizeBatchExtraction(providerPayload);
        expect(summary).toMatchObject({
            imageCount: 1,
            rowCount: 1,
            followUpQuestionCount: 1,
            subjectCounts: {
                CSCD: 1
            }
        });
        expect(summary.completeness.subject_code).toEqual({ populated: 1, missing: 0 });
        expect(summary.completeness.room).toEqual({ populated: 0, missing: 1 });
    });
});
