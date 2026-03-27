import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const options = {
    providers: ['openai', 'gemini'],
    server: process.env.VISION_BAKEOFF_SERVER || 'http://127.0.0.1:8123',
    maxImages: undefined,
    workspaceLabel: '',
    dryRun: false,
    includePrompt: false,
    out: ''
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }

    const [flag, inlineValue] = value.split('=');
    const nextValue = inlineValue ?? argv[index + 1];
    const consumeNext = inlineValue == null;

    switch (flag) {
      case '--server':
        options.server = nextValue || options.server;
        if (consumeNext) index += 1;
        break;
      case '--provider':
      case '--providers':
        options.providers = String(nextValue || '')
          .split(',')
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean);
        if (consumeNext) index += 1;
        break;
      case '--max-images':
        options.maxImages = Number(nextValue);
        if (consumeNext) index += 1;
        break;
      case '--workspace':
      case '--workspace-label':
        options.workspaceLabel = nextValue || '';
        if (consumeNext) index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--include-prompt':
        options.includePrompt = true;
        break;
      case '--out':
        options.out = nextValue || '';
        if (consumeNext) index += 1;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return {
    folderPath: positional[0] || '',
    options
  };
}

function summarizeProvider(provider, payload) {
  if (!payload) {
    return `${provider}: no response`;
  }
  if (!payload.success) {
    return `${provider}: failed (${payload.error || 'unknown error'})`;
  }
  if (payload.dryRun) {
    return `${provider}: dry run preview ready (${payload.model})`;
  }
  const summary = payload.summary || {};
  return `${provider}: ${summary.rowCount || 0} rows across ${summary.imageCount || 0} screenshots using ${payload.model}`;
}

async function main() {
  const { folderPath, options } = parseArgs(process.argv.slice(2));
  if (!folderPath) {
    throw new Error('Usage: node scripts/run-eaglenet-vision-bakeoff.js <folderPath> [--provider openai,gemini] [--dry-run]');
  }

  const body = {
    folderPath,
    providers: options.providers,
    maxImages: Number.isFinite(options.maxImages) ? options.maxImages : undefined,
    workspaceLabel: options.workspaceLabel,
    dryRun: options.dryRun,
    includePrompt: options.includePrompt
  };

  const response = await fetch(`${options.server.replace(/\/$/, '')}/api/vision/eaglenet-bakeoff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Bakeoff request failed with status ${response.status}`);
  }

  console.log(`Batch: ${payload.batch?.imageCount || 0} screenshots from ${payload.batch?.rootLabel || path.basename(folderPath)}`);
  Object.entries(payload.providers || {}).forEach(([provider, providerPayload]) => {
    console.log(`- ${summarizeProvider(provider, providerPayload)}`);
  });

  const outputPath = options.out
    ? path.resolve(options.out)
    : path.resolve('output', 'eaglenet-vision-bakeoff', 'latest.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`Saved JSON report to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
