import { initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();

const db = getFirestore();
const storage = getStorage();
const profanityWords = ['damn', 'hell', 'shit', 'fuck', 'bitch'];

type Submission = {
  userId: string;
  photoUrl: string;
  location: GeoPoint | { latitude: number; longitude: number };
  notes?: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string | null;
  reviewedAt?: Timestamp | null;
  updatedAt?: Timestamp;
};

const toLatLng = (location: Submission['location']): { lat: number; lng: number } => {
  if (location instanceof GeoPoint) {
    return { lat: location.latitude, lng: location.longitude };
  }
  return { lat: location.latitude, lng: location.longitude };
};

const isWithinValidRange = (lat: number, lng: number): boolean =>
  lat >= 39.8 && lat <= 40.2 && lng >= -75.3 && lng <= -74.9;

const containsProfanity = (text?: string): boolean => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return profanityWords.some((word) => lower.includes(word));
};

const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
};

const extractStoragePathFromUrl = (photoUrl: string): string | null => {
  try {
    const url = new URL(photoUrl);
    const marker = '/o/';
    const index = url.pathname.indexOf(marker);
    if (index === -1) return null;
    const encodedPath = url.pathname.slice(index + marker.length);
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
};

export const validateSubmission = onDocumentWritten('submissions/{submissionId}', async (event) => {
  const afterSnapshot = event.data?.after;
  const beforeSnapshot = event.data?.before;

  if (!afterSnapshot?.exists) {
    return;
  }

  if (beforeSnapshot?.exists) {
    return;
  }

  const submissionId = event.params.submissionId;
  const data = afterSnapshot.data() as Submission;
  const updates: Partial<Submission> & { moderationFlags?: string[] } = {
    updatedAt: Timestamp.now(),
  };
  const moderationFlags: string[] = [];

  const latLng = toLatLng(data.location);
  if (!isWithinValidRange(latLng.lat, latLng.lng)) {
    moderationFlags.push('invalid_coordinates');
  }

  const storagePath = extractStoragePathFromUrl(data.photoUrl);
  if (!storagePath) {
    moderationFlags.push('invalid_photo_url');
  } else {
    const [exists] = await storage.bucket().file(storagePath).exists();
    if (!exists) {
      moderationFlags.push('photo_not_found');
    }
  }

  if (containsProfanity(data.notes)) {
    moderationFlags.push('profanity_detected');
  }

  const nearbyCandidates = await db
    .collection('submissions')
    .where('status', 'in', ['pending', 'verified'])
    .get();

  const duplicate = nearbyCandidates.docs
    .filter((doc) => doc.id !== submissionId)
    .some((doc) => {
      const candidate = doc.data() as Submission;
      const candidateLatLng = toLatLng(candidate.location);
      return distanceMeters(latLng, candidateLatLng) <= 10;
    });

  if (duplicate) {
    moderationFlags.push('duplicate_within_10m');
  }

  if (moderationFlags.length > 0) {
    updates.status = 'rejected';
    updates.rejectionReason = moderationFlags.join(', ');
    updates.reviewedAt = Timestamp.now();
  }

  updates.moderationFlags = moderationFlags;
  await afterSnapshot.ref.set(updates, { merge: true });

  logger.info('Submission validation complete', {
    submissionId,
    moderationFlags,
  });
});

export const cleanupRejectedSubmissions = onSchedule('every day 02:00', async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rejectedSnapshot = await db
    .collection('submissions')
    .where('status', '==', 'rejected')
    .where('reviewedAt', '<=', cutoff)
    .get();

  const referencedPhotoPaths = new Set<string>();
  const batch = db.batch();

  for (const doc of rejectedSnapshot.docs) {
    const submission = doc.data() as Submission;
    const photoPath = extractStoragePathFromUrl(submission.photoUrl);
    if (photoPath) {
      referencedPhotoPaths.add(photoPath);
      await storage.bucket().file(photoPath).delete({ ignoreNotFound: true });
    }
    batch.delete(doc.ref);
  }

  if (!rejectedSnapshot.empty) {
    await batch.commit();
  }

  const [submissionFiles] = await storage.bucket().getFiles({ prefix: 'submissions/' });
  const allSubmissionSnapshot = await db.collection('submissions').select('photoUrl').get();

  const activePhotoPaths = new Set<string>();
  for (const doc of allSubmissionSnapshot.docs) {
    const photoUrl = doc.get('photoUrl') as string | undefined;
    if (!photoUrl) continue;
    const path = extractStoragePathFromUrl(photoUrl);
    if (path) activePhotoPaths.add(path);
  }

  for (const file of submissionFiles) {
    if (!activePhotoPaths.has(file.name) && !referencedPhotoPaths.has(file.name)) {
      await file.delete({ ignoreNotFound: true });
    }
  }

  logger.info('Rejected submissions cleanup finished', {
    deletedSubmissions: rejectedSnapshot.size,
  });
});
