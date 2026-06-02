import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const TICKET_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function newReviewState(overrides = {}) {
  return {
    status: 'pending-review',
    autoApproved: false,
    requiresAdminReview: true,
    adminComment: '',
    reviewedAt: '',
    reviewer: '',
    failureReason: '',
    ...overrides
  };
}

export function createTicketStore(ticketDir) {
  const rootDir = resolve(ticketDir);

  async function ensureTicketDir() {
    await mkdir(rootDir, { recursive: true });
  }

  function isValidTicketId(id) {
    return typeof id === 'string' && TICKET_ID_PATTERN.test(id);
  }

  function ticketPath(id) {
    if (!isValidTicketId(id)) {
      throw new Error(`Invalid ticket id: ${id}`);
    }

    const path = resolve(rootDir, `${id}.json`);
    const pathFromRoot = relative(rootDir, path);
    if (!pathFromRoot || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
      throw new Error(`Invalid ticket id: ${id}`);
    }

    return path;
  }

  async function saveTicket(ticket) {
    await ensureTicketDir();
    await writeFile(ticketPath(ticket.id), JSON.stringify(ticket, null, 2), 'utf8');
    return ticket;
  }

  async function getTicket(id) {
    if (!isValidTicketId(id)) {
      return null;
    }

    try {
      return JSON.parse(await readFile(ticketPath(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function listTickets(filter = {}) {
    await ensureTicketDir();
    const files = await readdir(rootDir);
    const tickets = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => JSON.parse(await readFile(join(rootDir, file), 'utf8')))
    );

    return tickets
      .filter((ticket) => !filter.status || ticket.review?.status === filter.status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async function updateTicket(id, updater) {
    if (typeof updater !== 'function') {
      throw new TypeError('updateTicket requires an updater function');
    }

    const ticket = await getTicket(id);
    if (!ticket) {
      return null;
    }

    const updated = updater(ticket);
    await saveTicket(updated);
    return updated;
  }

  return {
    saveTicket,
    getTicket,
    listTickets,
    updateTicket
  };
}
