"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupRejectedSubmissions = exports.validateSubmission = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const storage = (0, storage_1.getStorage)();
const profanityWords = ['damn', 'hell', 'shit', 'fuck', 'bitch'];
const toLatLng = (location) => {
    if (location instanceof firestore_1.GeoPoint) {
        return { lat: location.latitude, lng: location.longitude };
    }
    return { lat: location.latitude, lng: location.longitude };
};
const isWithinValidRange = (lat, lng) => lat >= 39.8 && lat <= 40.2 && lng >= -75.3 && lng <= -74.9;
const containsProfanity = (text) => {
    if (!text)
        return false;
    const lower = text.toLowerCase();
    return profanityWords.some((word) => lower.includes(word));
};
const distanceMeters = (a, b) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const aa = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * earthRadius * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
};
const extractStoragePathFromUrl = (photoUrl) => {
    try {
        const url = new URL(photoUrl);
        const marker = '/o/';
        const index = url.pathname.indexOf(marker);
        if (index === -1)
            return null;
        const encodedPath = url.pathname.slice(index + marker.length);
        return decodeURIComponent(encodedPath);
    }
    catch {
        return null;
    }
};
exports.validateSubmission = (0, firestore_2.onDocumentWritten)('submissions/{submissionId}', async (event) => {
    const afterSnapshot = event.data?.after;
    const beforeSnapshot = event.data?.before;
    if (!afterSnapshot?.exists) {
        return;
    }
    if (beforeSnapshot?.exists) {
        return;
    }
    const submissionId = event.params.submissionId;
    const data = afterSnapshot.data();
    const updates = {
        updatedAt: firestore_1.Timestamp.now(),
    };
    const moderationFlags = [];
    const latLng = toLatLng(data.location);
    if (!isWithinValidRange(latLng.lat, latLng.lng)) {
        moderationFlags.push('invalid_coordinates');
    }
    const storagePath = extractStoragePathFromUrl(data.photoUrl);
    if (!storagePath) {
        moderationFlags.push('invalid_photo_url');
    }
    else {
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
        const candidate = doc.data();
        const candidateLatLng = toLatLng(candidate.location);
        return distanceMeters(latLng, candidateLatLng) <= 10;
    });
    if (duplicate) {
        moderationFlags.push('duplicate_within_10m');
    }
    if (moderationFlags.length > 0) {
        updates.status = 'rejected';
        updates.rejectionReason = moderationFlags.join(', ');
        updates.reviewedAt = firestore_1.Timestamp.now();
    }
    updates.moderationFlags = moderationFlags;
    await afterSnapshot.ref.set(updates, { merge: true });
    firebase_functions_1.logger.info('Submission validation complete', {
        submissionId,
        moderationFlags,
    });
});
exports.cleanupRejectedSubmissions = (0, scheduler_1.onSchedule)('every day 02:00', async () => {
    const cutoff = firestore_1.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rejectedSnapshot = await db
        .collection('submissions')
        .where('status', '==', 'rejected')
        .where('reviewedAt', '<=', cutoff)
        .get();
    const referencedPhotoPaths = new Set();
    const batch = db.batch();
    for (const doc of rejectedSnapshot.docs) {
        const submission = doc.data();
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
    const activePhotoPaths = new Set();
    for (const doc of allSubmissionSnapshot.docs) {
        const photoUrl = doc.get('photoUrl');
        if (!photoUrl)
            continue;
        const path = extractStoragePathFromUrl(photoUrl);
        if (path)
            activePhotoPaths.add(path);
    }
    for (const file of submissionFiles) {
        if (!activePhotoPaths.has(file.name) && !referencedPhotoPaths.has(file.name)) {
            await file.delete({ ignoreNotFound: true });
        }
    }
    firebase_functions_1.logger.info('Rejected submissions cleanup finished', {
        deletedSubmissions: rejectedSnapshot.size,
    });
});
