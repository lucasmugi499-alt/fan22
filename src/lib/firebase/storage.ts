'use client';

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { requireFirebaseClient } from './client';

export async function uploadMatchEvidence({
  matchId,
  teamId,
  userId,
  files,
}: {
  matchId: string;
  teamId: string;
  userId: string;
  files: File[];
}) {
  const { storage } = requireFirebaseClient();
  const refs: string[] = [];
  for (const file of files) {
    if (!file.type.match(/^(image|video)\//)) {
      throw new Error(`${file.name} is not an image or video.`);
    }
    if (file.size >= 15 * 1024 * 1024) {
      throw new Error(`${file.name} is larger than the 15 MB field-evidence limit.`);
    }
    const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const path = `matchEvidence/${matchId}/${teamId}/${userId}/${crypto.randomUUID()}.${extension}`;
    await uploadBytes(ref(storage, path), file, {
      contentType: file.type,
      customMetadata: { matchId, teamId, uploadedBy: userId },
    });
    refs.push(path);
  }
  return refs;
}

export async function uploadPublishedMedia({
  ownerType,
  ownerId,
  userId,
  file,
}: {
  ownerType: 'athlete' | 'team' | 'league';
  ownerId: string;
  userId: string;
  file: File;
}) {
  if (!file.type.match(/^(image|video)\//)) {
    throw new Error(`${file.name} is not an image or video.`);
  }
  if (file.size >= 15 * 1024 * 1024) {
    throw new Error(`${file.name} is larger than the 15 MB media limit.`);
  }
  const { storage } = requireFirebaseClient();
  const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  const path = `publishedMedia/${ownerType}/${ownerId}/${userId}/${crypto.randomUUID()}.${extension}`;
  const target = ref(storage, path);
  await uploadBytes(target, file, {
    contentType: file.type,
    customMetadata: { ownerType, ownerId, uploadedBy: userId },
  });
  return getDownloadURL(target);
}
