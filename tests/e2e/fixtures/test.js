const base = require('@playwright/test');

const test = base.test.extend({
  page: async ({ page }, use, testInfo) => {
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
