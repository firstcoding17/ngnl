const { spawnSync } = require('child_process');

const VALID_TARGETS = new Set(['local-staging', 'deploy']);

function readTarget() {
  const cliTarget = String(process.argv[2] || '').trim();
  const envTarget = String(process.env.NGNL_BUILD_TARGET || '').trim();
  return cliTarget || envTarget;
}

function isLocalHost(hostname = '') {
  return ['127.0.0.1', 'localhost', '0.0.0.0', '::1'].includes(String(hostname || '').toLowerCase());
}

function fail(message) {
  console.error(`[build-guard] ${message}`);
  process.exit(1);
}

function validateTarget(target) {
  if (!VALID_TARGETS.has(target)) {
    fail(
      [
        'A build target is required.',
        'Use one of:',
        '  npm run build:local-staging',
        '  VUE_APP_API_BASE=https://api.example.com npm run build:deploy',
      ].join('\n')
    );
  }
}

function validateApiBase(target) {
  const rawBase = String(process.env.VUE_APP_API_BASE || '').trim();
  if (!rawBase) {
    fail(`VUE_APP_API_BASE is required for the "${target}" build.`);
  }

  let parsed = null;
  try {
    parsed = new URL(rawBase);
  } catch {
    fail(`VUE_APP_API_BASE must be an absolute http(s) URL. Received: ${rawBase}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    fail(`VUE_APP_API_BASE must use http or https. Received: ${rawBase}`);
  }

  if (target === 'local-staging' && !isLocalHost(parsed.hostname)) {
    fail(
      [
        `Refusing local staging build with non-local API base: ${rawBase}`,
        'Use a loopback API URL such as http://127.0.0.1:45180 for local staging builds.',
        'If you intended a deploy build, use npm run build:deploy instead.',
      ].join('\n')
    );
  }

  if (target === 'deploy' && isLocalHost(parsed.hostname)) {
    fail(
      [
        `Refusing deploy build with local API base: ${rawBase}`,
        'Use a real deploy API URL for VUE_APP_API_BASE.',
        'If you intended a local build, use npm run build:local-staging instead.',
      ].join('\n')
    );
  }

  return parsed.toString().replace(/\/+$/, '');
}

function runVueBuild(target, apiBase) {
  const cliEntry = require.resolve('@vue/cli-service/bin/vue-cli-service.js');
  const result = spawnSync(process.execPath, [cliEntry, 'build'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NGNL_BUILD_TARGET: target,
      VUE_APP_API_BASE: apiBase,
    },
  });

  if (result.error) {
    fail(`vue-cli-service build failed to start: ${result.error.message}`);
  }
  process.exit(result.status || 0);
}

const target = readTarget();
validateTarget(target);
const apiBase = validateApiBase(target);

console.log(`[build-guard] target=${target}`);
console.log(`[build-guard] VUE_APP_API_BASE=${apiBase}`);
console.log(`[build-guard] Derived API routes share the same base: /auth/*, /mcp/chat, /ml/run, /api/image-features`);

runVueBuild(target, apiBase);
