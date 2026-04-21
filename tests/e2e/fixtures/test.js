const base = require('@playwright/test');
const { resetE2EState } = require('./e2eOrchestration');

const test = base.test.extend({
  e2eReset: [async ({ request }, use) => {
    // Shared reset orchestration stays scoped to local/e2e runs.
    await resetE2EState(request, { allowUnavailable: true });
    await use();
  }, { auto: true }],
  page: async ({ page }, use, testInfo) => {
    await page.addInitScript(() => {
      const LEGACY_DASHBOARD_KEY = 'ngnl_dashboards_v1';
      const DASHBOARD_INDEX_KEY = 'ngnl_dashboards_index_v2';
      const DASHBOARD_DOC_PREFIX = 'ngnl_dashboard_doc_v2:';
      const originalGetItem = Storage.prototype.getItem;

      Storage.prototype.getItem = function patchedGetItem(key) {
        if (key === LEGACY_DASHBOARD_KEY) {
          const legacyValue = originalGetItem.call(this, key);
          if (legacyValue) return legacyValue;

          const indexRaw = originalGetItem.call(this, DASHBOARD_INDEX_KEY);
          if (!indexRaw) return legacyValue;

          try {
            const ids = JSON.parse(indexRaw);
            if (!Array.isArray(ids) || !ids.length) return '[]';
            const dashboards = ids
              .map((id) => {
                const raw = originalGetItem.call(this, `${DASHBOARD_DOC_PREFIX}${String(id || '').trim()}`);
                if (!raw) return null;
                try {
                  return JSON.parse(raw);
                } catch {
                  return null;
                }
              })
              .filter(Boolean);
            return JSON.stringify(dashboards);
          } catch {
            return legacyValue || '[]';
          }
        }
        return originalGetItem.call(this, key);
      };
    });

    const consoleLines = [];
    const failedRequests = [];
    const badResponses = [];

    page.on('console', (message) => {
      consoleLines.push(`[console:${message.type()}] ${message.text()}`);
    });

    page.on('pageerror', (error) => {
      consoleLines.push(`[pageerror] ${error?.stack || error?.message || String(error)}`);
    });

    page.on('dialog', async (dialog) => {
      consoleLines.push(`[dialog:${dialog.type()}] ${dialog.message()}`);
      try {
        await dialog.dismiss();
      } catch (error) {
        consoleLines.push(`[dialog-error] ${error?.message || String(error)}`);
      }
    });

    page.on('requestfailed', (request) => {
      failedRequests.push(
        `${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'request failed'}`
      );
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        badResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('browser-console', {
        body: Buffer.from(consoleLines.join('\n') || 'No console output captured.', 'utf8'),
        contentType: 'text/plain',
      });
      await testInfo.attach('network-failures', {
        body: Buffer.from(
          [
            'Request failures:',
            failedRequests.join('\n') || 'None',
            '',
            'HTTP >= 400 responses:',
            badResponses.join('\n') || 'None',
          ].join('\n'),
          'utf8'
        ),
        contentType: 'text/plain',
      });
    }
  },
});

module.exports = {
  test,
  expect: base.expect,
};
