'use strict';
const express = require('express');
const puppeteer = require('puppeteer');
const { marked } = require('marked');
const path = require('path');
const fs = require('fs'); // Ajout pour sauvegarder le PDF temporairement
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
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
function buildHtml(bodyHtml, title, templateCss, customCss, mermaidTheme = 'default', mermaidThemeVariables = null, mermaidVersion = '11') {
    const activeTemplateCss = templateCss || PDF_STYLE;
    const themeVarsString = mermaidThemeVariables ? JSON.stringify(mermaidThemeVariables) : 'null';
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>${activeTemplateCss}</style>
    <style>${customCss || ''}</style>
</head>
<body>
${bodyHtml}
<script src="https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion}/dist/mermaid.min.js"></script>
<script>
    document.querySelectorAll('pre code.language-mermaid').forEach(function(el) {
        var div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = el.textContent;
        el.closest('pre').replaceWith(div);
    });
    const mermaidConfig = {
        startOnLoad: true,
        theme: '${mermaidTheme}',
        securityLevel: 'loose',
        flowchart: { useMaxWidth: true, htmlLabels: true },
        sequence: { useMaxWidth: true },
    };
    const themeVars = ${themeVarsString};
    if (themeVars) {
        mermaidConfig.themeVariables = themeVars;
    }
    mermaid.initialize(mermaidConfig);
</script>
</body>
</html>`;
}

// ─── Helpers & Memory logging ────────────────────────────────────────────────
function logMemory(step) {
    const mem = process.memoryUsage();
    const toMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    console.log(`[Memory Tracker] Step: ${step} | RSS: ${toMB(mem.rss)} | Heap: ${toMB(mem.heapUsed)} / ${toMB(mem.heapTotal)} | External: ${toMB(mem.external)}`);
}

// ─── Puppeteer Singleton & Lifecycle ─────────────────────────────────────────
let browserInstance;
let browserPromise;
let browserUsageCount = 0;
const MAX_BROWSER_USAGE = 50;

async function getBrowser() {
    if (browserInstance && browserUsageCount < MAX_BROWSER_USAGE) {
        try {
            await browserInstance.version();
            return browserInstance;
        } catch (e) {
            console.log('Instance Puppeteer inactive ou fermée, recréation...');
            await closeBrowser();
        }
    }

    if (!browserPromise) {
        console.log('Lancement d\'une nouvelle instance Puppeteer...');
        logMemory('Before Puppeteer Launch');
        browserPromise = puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-accelerated-2d-canvas',
                '--no-zygote',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
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
        }).then(b => {
            browserInstance = b;
            logMemory('After Puppeteer Launch');
            return b;
        }).catch(err => {
            browserPromise = null;
            throw err;
        });
    }

    return browserPromise;
}

async function closeBrowser() {
    if (browserInstance) {
        try {
            await browserInstance.close();
        } catch (e) {}
        browserInstance = null;
    }
    browserPromise = null;
}

// ─── Concurrency Queue ───────────────────────────────────────────────────────
const queue = [];
let activeGenerations = 0;
const MAX_CONCURRENT_GENERATIONS = 3;

function enqueuePdfGeneration(task) {
    return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject });
        console.log(`Demande ajoutée à la file d'attente. Taille: ${queue.length}, Actives: ${activeGenerations}`);
        processQueue();
    });
}

function processQueue() {
    if (activeGenerations >= MAX_CONCURRENT_GENERATIONS || queue.length === 0) {
        return;
    }
    const { task, resolve, reject } = queue.shift();
    activeGenerations++;
    console.log(`Démarrage d'une génération. Actives: ${activeGenerations}, En attente: ${queue.length}`);
    task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
            activeGenerations--;
            console.log(`Génération terminée. Actives: ${activeGenerations}`);
            processQueue();
        });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Indique si l'IA est configurée (sans exposer la clé)
app.get('/api/ai-status', (_req, res) => res.json({ available: !!process.env.OPENROUTER_API_KEY }));

// ─── AI Layout Optimizer — proxy OpenRouter (modèles gratuits) ────────────────
const FREE_MODELS = [
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-r1:free',
    'microsoft/phi-4-reasoning-plus:free',
];

const AI_LAYOUT_PROMPT = [
    'Tu es un expert en syntaxe Mermaid. Optimise le layout de ce diagramme pour un affichage HORIZONTAL (A4 paysage, slides, dossier technique).',
    '',
    'REGLES ABSOLUES :',
    '1. Retourner UNIQUEMENT le code Mermaid brut. Zero texte avant ou apres. Zero balises markdown.',
    '2. Ne JAMAIS modifier la logique : entites, relations, cardinalites, labels, classDef, styles.',
    '3. Modifier UNIQUEMENT la directive direction et si necessaire l\'ordre des declarations.',
    '4. classDiagram avec 4+ classes -> direction LR. Avec 1-3 classes -> garder l\'existant.',
    '5. graph/flowchart avec 5+ noeuds -> LR. Moins -> garder l\'existant.',
    '6. stateDiagram avec 4+ etats -> direction LR.',
    '7. erDiagram, sequenceDiagram, gitGraph -> retourner tel quel sans modification.',
    '8. Si deja en LR ou deja optimal -> retourner tel quel.',
    '9. Respecter EXACTEMENT la meme indentation.',
].join('\n');

app.post('/api/ai-optimize', async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(503).json({
            error: 'IA non configuree. Ajoutez OPENROUTER_API_KEY dans les variables Railway.',
            configured: false
        });
    }

    const { code } = req.body;
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({ error: 'Le code Mermaid est vide.' });
    }
    if (code.length > 20000) {
        return res.status(400).json({ error: 'Diagramme trop volumineux (max 20 000 car.).' });
    }

    let lastError = null;
    for (const model of FREE_MODELS) {
        try {
            const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey,
                    'HTTP-Referer': 'https://markpdf.app',
                    'X-Title': 'MarkPDF Mermaid Optimizer',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 2000,
                    temperature: 0.1,
                    messages: [
                        { role: 'system', content: AI_LAYOUT_PROMPT },
                        { role: 'user',   content: code }
                    ]
                })
            });

            if (!orRes.ok) {
                const err = await orRes.json().catch(() => ({}));
                lastError = err.error?.message || 'HTTP ' + orRes.status;
                console.warn('[AI] Model', model, 'failed:', lastError);
                continue;
            }

            const data = await orRes.json();
            const raw  = data.choices?.[0]?.message?.content || '';
            const optimized = raw
                .replace(/^[\s\S]*?```(?:mermaid)?\s*/m, (m) => m.includes('```') ? '' : m)
                .replace(/\s*```\s*$/m, '')
                .trim();

            console.log('[AI] OK with:', model);
            return res.json({ optimized, model });

        } catch (err) {
            lastError = err.message;
            console.warn('[AI] Model', model, 'error:', err.message);
        }
    }

    res.status(502).json({ error: 'Tous les modeles IA sont temporairement indisponibles. Reessayez.' });
});

app.post('/api/generate', async (req, res) => {
    console.log('Requête reçue pour générer un PDF');
    logMemory('Start Generation Request');

    const { markdown, filename = 'document', includeHeaderFooter = true, templateCss = '', customCss = '', footerTemplate = '', headerTemplate = '', mermaidTheme = 'default', mermaidThemeVariables = null, mermaidVersion = '11' } = req.body;
    console.log('Contenu Markdown reçu, taille:', markdown ? markdown.length : 0);

    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
        console.log('Contenu Markdown vide ou invalide');
        return res.status(400).json({ error: 'Le contenu Markdown est vide.' });
    }

    // Validate mermaidVersion — only allow known safe versions
    const ALLOWED_MERMAID_VERSIONS = ['9', '10', '11'];
    const safeMermaidVersion = ALLOWED_MERMAID_VERSIONS.includes(String(mermaidVersion)) ? String(mermaidVersion) : '11';

    if (markdown.length > 5_000_000) {
        console.log('Contenu Markdown trop volumineux');
        return res.status(400).json({ error: 'Document trop volumineux (max 5 Mo de texte).' });
    }

    // Wrap la logique de génération dans une tâche pour la file d'attente
    const generationTask = async () => {
        let page;
        try {
            const safeFilename = filename
                .replace(/\.md$/i, '')
                .replace(/[^a-zA-Z0-9\-_. ]/g, '_')
                .trim() || 'document';

            console.log('Conversion du Markdown en HTML...');
            const bodyHtml = marked.parse(markdown);
            const fullHtml = buildHtml(bodyHtml, safeFilename, templateCss, customCss, mermaidTheme, mermaidThemeVariables, safeMermaidVersion);

            const browser = await getBrowser();
            browserUsageCount++;

            console.log('Ouverture d\'un nouvel onglet...');
            page = await browser.newPage();
            page.on('console', msg => {
                if (msg.type() === 'error') console.warn('[page]', msg.text());
            });

            console.log('Chargement du contenu HTML dans la page...');
            try {
                await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 45_000 });
            } catch (navErr) {
                console.warn('Timeout networkidle0, repli sur load:', navErr.message);
                await page.setContent(fullHtml, { waitUntil: 'load', timeout: 20_000 });
            }

            logMemory('HTML Content Set');

            console.log('Attente du rendu des diagrammes Mermaid...');
            try {
                await page.waitForFunction(
                    () => {
                        const all = document.querySelectorAll('div.mermaid');
                        if (all.length === 0) return true;
                        return document.querySelectorAll('div.mermaid svg').length >= all.length;
                    },
                    { timeout: 25_000, polling: 500 },
                );
            } catch (mermaidErr) {
                console.warn('Timeout lors du rendu Mermaid, poursuite de la génération:', mermaidErr.message);
            }

            await new Promise(r => setTimeout(r, 600));
            logMemory('Before PDF Generation');

            console.log('Génération du PDF...');
            const pdfUint8Array = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
                displayHeaderFooter: !!includeHeaderFooter,
                headerTemplate: headerTemplate || `<div style="font-size:9px;color:#999;width:100%;text-align:center;padding-top:4px;font-family:sans-serif;">${safeFilename}</div>`,
                footerTemplate: footerTemplate || `<div style="font-size:9px;color:#999;width:100%;text-align:center;padding-bottom:4px;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
            });

            // Convertir Uint8Array en Buffer Node.js
            const pdfBuffer = Buffer.from(pdfUint8Array);
            console.log('Taille du PDF généré:', pdfBuffer.length, 'octets');

            // Garde-fou
            const isValidPdf = Buffer.isBuffer(pdfBuffer) &&
                pdfBuffer.length > 100 &&
                pdfBuffer.subarray(0, 5).toString('latin1') === '%PDF-';

            if (!isValidPdf) {
                throw new Error('Le buffer généré par Puppeteer ne correspond pas à un PDF valide (génération corrompue).');
            }

            // Sauvegarder temporairement
            const tempPdfPath = `/tmp/${safeFilename}.pdf`;
            try {
                fs.writeFileSync(tempPdfPath, pdfBuffer);
                console.log('PDF sauvegardé temporairement:', tempPdfPath);
            } catch (fsErr) {}

            return { pdfBuffer, safeFilename };
        } finally {
            if (page) {
                console.log('Fermeture de l\'onglet...');
                await page.close().catch(() => {});
            }
        }
    };

    // Lancer la tâche via la file d'attente
    enqueuePdfGeneration(generationTask)
        .then(({ pdfBuffer, safeFilename }) => {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            console.log('Envoi du PDF au client...');
            res.send(pdfBuffer);
        })
        .catch((err) => {
            console.error('Erreur lors de la génération du PDF:', err);
            res.status(500).json({ error: 'Erreur lors de la génération du PDF : ' + err.message });
        });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM reçu. Fermeture de Puppeteer...');
    await closeBrowser();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('SIGINT reçu. Fermeture de Puppeteer...');
    await closeBrowser();
    process.exit(0);
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`MarkPDF running on http://localhost:${PORT}`);
});
