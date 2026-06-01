import express from 'express';
import multer from 'multer';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAutomationConfigSync } from './automationConfig.js';
import { routeAutomation } from './automationRouter.js';
import { classifyReport } from './classifier.js';
import { buildIssueBody, createGitHubIssue } from './githubIssue.js';
import { quote } from './pricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function makeTicketId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `T-${stamp}-${suffix}`;
}

function cleanField(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function publicUploadUrl(baseUrl, fileName) {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/uploads/${fileName}`;
}

export function createApp(options = {}) {
  const app = express();
  const env = options.env || process.env;
  const storageDir = options.storageDir || process.env.STORAGE_DIR || join(projectRoot, 'storage');
  const publicBaseUrl = options.publicBaseUrl || env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  const automationConfig = options.automationConfig || loadAutomationConfigSync({ env, cwd: projectRoot });
  const createIssue = options.createGitHubIssue || createGitHubIssue;
  const uploadDir = join(storageDir, 'uploads');
  const ticketDir = join(storageDir, 'tickets');

  mkdirSync(uploadDir, { recursive: true });
  mkdirSync(ticketDir, { recursive: true });

  const upload = multer({
    dest: uploadDir,
    limits: {
      files: 5,
      fileSize: 10 * 1024 * 1024
    }
  });

  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(uploadDir));
  app.use(express.static(join(projectRoot, 'public')));

  app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/quote', (req, res) => {
    res.json(quote(req.query));
  });

  app.post('/api/report', upload.array('attachments', 5), async (req, res, next) => {
    try {
      const id = makeTicketId();
      const attachments = (req.files || []).map((file) => ({
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        url: publicUploadUrl(publicBaseUrl, file.filename)
      }));
      const report = {
        id,
        type: cleanField(req.body.type || 'bug'),
        title: cleanField(req.body.title),
        details: cleanField(req.body.details),
        steps: cleanField(req.body.steps),
        expected: cleanField(req.body.expected),
        actual: cleanField(req.body.actual),
        environment: cleanField(req.body.environment),
        contact: cleanField(req.body.contact),
        attachments
      };

      report.classification = classifyReport(report);
      report.automation = routeAutomation(report, automationConfig);
      const issueReport = {
        ...report,
        classification: {
          ...report.classification,
          labels: report.automation.labels
        }
      };
      report.issueBody = buildIssueBody(issueReport);

      await mkdir(ticketDir, { recursive: true });
      await writeFile(join(ticketDir, `${id}.json`), JSON.stringify(report, null, 2));

      const github = await createIssue(report, env, { labels: report.automation.labels });

      res.status(201).json({
        ticket: { id, saved: true },
        classification: report.classification,
        automation: report.automation,
        github
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  createApp().listen(port, host, () => {
    console.log(`AI feedback loop demo listening on http://localhost:${port}`);
  });
}
