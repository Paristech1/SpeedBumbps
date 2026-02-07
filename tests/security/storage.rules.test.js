import { readFileSync } from 'node:fs';
import { before, after, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getStorage, ref, uploadString } from 'firebase/storage';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'speedbump-security-storage',
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

describe('Storage rules', () => {
  it('allows owner upload with valid metadata', async () => {
    const storage = getStorage(testEnv.authenticatedContext('alice').app());
    const fileRef = ref(storage, 'submissions/alice/good.jpg');

    await assertSucceeds(
      uploadString(fileRef, 'abc', 'raw', {
        contentType: 'image/jpeg',
        customMetadata: {
          latitude: '39.95',
          longitude: '-75.16',
        },
      }),
    );
  });

  it('rejects non-owner upload', async () => {
    const storage = getStorage(testEnv.authenticatedContext('bob').app());
    const fileRef = ref(storage, 'submissions/alice/bad.jpg');

    await assertFails(
      uploadString(fileRef, 'abc', 'raw', {
        contentType: 'image/jpeg',
        customMetadata: {
          latitude: '39.95',
          longitude: '-75.16',
        },
      }),
    );
  });

  it('rejects invalid mime type', async () => {
    const storage = getStorage(testEnv.authenticatedContext('alice').app());
    const fileRef = ref(storage, 'submissions/alice/not-image.gif');

    await assertFails(
      uploadString(fileRef, 'abc', 'raw', {
        contentType: 'image/gif',
        customMetadata: {
          latitude: '39.95',
          longitude: '-75.16',
        },
      }),
    );
  });
});
