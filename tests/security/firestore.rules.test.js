import { readFileSync } from 'node:fs';
import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore';

let testEnv;

const baseSubmission = (uid, id = 'sub-1') => ({
  id,
  userId: uid,
  userEmail: `${uid}@example.com`,
  photoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/submissions%2F' + uid + '%2Fimg.jpg?alt=media',
  location: { latitude: 39.95, longitude: -75.16 },
  severity: 3,
  notes: 'reported',
  status: 'pending',
  submittedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  reviewedAt: null,
  reviewedBy: null,
  rejectionReason: null,
  createdSpeedBumpId: null,
});

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'speedbump-security',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Firestore rules', () => {
  it('blocks unauthenticated reads for submissions', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'submissions/abc')));
  });

  it('allows authenticated read for submissions', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'submissions/sub-1'), {
        ...baseSubmission('alice'),
        submittedAt: new Date(),
        updatedAt: new Date(),
      });
    });

    const db = testEnv.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(db, 'submissions/sub-1')));
  });

  it('enforces owner-only write and rate limit metadata update', async () => {
    const ctx = testEnv.authenticatedContext('alice');
    const db = ctx.firestore();
    const batch = writeBatch(db);

    batch.set(doc(db, 'submissions/sub-1'), baseSubmission('alice', 'sub-1'));
    batch.set(doc(db, 'users/alice/meta/rate_limits'), {
      windowStartedAt: serverTimestamp(),
      submissionCount: 1,
    });

    await assertSucceeds(batch.commit());
  });

  it('rejects submissions outside Philadelphia bounds', async () => {
    const ctx = testEnv.authenticatedContext('alice');
    const db = ctx.firestore();
    const batch = writeBatch(db);

    const bad = baseSubmission('alice', 'sub-outside');
    bad.location = { latitude: 42.0, longitude: -75.16 };

    batch.set(doc(db, 'submissions/sub-outside'), bad);
    batch.set(doc(db, 'users/alice/meta/rate_limits'), {
      windowStartedAt: serverTimestamp(),
      submissionCount: 1,
    });

    await assertFails(batch.commit());
  });

  it('rejects 11th submission within same one-hour window', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice/meta/rate_limits'), {
        windowStartedAt: new Date(),
        submissionCount: 10,
      });
    });

    const ctx = testEnv.authenticatedContext('alice');
    const db = ctx.firestore();
    const batch = writeBatch(db);

    batch.set(doc(db, 'submissions/sub-11'), baseSubmission('alice', 'sub-11'));
    batch.set(doc(db, 'users/alice/meta/rate_limits'), {
      windowStartedAt: new Date(),
      submissionCount: 11,
    });

    await assertFails(batch.commit());
  });

  it('allows admin delete on submissions', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'submissions/sub-delete'), {
        ...baseSubmission('alice', 'sub-delete'),
        submittedAt: new Date(),
        updatedAt: new Date(),
      });
    });

    const adminDb = testEnv.authenticatedContext('admin', { admin: true }).firestore();
    await assertSucceeds(deleteDoc(doc(adminDb, 'submissions/sub-delete')));
  });
});
