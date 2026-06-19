'use strict';
 
const express = require('express');
const puppeteer = require('puppeteer');
const { marked } = require('marked');
const path = require('path');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
 
// ─── PDF styles ─────────────────────────────────────────────────────────────
 
const PDF_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
 
  * { box-sizing: border-box; }
 
  body {
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.7;
    color: #1a1a2e;
    max-width: 920px;
    margin: 0 auto;
    padding: 20px 36px;
  }
 
  h1 { font-size: 24px; border-bottom: 3px solid #4a90d9; padding-bottom: 10px; margin-bottom: 20px; color: #0f172a; }
  h2 { font-size: 19px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-top: 36px; margin-bottom: 14px; color: #1e293b; }
  h3 { font-size: 15px; color: #334155; margin-top: 22px; margin-bottom: 10px; }
  h4 { font-size: 13px; color: #475569; margin-top: 16px; margin-bottom: 8px; }
 
  p { margin-bottom: 12px; }
 
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 16px 0;
    font-size: 12px;
    page-break-inside: auto;
    break-inside: auto;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #dde3ea; padding: 8px 12px; text-align: left; }
  th { background: #f0f4f8; font-weight: 600; }
  tr:nth-child(even) td { background: #fafbfc; }
 
  code {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 11px;
    background: #f3f4f6;
    padding: 2px 5px;
    border-radius: 3px;
    color: #be123c;
  }
  pre {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 14px 16px;
    overflow: auto;
    font-size: 11px;
    margin: 14px 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  pre code { background: transparent; color: #334155; padding: 0; }
 
  blockquote {
    border-left: 4px solid #6366f1;
    margin: 14px 0;
    padding: 8px 16px;
    background: #f5f3ff;
    color: #4b5563;
    border-radius: 0 4px 4px 0;
  }
 
  ul, ol { padding-left: 22px; margin-bottom: 12px; }
  li { margin-bottom: 4px; }
 
  hr { border: none; border-top: 2px solid #e2e8f0; margin: 28px 0; }
 
  a { color: #4a90d9; text-decoration: none; }
 
  img { max-width: 100%; height: auto; }
 
  /* Mermaid : border sur le SVG, pas sur le conteneur pour éviter les cadres vides */
  .mermaid {
    display: flex;
    justify-content: center;
    margin: 20px 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .mermaid svg {
    max-width: 100%;
    height: auto;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #fafafa;
    padding: 10px;
    box-sizing: border-box;
    display: block;
  }
 
  h2 { page-break-before: auto; }
 
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }
`;
 
// ─── Helpers ─────────────────────────────────────────────────────────────────
 
function buildHtml(bodyHtml, title) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${PDF_STYLE}</style>
</head>
<body>
  ${bodyHtml}
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    document.querySelectorAll('pre code.language-mermaid').forEach(function(el) {
      var div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = el.textContent;
      el.closest('pre').replaceWith(div);
    });
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true },
      sequence: { useMaxWidth: true },
    });
  </script>
</body>
</html>`;
}
 
// ─── Concurrency guard ────────────────────────────────────────────────────────
 
let busy = false;
 
// ─── Routes ───────────────────────────────────────────────────────────────────
 
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
 
app.post('/api/generate', async (req, res) => {
  if (busy) {
    return res.status(429).json({
      error: 'Une génération est déjà en cours. Veuillez patienter quelques secondes.',
    });
  }
 
  const { markdown, filename = 'document' } = req.body;
 
  if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
    return res.status(400).json({ error: 'Le contenu Markdown est vide.' });
  }
  if (markdown.length > 500_000) {
    return res.status(400).json({ error: 'Document trop volumineux (max 500 Ko de texte).' });
  }
 
  busy = true;
  let browser;
 
  try {
    const safeFilename = filename
      .replace(/\.md$/i, '')
      .replace(/[^a-zA-Z0-9\-_. ]/g, '_')
      .trim() || 'document';
 
    const bodyHtml = marked.parse(markdown);
    const fullHtml = buildHtml(bodyHtml, safeFilename);
 
    try {
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-accelerated-2d-canvas',
        ],
        headless: true,
      });
    } catch (launchErr) {
      // Chromium n'a pas pu démarrer (libs système manquantes, executablePath invalide, etc.)
      console.error('Chromium launch failed:', launchErr.message);
      return res.status(500).json({
        error: "Le moteur PDF (Chromium) n'a pas pu démarrer sur le serveur. Vérifiez l'installation/les dépendances système.",
      });
    }
 
    const page = await browser.newPage();
 
    page.on('console', msg => {
      if (msg.type() === 'error') console.warn('[page]', msg.text());
    });
 
    // networkidle0 attend que TOUTES les requêtes réseau (Google Fonts, CDN mermaid)
    // soient terminées. Si l'un de ces hôtes est lent/bloqué depuis Railway, ça peut
    // timeout. On retombe sur 'load' en cas d'échec plutôt que de planter sec.
    try {
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 60_000 });
    } catch (navErr) {
      console.warn('networkidle0 timeout, fallback to load:', navErr.message);
      await page.setContent(fullHtml, { waitUntil: 'load', timeout: 30_000 });
    }
 
    // Wait for Mermaid to finish rendering all diagrams (ne bloque pas tout si ça échoue)
    try {
      await page.waitForFunction(
        () => {
          const all = document.querySelectorAll('div.mermaid');
          if (all.length === 0) return true;
          return document.querySelectorAll('div.mermaid svg').length >= all.length;
        },
        { timeout: 30_000, polling: 500 },
      );
    } catch (mermaidErr) {
      console.warn('Mermaid render timeout, continuing without waiting:', mermaidErr.message);
    }
 
    await new Promise(r => setTimeout(r, 1000));
 
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:9px;color:#999;width:100%;text-align:center;padding-top:4px;font-family:sans-serif;">${safeFilename}</div>`,
      footerTemplate: `<div style="font-size:9px;color:#999;width:100%;text-align:center;padding-bottom:4px;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
 
    // Garde-fou : un PDF valide commence toujours par "%PDF-". Si ce n'est pas le cas
    // (buffer vide, tronqué, ou erreur silencieuse de Chromium), on refuse de l'envoyer
    // comme un fichier "réussi" — c'est ça qui causait le "fichier corrompu" côté client.
    const isValidPdf = Buffer.isBuffer(pdfBuffer) &&
      pdfBuffer.length > 100 &&
      pdfBuffer.subarray(0, 5).toString('latin1') === '%PDF-';
 
    if (!isValidPdf) {
      console.error('PDF buffer invalide, taille:', pdfBuffer ? pdfBuffer.length : 'null');
      return res.status(500).json({
        error: 'Le PDF généré est invalide (génération incomplète). Veuillez réessayer.',
      });
    }
 
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
 
  } catch (err) {
    console.error('PDF generation error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur lors de la génération du PDF. Veuillez réessayer.' });
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    busy = false;
  }
});
 
// ─── Start ────────────────────────────────────────────────────────────────────
 
app.listen(PORT, () => {
  console.log(`MarkPDF running on http://localhost:${PORT}`);
});
