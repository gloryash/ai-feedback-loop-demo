import express from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAutomationConfigSync } from './automationConfig.js';
import { routeAutomation } from './automationRouter.js';
import { classifyReport } from './classifier.js';
import { addIssueLabels as defaultAddIssueLabels, createGitHubIssue } from './githubIssue.js';
import { quote } from './pricing.js';
import { reviewDecisionForReport } from './reviewPolicy.js';
import { approveTicketForAi } from './reviewWorkflow.js';
import { createTicketStore, newReviewState } from './ticketStore.js';

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

function nowIso() {
  return new Date().toISOString();
}

function isTerminalReview(ticket) {
  return ['sent-to-ai', 'rejected'].includes(ticket?.review?.status);
}

function notFound(res) {
  res.status(404).json({ error: 'Ticket not found' });
}

function conflict(res) {
  res.status(409).json({ error: 'Ticket review is already complete' });
}

export function createApp(options = {}) {
  const app = express();
  const env = options.env || process.env;
  const storageDir = options.storageDir || process.env.STORAGE_DIR || join(projectRoot, 'storage');
  const publicBaseUrl = options.publicBaseUrl || env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  const automationConfig = options.automationConfig || loadAutomationConfigSync({ env, cwd: projectRoot });
  const createIssue = options.createGitHubIssue || createGitHubIssue;
  const addIssueLabels = options.addIssueLabels || defaultAddIssueLabels;
  const uploadDir = join(storageDir, 'uploads');
  const ticketDir = join(storageDir, 'tickets');
  const ticketStore = options.ticketStore || createTicketStore(ticketDir);
  const activeReviewOperations = new Set();

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
      const decision = reviewDecisionForReport(report);
      const timestamp = nowIso();
      report.createdAt = timestamp;
      report.updatedAt = timestamp;
      report.review = newReviewState({
        status: decision.status,
        autoApproved: decision.autoApproved,
        requiresAdminReview: decision.requiresAdminReview,
        reason: decision.reason
      });

      await ticketStore.saveTicket(report);

      let ticket = report;
      let github = { created: false, reason: 'Ticket is pending administrator review.' };

      if (decision.autoApproved) {
        const approval = await approveTicketForAi({
          ticket,
          config: automationConfig,
          env,
          createGitHubIssue: createIssue,
          addIssueLabels
        });
        const reviewedAt = nowIso();
        ticket = {
          ...ticket,
          updatedAt: reviewedAt,
          automation: approval.automation,
          github: approval.github,
          issueBody: approval.issueBody,
          review: {
            ...ticket.review,
            status: 'sent-to-ai',
            autoApproved: true,
            requiresAdminReview: false,
            reviewedAt,
            reviewer: 'system'
          }
        };
        await ticketStore.saveTicket(ticket);
        github = approval.github;
      }

      res.status(201).json({
        ticket: { id, saved: true },
        classification: ticket.classification,
        automation: ticket.automation,
        review: ticket.review,
        github
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/tickets', async (req, res, next) => {
    try {
      const tickets = await ticketStore.listTickets({ status: cleanField(req.query.status) });
      res.json({ tickets });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/tickets/:id', async (req, res, next) => {
    try {
      const ticket = await ticketStore.getTicket(req.params.id);
      if (!ticket) {
        notFound(res);
        return;
      }

      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/tickets/:id/comment', async (req, res, next) => {
    try {
      const updatedAt = nowIso();
      const ticket = await ticketStore.updateTicket(req.params.id, (current) => ({
        ...current,
        updatedAt,
        review: {
          ...newReviewState(),
          ...(current.review || {}),
          adminComment: cleanField(req.body?.comment),
        }
      }));

      if (!ticket) {
        notFound(res);
        return;
      }

      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/tickets/:id/approve', async (req, res, next) => {
    let claimed = false;
    try {
      if (activeReviewOperations.has(req.params.id)) {
        conflict(res);
        return;
      }
      activeReviewOperations.add(req.params.id);
      claimed = true;

      const ticket = await ticketStore.getTicket(req.params.id);
      if (!ticket) {
        notFound(res);
        return;
      }
      if (isTerminalReview(ticket)) {
        conflict(res);
        return;
      }

      const approval = await approveTicketForAi({
        ticket,
        config: automationConfig,
        env,
        createGitHubIssue: createIssue,
        addIssueLabels
      });
      const reviewedAt = nowIso();
      const updated = {
        ...ticket,
        updatedAt: reviewedAt,
        automation: approval.automation,
        github: approval.github,
        issueBody: approval.issueBody,
        review: {
          ...newReviewState(),
          ...(ticket.review || {}),
          status: 'sent-to-ai',
          autoApproved: false,
          requiresAdminReview: false,
          reviewedAt,
          reviewer: 'admin'
        }
      };
      await ticketStore.saveTicket(updated);

      res.json({ ticket: updated, github: approval.github });
    } catch (error) {
      next(error);
    } finally {
      if (claimed) {
        activeReviewOperations.delete(req.params.id);
      }
    }
  });

  app.post('/api/admin/tickets/:id/reject', async (req, res, next) => {
    let claimed = false;
    try {
      if (activeReviewOperations.has(req.params.id)) {
        conflict(res);
        return;
      }
      activeReviewOperations.add(req.params.id);
      claimed = true;

      const ticket = await ticketStore.getTicket(req.params.id);
      if (!ticket) {
        notFound(res);
        return;
      }
      if (isTerminalReview(ticket)) {
        conflict(res);
        return;
      }

      const reviewedAt = nowIso();
      const updated = {
        ...ticket,
        updatedAt: reviewedAt,
        review: {
          ...newReviewState(),
          ...(ticket.review || {}),
          status: 'rejected',
          requiresAdminReview: false,
          reviewedAt,
          reviewer: 'admin',
          failureReason: cleanField(req.body?.reason)
        }
      };
      await ticketStore.saveTicket(updated);

      res.json({ ticket: updated });
    } catch (error) {
      next(error);
    } finally {
      if (claimed) {
        activeReviewOperations.delete(req.params.id);
      }
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
