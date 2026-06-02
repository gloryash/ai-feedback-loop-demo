import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTicketStore, newReviewState } from '../src/ticketStore.js';

async function makeStore() {
  const dir = await mkdtemp(join(tmpdir(), 'ticket-store-'));
  return {
    dir,
    store: createTicketStore(dir)
  };
}

test('newReviewState returns pending admin review defaults', () => {
  const review = newReviewState();

  assert.deepEqual(review, {
    status: 'pending-review',
    autoApproved: false,
    requiresAdminReview: true,
    adminComment: '',
    reviewedAt: '',
    reviewer: '',
    failureReason: ''
  });
});

test('newReviewState applies overrides', () => {
  const review = newReviewState({
    status: 'approved',
    autoApproved: true,
    requiresAdminReview: false,
    reviewer: 'admin'
  });

  assert.deepEqual(review, {
    status: 'approved',
    autoApproved: true,
    requiresAdminReview: false,
    adminComment: '',
    reviewedAt: '',
    reviewer: 'admin',
    failureReason: ''
  });
});

test('saveTicket writes ticket JSON and getTicket reads it back', async () => {
  const { dir, store } = await makeStore();
  const ticket = {
    id: 'ticket-1',
    title: 'Coupon bug',
    createdAt: '2026-06-01T10:00:00.000Z',
    review: newReviewState()
  };

  await store.saveTicket(ticket);

  const stored = JSON.parse(await readFile(join(dir, 'ticket-1.json'), 'utf8'));
  assert.deepEqual(stored, ticket);
  assert.deepEqual(await store.getTicket('ticket-1'), ticket);
});

test('getTicket returns null when ticket does not exist', async () => {
  const { store } = await makeStore();

  assert.equal(await store.getTicket('missing'), null);
});

test('listTickets returns newest tickets first', async () => {
  const { store } = await makeStore();
  const older = {
    id: 'older',
    createdAt: '2026-06-01T10:00:00.000Z',
    review: newReviewState()
  };
  const newer = {
    id: 'newer',
    createdAt: '2026-06-02T10:00:00.000Z',
    review: newReviewState({ status: 'approved' })
  };

  await store.saveTicket(older);
  await store.saveTicket(newer);

  const tickets = await store.listTickets();

  assert.deepEqual(tickets.map((ticket) => ticket.id), ['newer', 'older']);
});

test('listTickets filters by review status', async () => {
  const { store } = await makeStore();
  await store.saveTicket({
    id: 'pending',
    createdAt: '2026-06-01T10:00:00.000Z',
    review: newReviewState()
  });
  await store.saveTicket({
    id: 'approved',
    createdAt: '2026-06-02T10:00:00.000Z',
    review: newReviewState({ status: 'approved' })
  });

  const tickets = await store.listTickets({ status: 'pending-review' });

  assert.deepEqual(tickets.map((ticket) => ticket.id), ['pending']);
});

test('updateTicket returns null when ticket does not exist', async () => {
  const { store } = await makeStore();

  assert.equal(await store.updateTicket('missing', (ticket) => ({ ...ticket, title: 'Nope' })), null);
});

test('saveTicket rejects invalid ticket ids', async () => {
  const { store } = await makeStore();

  await assert.rejects(
    store.saveTicket({ id: '../outside', title: 'Unsafe' }),
    /Invalid ticket id/
  );
});

test('getTicket returns null for invalid ticket ids', async () => {
  const { store } = await makeStore();

  assert.equal(await store.getTicket('../outside'), null);
  assert.equal(await store.getTicket('a/b'), null);
});

test('updateTicket requires an updater function', async () => {
  const { store } = await makeStore();

  await assert.rejects(
    store.updateTicket('ticket-1', { title: 'Updated' }),
    /updater function/
  );
});

test('updateTicket writes updater function result back to JSON', async () => {
  const { store } = await makeStore();
  await store.saveTicket({
    id: 'ticket-1',
    title: 'Original',
    createdAt: '2026-06-01T10:00:00.000Z',
    review: newReviewState()
  });

  const updated = await store.updateTicket('ticket-1', (ticket) => ({
    ...ticket,
    title: 'Updated by function'
  }));

  assert.equal(updated.title, 'Updated by function');
  assert.deepEqual(await store.getTicket('ticket-1'), updated);
});
