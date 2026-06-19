const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching Chromium...');
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--disable-background-networking',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
    ],
    headless: true,
    dumpio: true,
  });

  console.log('Creating page...');
  const page = await browser.newPage();

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
</head>
<body>
  <h1>Test PDF</h1>
  <p>This is a test PDF.</p>
</body>
</html>`;

  console.log('Setting content...');
  await page.setContent(html, { waitUntil: 'load' });

  console.log('Generating PDF...');
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    timeout: 45_000,
  });

  console.log('PDF generated, size:', pdfBuffer.length);
  console.log('First 20 bytes:', pdfBuffer.subarray(0, 20));
  console.log('Header check:', pdfBuffer.subarray(0, 5).toString('latin1'));

  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
