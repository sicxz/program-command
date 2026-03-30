const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const DEFAULT_OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4';
const DEFAULT_GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || 'gemini-2.5-pro';
const DEFAULT_SUBJECT_DESCRIPTION_MAP = Object.freeze({
    'computer science': 'CSCD',
    cybersecurity: 'CYBR'
});
const REQUIRED_GRID_FIELDS = Object.freeze([
    'subject_code',
    'course_number',
    'section',
    'hours',
    'term',
    'instructor_name',
    'meeting_days',
    'meeting_time_text',
    'room'
]);

const EAGLENET_BATCH_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        schema_version: { type: 'string' },
        workspace_label: { type: 'string' },
        image_count: { type: 'string' },
        images: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    image_name: { type: 'string' },
                    relative_path: { type: 'string' },
                    term_hint: { type: 'string' },
                    notes: {
                        type: 'array',
                        items: { type: 'string' }
                    },
                    follow_up_questions: {
                        type: 'array',
                        items: { type: 'string' }
                    },
                    rows: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                source_image: { type: 'string' },
                                row_index_on_image: { type: 'string' },
                                title: { type: 'string' },
                                subject_description: { type: 'string' },
                                subject_code: { type: 'string' },
                                course_number: { type: 'string' },
                                section: { type: 'string' },
                                hours: { type: 'string' },
                                crn: { type: 'string' },
                                term: { type: 'string' },
                                instructor_name: { type: 'string' },
                                meeting_days: {
                                    type: 'array',
                                    items: { type: 'string' }
                                },
                                meeting_days_text: { type: 'string' },
                                meeting_time_text: { type: 'string' },
                                meeting_time_start: { type: 'string' },
                                meeting_time_end: { type: 'string' },
                                meeting_type: { type: 'string' },
                                room: { type: 'string' },
                                campus: { type: 'string' },
                                schedule_type: { type: 'string' },
                                attribute: { type: 'string' },
                                status_text: { type: 'string' },
                                seats_remaining: { type: 'string' },
                                seat_capacity: { type: 'string' },
                                waitlist_current: { type: 'string' },
                                waitlist_capacity: { type: 'string' },
                                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                                uncertainty_notes: {
                                    type: 'array',
                                    items: { type: 'string' }
                                }
                            },
                            required: [
                                'source_image',
                                'row_index_on_image',
                                'title',
                                'subject_description',
                                'subject_code',
                                'course_number',
                                'section',
                                'hours',
                                'crn',
                                'term',
                                'instructor_name',
                                'meeting_days',
                                'meeting_days_text',
                                'meeting_time_text',
                                'meeting_time_start',
                                'meeting_time_end',
                                'meeting_type',
                                'room',
                                'campus',
                                'schedule_type',
                                'attribute',
                                'status_text',
                                'seats_remaining',
                                'seat_capacity',
                                'waitlist_current',
                                'waitlist_capacity',
                                'confidence',
                                'uncertainty_notes'
                            ]
                        }
                    }
                },
                required: [
                    'image_name',
                    'relative_path',
                    'term_hint',
                    'notes',
                    'follow_up_questions',
                    'rows'
                ]
            }
        },
        batch_follow_up_questions: {
            type: 'array',
            items: { type: 'string' }
        }
    },
    required: [
        'schema_version',
        'workspace_label',
        'image_count',
        'images',
        'batch_follow_up_questions'
    ]
});

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function inferTermKey(value) {
    const text = normalizeString(value).toLowerCase();
    if (!text) return '';
    if (text.includes('fall')) return 'fall';
    if (text.includes('winter')) return 'winter';
    if (text.includes('spring')) return 'spring';
    if (text.includes('summer')) return 'summer';
    return '';
}

function inferTermLabelFromPath(value) {
    const source = normalizeString(value);
    const lower = source.toLowerCase();
    const match = lower.match(/\b(fall|winter|spring|summer)\b[^0-9]*(20\d{2})/);
    if (match) {
        return `${capitalize(match[1])} Quarter ${match[2]}`;
    }
    const termKey = inferTermKey(source);
    return termKey ? `${capitalize(termKey)} Quarter` : '';
}

function capitalize(value) {
    const text = normalizeString(value);
    if (!text) return '';
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function isSupportedImagePath(filePath) {
    return IMAGE_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function detectMimeType(filePath) {
    const extension = path.extname(String(filePath || '')).toLowerCase();
    if (extension === '.png') return 'image/png';
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.webp') return 'image/webp';
    return 'application/octet-stream';
}

function walkDirectoryImages(folderPath, collector, rootFolderPath) {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    entries
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
        .forEach((entry) => {
            const absolutePath = path.join(folderPath, entry.name);
            if (entry.isDirectory()) {
                walkDirectoryImages(absolutePath, collector, rootFolderPath);
                return;
            }
            if (!entry.isFile() || !isSupportedImagePath(entry.name)) {
                return;
            }
            const relativePath = path.relative(rootFolderPath, absolutePath) || entry.name;
            collector.push(buildImageDescriptor(absolutePath, relativePath));
        });
}

function buildImageDescriptor(absolutePath, relativePath = null) {
    const stats = fs.statSync(absolutePath);
    const inferredRelativePath = normalizeString(relativePath) || path.basename(absolutePath);
    return {
        name: path.basename(absolutePath),
        absolutePath,
        relativePath: inferredRelativePath,
        mimeType: detectMimeType(absolutePath),
        sizeBytes: Number(stats.size) || 0,
        termKey: inferTermKey(inferredRelativePath),
        termHint: inferTermLabelFromPath(inferredRelativePath)
    };
}

function loadImageBatch(options = {}) {
    const folderPath = normalizeString(options.folderPath);
    const explicitPaths = Array.isArray(options.filePaths)
        ? options.filePaths.map((value) => normalizeString(value)).filter(Boolean)
        : [];
    const maxImages = Number.isFinite(Number(options.maxImages)) && Number(options.maxImages) > 0
        ? Number(options.maxImages)
        : null;

    let images = [];
    let rootFolderPath = folderPath;

    if (folderPath) {
        if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
            throw new Error(`Screenshot folder not found: ${folderPath}`);
        }
        walkDirectoryImages(folderPath, images, folderPath);
    } else if (explicitPaths.length) {
        images = explicitPaths.map((filePath) => {
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                throw new Error(`Screenshot file not found: ${filePath}`);
            }
            if (!isSupportedImagePath(filePath)) {
                throw new Error(`Unsupported screenshot file: ${filePath}`);
            }
            return buildImageDescriptor(filePath);
        });
        rootFolderPath = path.dirname(explicitPaths[0]);
    } else {
        throw new Error('Provide `folderPath` or `filePaths` for the EagleNET screenshot bakeoff.');
    }

    if (!images.length) {
        throw new Error('No supported screenshot files were found for the EagleNET bakeoff.');
    }

    const limitedImages = maxImages ? images.slice(0, maxImages) : images;
    const termCounts = limitedImages.reduce((counts, image) => {
        const key = image.termKey || 'unknown';
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});

    return {
        rootFolderPath,
        rootLabel: path.basename(rootFolderPath || folderPath || 'screenshots'),
        imageCount: limitedImages.length,
        totalBytes: limitedImages.reduce((sum, image) => sum + image.sizeBytes, 0),
        termCounts,
        images: limitedImages
    };
}

function readImagePayloads(batch) {
    const images = Array.isArray(batch?.images) ? batch.images : [];
    return images.map((image) => {
        const base64 = fs.readFileSync(image.absolutePath, { encoding: 'base64' });
        return {
            ...image,
            base64,
            dataUrl: `data:${image.mimeType};base64,${base64}`
        };
    });
}

function normalizeSubjectDescriptionMap(subjectDescriptionMap) {
    const merged = {
        ...DEFAULT_SUBJECT_DESCRIPTION_MAP,
        ...(subjectDescriptionMap && typeof subjectDescriptionMap === 'object' ? subjectDescriptionMap : {})
    };
    return Object.entries(merged).reduce((result, [description, code]) => {
        const normalizedDescription = normalizeString(description).toLowerCase();
        const normalizedCode = normalizeString(code).toUpperCase();
        if (normalizedDescription && normalizedCode) {
            result[normalizedDescription] = normalizedCode;
        }
        return result;
    }, {});
}

function buildExtractionPrompt({ batch, workspaceLabel, subjectDescriptionMap }) {
    const subjectMap = normalizeSubjectDescriptionMap(subjectDescriptionMap);
    const mappingLines = Object.entries(subjectMap)
        .map(([description, code]) => `- ${description} => ${code}`)
        .join('\n');
    const imageLines = (batch.images || []).map((image, index) => {
        const termHint = image.termHint || 'No term hint from filename';
        return `${index + 1}. ${image.relativePath} (${termHint})`;
    }).join('\n');

    return [
        'Extract structured EagleNET classroom-view data from the provided screenshots.',
        'Return JSON only, matching the schema exactly.',
        '',
        'Extraction rules:',
        '- Extract one row object for each visible class row in each screenshot.',
        '- Do not invent values. Use an empty string when a field is not visible.',
        '- Use the screenshot filename in `source_image` and the screenshot block in `images`.',
        '- Derive `subject_code` from `subject_description` using this map:',
        mappingLines || '- No subject-description map provided.',
        '- `hours` must come from the Hours column.',
        '- `meeting_days` must list only the highlighted day pills using M, T, W, R, F, S, U.',
        '- `meeting_time_text` must keep the visible time range exactly as shown.',
        '- `meeting_time_start` and `meeting_time_end` should be normalized to HH:MM 24-hour time when visible, otherwise empty.',
        '- `room` must stay empty unless a room is visibly present in the screenshot.',
        '- `follow_up_questions` should only include missing details that would block schedule building.',
        '- `confidence` should be high, medium, or low.',
        '',
        `Workspace label: ${normalizeString(workspaceLabel) || 'Unspecified workspace'}`,
        `Batch image count: ${String(batch.imageCount || (batch.images || []).length || 0)}`,
        'Screenshot order:',
        imageLines
    ].join('\n');
}

function buildOpenAiBakeoffRequest({ model, prompt, schema, images }) {
    const content = [{ type: 'input_text', text: prompt }];
    images.forEach((image, index) => {
        content.push({
            type: 'input_text',
            text: `Screenshot ${index + 1}: ${image.relativePath}${image.termHint ? ` | term hint: ${image.termHint}` : ''}`
        });
        content.push({
            type: 'input_image',
            image_url: image.dataUrl
        });
    });

    return {
        model: normalizeString(model) || DEFAULT_OPENAI_VISION_MODEL,
        reasoning: { effort: 'low' },
        max_output_tokens: 12000,
        input: [{
            role: 'user',
            content
        }],
        text: {
            format: {
                type: 'json_schema',
                strict: true,
                schema
            }
        }
    };
}

function buildGeminiBakeoffRequest({ model, prompt, schema, images }) {
    const parts = [{ text: prompt }];
    images.forEach((image, index) => {
        parts.push({
            text: `Screenshot ${index + 1}: ${image.relativePath}${image.termHint ? ` | term hint: ${image.termHint}` : ''}`
        });
        parts.push({
            inline_data: {
                mime_type: image.mimeType,
                data: image.base64
            }
        });
    });

    return {
        contents: [{
            parts
        }],
        generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: schema
        },
        model: normalizeString(model) || DEFAULT_GEMINI_VISION_MODEL
    };
}

function buildOpenAiRequestPreview(request) {
    const cloned = JSON.parse(JSON.stringify(request));
    const content = cloned?.input?.[0]?.content;
    if (Array.isArray(content)) {
        content.forEach((item) => {
            if (item.type === 'input_image' && typeof item.image_url === 'string') {
                item.image_url = `data:<omitted>;bytes=${String(item.image_url.length)}`;
            }
        });
    }
    return cloned;
}

function buildGeminiRequestPreview(request) {
    const cloned = JSON.parse(JSON.stringify(request));
    const parts = cloned?.contents?.[0]?.parts;
    if (Array.isArray(parts)) {
        parts.forEach((part) => {
            if (part.inline_data?.data) {
                part.inline_data.data = `<omitted base64>;bytes=${String(part.inline_data.data.length)}`;
            }
        });
    }
    return cloned;
}

function extractOpenAiOutputText(responseBody) {
    const outputs = Array.isArray(responseBody?.output) ? responseBody.output : [];
    const texts = [];
    outputs.forEach((output) => {
        if (output?.type !== 'message' || !Array.isArray(output?.content)) {
            return;
        }
        output.content.forEach((part) => {
            if (part?.type === 'refusal' && normalizeString(part.refusal)) {
                texts.push(JSON.stringify({ refusal: part.refusal }));
                return;
            }
            if (part?.type === 'output_text' && normalizeString(part.text)) {
                texts.push(part.text);
            }
        });
    });
    return texts.join('\n').trim();
}

function extractGeminiOutputText(responseBody) {
    const candidates = Array.isArray(responseBody?.candidates) ? responseBody.candidates : [];
    const firstCandidate = candidates[0] || {};
    const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];
    return parts
        .map((part) => normalizeString(part?.text))
        .filter(Boolean)
        .join('\n')
        .trim();
}

function parseStructuredJson(text) {
    const trimmed = normalizeString(text);
    if (!trimmed) {
        throw new Error('Provider returned an empty response.');
    }
    return JSON.parse(trimmed);
}

function isNonEmptyField(value) {
    if (Array.isArray(value)) {
        return value.some((entry) => normalizeString(entry));
    }
    return Boolean(normalizeString(value));
}

function summarizeBatchExtraction(batchResult) {
    const images = Array.isArray(batchResult?.images) ? batchResult.images : [];
    const rows = images.flatMap((image) => Array.isArray(image?.rows) ? image.rows : []);
    const followUps = [
        ...(Array.isArray(batchResult?.batch_follow_up_questions) ? batchResult.batch_follow_up_questions : []),
        ...images.flatMap((image) => Array.isArray(image?.follow_up_questions) ? image.follow_up_questions : [])
    ].filter((entry) => normalizeString(entry));

    const completeness = REQUIRED_GRID_FIELDS.reduce((result, field) => {
        const populated = rows.filter((row) => isNonEmptyField(row?.[field])).length;
        result[field] = {
            populated,
            missing: Math.max(rows.length - populated, 0)
        };
        return result;
    }, {});

    const termCounts = rows.reduce((result, row) => {
        const key = normalizeString(row?.term) || 'unknown';
        result[key] = (result[key] || 0) + 1;
        return result;
    }, {});

    const subjectCounts = rows.reduce((result, row) => {
        const key = normalizeString(row?.subject_code) || 'unknown';
        result[key] = (result[key] || 0) + 1;
        return result;
    }, {});

    return {
        imageCount: images.length,
        rowCount: rows.length,
        followUpQuestionCount: followUps.length,
        completeness,
        termCounts,
        subjectCounts
    };
}

function buildBakeoffPlan(options = {}) {
    const batch = loadImageBatch(options);
    const prompt = buildExtractionPrompt({
        batch,
        workspaceLabel: options.workspaceLabel,
        subjectDescriptionMap: options.subjectDescriptionMap
    });
    const images = readImagePayloads(batch);

    return {
        batch,
        prompt,
        schema: EAGLENET_BATCH_SCHEMA,
        openaiRequest: buildOpenAiBakeoffRequest({
            model: options.openaiModel,
            prompt,
            schema: EAGLENET_BATCH_SCHEMA,
            images
        }),
        geminiRequest: buildGeminiBakeoffRequest({
            model: options.geminiModel,
            prompt,
            schema: EAGLENET_BATCH_SCHEMA,
            images
        })
    };
}

module.exports = {
    DEFAULT_OPENAI_VISION_MODEL,
    DEFAULT_GEMINI_VISION_MODEL,
    DEFAULT_SUBJECT_DESCRIPTION_MAP,
    EAGLENET_BATCH_SCHEMA,
    REQUIRED_GRID_FIELDS,
    buildBakeoffPlan,
    buildExtractionPrompt,
    buildGeminiBakeoffRequest,
    buildGeminiRequestPreview,
    buildImageDescriptor,
    buildOpenAiBakeoffRequest,
    buildOpenAiRequestPreview,
    detectMimeType,
    extractGeminiOutputText,
    extractOpenAiOutputText,
    inferTermKey,
    inferTermLabelFromPath,
    isSupportedImagePath,
    loadImageBatch,
    normalizeSubjectDescriptionMap,
    parseStructuredJson,
    summarizeBatchExtraction
};
