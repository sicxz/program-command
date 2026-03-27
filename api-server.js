import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;
const require = createRequire(import.meta.url);
const {
  DEFAULT_GEMINI_VISION_MODEL,
  DEFAULT_OPENAI_VISION_MODEL,
  buildBakeoffPlan,
  buildGeminiRequestPreview,
  buildOpenAiRequestPreview,
  extractGeminiOutputText,
  extractOpenAiOutputText,
  parseStructuredJson,
  summarizeBatchExtraction
} = require('./server/eaglenet-vision-bakeoff.cjs');

// Load environment variables
dotenv.config({ path: path.join(ROOT_DIR, '.env') });
dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

const app = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';

// Constants
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

let createScheduleSpreadsheet = null;

// Middleware
app.use(cors());
app.use(express.json());

// Helper Functions
function inferProviderFromKey(apiKey) {
  if (typeof apiKey !== 'string') return 'openai';
  if (apiKey.startsWith('sk-ant-')) return 'anthropic';
  return 'openai';
}

function getApiCredential(req, preferredProvider = null) {
  const headerKey =
    req.header('x-ai-api-key') ||
    req.header('x-openai-api-key') ||
    req.header('x-api-key');

  if (typeof headerKey === 'string' && headerKey.trim()) {
    const key = headerKey.trim();
    const provider = preferredProvider || inferProviderFromKey(key);
    return { key, provider };
  }

  if (preferredProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return { key: process.env.ANTHROPIC_API_KEY, provider: 'anthropic' };
  }
  if (preferredProvider === 'openai' && process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY, provider: 'openai' };
  }

  if (process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY, provider: 'openai' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { key: process.env.ANTHROPIC_API_KEY, provider: 'anthropic' };
  }

  return null;
}

function getVisionApiCredential(req, provider, options = {}) {
  const bodyKeys = req.body?.apiKeys && typeof req.body.apiKeys === 'object'
    ? req.body.apiKeys
    : {};
  const allowGenericHeader = options.allowGenericHeader === true;
  const genericHeaderKey = allowGenericHeader
    ? (
      req.header('x-ai-api-key') ||
      req.header('x-api-key')
    )
    : null;

  if (provider === 'openai') {
    const key =
      normalizeHeaderCredential(bodyKeys.openai) ||
      normalizeHeaderCredential(req.header('x-openai-api-key')) ||
      normalizeHeaderCredential(genericHeaderKey) ||
      normalizeHeaderCredential(process.env.OPENAI_API_KEY);
    return key ? { key, provider } : null;
  }

  if (provider === 'gemini') {
    const key =
      normalizeHeaderCredential(bodyKeys.gemini) ||
      normalizeHeaderCredential(req.header('x-gemini-api-key')) ||
      normalizeHeaderCredential(req.header('x-google-api-key')) ||
      normalizeHeaderCredential(genericHeaderKey) ||
      normalizeHeaderCredential(process.env.GEMINI_API_KEY) ||
      normalizeHeaderCredential(process.env.GOOGLE_API_KEY);
    return key ? { key, provider } : null;
  }

  return null;
}

function normalizeHeaderCredential(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeModelForProvider(provider, requestedModel) {
  if (!requestedModel || typeof requestedModel !== 'string') {
    return provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL;
  }
  const model = requestedModel.trim();
  if (!model) {
    return provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL;
  }
  if (provider === 'anthropic' && model.startsWith('gpt-')) {
    return DEFAULT_ANTHROPIC_MODEL;
  }
  if (provider === 'openai' && model.startsWith('claude-')) {
    return DEFAULT_OPENAI_MODEL;
  }
  return model;
}

async function callOpenAiChat({ apiKey, messages, model, maxTokens, temperature, responseFormat }) {
  const payload = {
    model: normalizeModelForProvider('openai', model),
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    max_tokens: Number.isFinite(maxTokens) ? maxTokens : 1200
  };

  if (responseFormat === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  const text = data?.choices?.[0]?.message?.content || '';
  return {
    text,
    usage: data.usage || null,
    model: data.model || payload.model,
    provider: 'openai',
    raw: data
  };
}

async function callOpenAiVisionBakeoff({ apiKey, requestBody }) {
  const response = await fetch(OPENAI_RESPONSES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI bakeoff request failed (${response.status})`;
    throw new Error(message);
  }

  const text = extractOpenAiOutputText(data);
  const parsed = parseStructuredJson(text);
  return {
    provider: 'openai',
    model: data.model || requestBody.model || DEFAULT_OPENAI_VISION_MODEL,
    usage: data.usage || null,
    text,
    parsed
  };
}

function normalizeAnthropicMessages(messages) {
  return (messages || []).map((message) => {
    if (typeof message.content === 'string') {
      return { role: message.role, content: message.content };
    }
    return message;
  });
}

async function callAnthropicChat({ apiKey, messages, model, maxTokens, temperature, systemPrompt }) {
  const payload = {
    model: normalizeModelForProvider('anthropic', model),
    max_tokens: Number.isFinite(maxTokens) ? maxTokens : 1200,
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    messages: normalizeAnthropicMessages(messages)
  };

  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    payload.system = systemPrompt.trim();
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Anthropic request failed (${response.status})`;
    throw new Error(message);
  }

  const text = Array.isArray(data?.content)
    ? data.content.filter((entry) => entry.type === 'text').map((entry) => entry.text).join('\n').trim()
    : '';

  return {
    text,
    usage: data.usage || null,
    model: data.model || payload.model,
    provider: 'anthropic',
    raw: data
  };
}

async function callGeminiVisionBakeoff({ apiKey, requestBody }) {
  const { model = DEFAULT_GEMINI_VISION_MODEL, ...payload } = requestBody || {};
  const response = await fetch(`${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini bakeoff request failed (${response.status})`;
    throw new Error(message);
  }

  const text = extractGeminiOutputText(data);
  const parsed = parseStructuredJson(text);
  return {
    provider: 'gemini',
    model,
    usage: data?.usageMetadata || null,
    text,
    parsed
  };
}

async function getCreateScheduleSpreadsheet() {
  if (createScheduleSpreadsheet) {
    return createScheduleSpreadsheet;
  }
  const module = await import('./google-sheets-client.js');
  if (!module?.createScheduleSpreadsheet) {
    throw new Error('Google Sheets export module is not available.');
  }
  createScheduleSpreadsheet = module.createScheduleSpreadsheet;
  return createScheduleSpreadsheet;
}

function toMessages({ prompt, messages, systemPrompt }) {
  if (Array.isArray(messages) && messages.length > 0) {
    return messages;
  }
  const normalized = [];
  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    normalized.push({ role: 'system', content: systemPrompt.trim() });
  }
  if (typeof prompt === 'string' && prompt.trim()) {
    normalized.push({ role: 'user', content: prompt.trim() });
  }
  return normalized;
}

function normalizeVisionProviders(value) {
  const requestedProviders = Array.isArray(value) ? value : [];
  const normalized = requestedProviders
    .map((provider) => String(provider || '').trim().toLowerCase())
    .filter((provider) => provider === 'openai' || provider === 'gemini');
  return normalized.length ? Array.from(new Set(normalized)) : ['openai', 'gemini'];
}

function summarizeBakeoffBatch(batch) {
  return {
    rootLabel: batch.rootLabel,
    imageCount: batch.imageCount,
    totalBytes: batch.totalBytes,
    termCounts: batch.termCounts,
    images: (batch.images || []).map((image) => ({
      name: image.name,
      relativePath: image.relativePath,
      termKey: image.termKey,
      termHint: image.termHint,
      sizeBytes: image.sizeBytes
    }))
  };
}

async function callAiProvider({
  provider,
  apiKey,
  messages,
  model,
  maxTokens,
  temperature,
  responseFormat,
  systemPrompt
}) {
  if (provider === 'anthropic') {
    const anthroMessages = [];
    let derivedSystemPrompt = typeof systemPrompt === 'string' ? systemPrompt : null;

    for (const message of messages || []) {
      if (message.role === 'system') {
        if (!derivedSystemPrompt && typeof message.content === 'string') {
          derivedSystemPrompt = message.content;
        }
        continue;
      }
      anthroMessages.push(message);
    }

    return callAnthropicChat({
      apiKey,
      messages: anthroMessages,
      model,
      maxTokens,
      temperature,
      systemPrompt: derivedSystemPrompt
    });
  }

  return callOpenAiChat({
    apiKey,
    messages,
    model,
    maxTokens,
    temperature,
    responseFormat
  });
}

// API Routes
app.post('/api/export-to-sheets', async (req, res) => {
  try {
    const { scheduleData = {}, academicYear } = req.body;

    console.log('Export request received for year:', academicYear);
    console.log('Fall courses:', (scheduleData.fall || []).length);
    console.log('Winter courses:', (scheduleData.winter || []).length);
    console.log('Spring courses:', (scheduleData.spring || []).length);

    if (scheduleData.fall && scheduleData.fall.length > 0) {
      console.log('All fall courses:');
      scheduleData.fall.forEach((course) => {
        console.log(`  ${course.code} | ${course.day} | ${course.time} | Room: ${course.room}`);
      });
    }

    const exportFn = await getCreateScheduleSpreadsheet();
    const result = await exportFn(scheduleData, academicYear || '2025-26');
    console.log('Export successful:', result.spreadsheetUrl);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/test', async (req, res) => {
  try {
    const body = req.body;
    const preferredProvider = body.provider === 'anthropic' || body.provider === 'openai' ? body.provider : null;
    const credential = getApiCredential(req, preferredProvider);
    
    if (!credential) {
      return res.status(400).json({
        success: false,
        error: 'No AI API key found. Set OPENAI_API_KEY/ANTHROPIC_API_KEY or save a key in app settings.'
      });
    }

    const model = normalizeModelForProvider(credential.provider, body.model);
    const result = await callAiProvider({
      provider: credential.provider,
      apiKey: credential.key,
      model,
      maxTokens: 20,
      temperature: 0,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      systemPrompt: null,
      responseFormat: null
    });

    res.json({
      success: true,
      provider: result.provider,
      model: result.model,
      message: result.text.trim() || 'OK'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const body = req.body;
    const preferredProvider = body.provider === 'anthropic' || body.provider === 'openai' ? body.provider : null;
    const credential = getApiCredential(req, preferredProvider);
    
    if (!credential) {
      return res.status(400).json({
        success: false,
        error: 'No AI API key found. Set OPENAI_API_KEY/ANTHROPIC_API_KEY or save a key in app settings.'
      });
    }

    const messages = toMessages(body);
    if (!messages.length) {
      return res.status(400).json({ success: false, error: 'Request must include `prompt` or non-empty `messages`.' });
    }

    const result = await callAiProvider({
      provider: credential.provider,
      apiKey: credential.key,
      messages,
      model: normalizeModelForProvider(credential.provider, body.model),
      maxTokens: Number(body.maxTokens || body.max_tokens) || 1200,
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
      responseFormat: body.responseFormat,
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : null
    });

    res.json({
      success: true,
      provider: result.provider,
      text: result.text,
      usage: result.usage,
      model: result.model
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/vision/eaglenet-bakeoff', async (req, res) => {
  try {
    const body = req.body || {};
    const providers = normalizeVisionProviders(body.providers);
    const allowGenericHeader = providers.length === 1;
    const plan = buildBakeoffPlan({
      folderPath: body.folderPath,
      filePaths: body.filePaths,
      maxImages: body.maxImages,
      workspaceLabel: body.workspaceLabel,
      subjectDescriptionMap: body.subjectDescriptionMap,
      openaiModel: body.openaiModel,
      geminiModel: body.geminiModel
    });
    const dryRun = body.dryRun === true;
    const results = {};
    let completedProviders = 0;

    for (const provider of providers) {
      const requestBody = provider === 'gemini' ? plan.geminiRequest : plan.openaiRequest;
      const requestPreview = provider === 'gemini'
        ? buildGeminiRequestPreview(plan.geminiRequest)
        : buildOpenAiRequestPreview(plan.openaiRequest);

      if (dryRun) {
        results[provider] = {
          success: true,
          dryRun: true,
          model: provider === 'gemini' ? requestBody.model : requestBody.model,
          requestPreview
        };
        continue;
      }

      const credential = getVisionApiCredential(req, provider, { allowGenericHeader });
      if (!credential) {
        results[provider] = {
          success: false,
          error: provider === 'gemini'
            ? 'Missing Gemini API key. Set GEMINI_API_KEY/GOOGLE_API_KEY, send `x-gemini-api-key`, or pass `apiKeys.gemini`.'
            : 'Missing OpenAI API key. Set OPENAI_API_KEY, send `x-openai-api-key`, or pass `apiKeys.openai`.',
          model: requestBody.model,
          requestPreview
        };
        continue;
      }

      try {
        const result = provider === 'gemini'
          ? await callGeminiVisionBakeoff({ apiKey: credential.key, requestBody })
          : await callOpenAiVisionBakeoff({ apiKey: credential.key, requestBody });
        completedProviders += 1;
        results[provider] = {
          success: true,
          model: result.model,
          usage: result.usage,
          summary: summarizeBatchExtraction(result.parsed),
          parsed: result.parsed,
          requestPreview
        };
      } catch (error) {
        results[provider] = {
          success: false,
          error: error.message,
          model: requestBody.model,
          requestPreview
        };
      }
    }

    if (!dryRun && completedProviders === 0) {
      return res.status(400).json({
        success: false,
        error: 'No provider completed the EagleNET bakeoff request.',
        batch: summarizeBakeoffBatch(plan.batch),
        providers: results
      });
    }

    res.json({
      success: true,
      dryRun,
      batch: summarizeBakeoffBatch(plan.batch),
      promptPreview: body.includePrompt === false ? undefined : plan.prompt,
      providers: results
    });
  } catch (error) {
    const status = /Provide `folderPath`|not found|No supported screenshot/i.test(error.message) ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// Static File Serving
// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// Serve everything else as static files
app.use(express.static(ROOT_DIR));

// Handle 404s for anything not matched by express.static
app.use((req, res) => {
  res.status(404).send('<h1>404 - File Not Found</h1>');
});

// Start Server
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});
