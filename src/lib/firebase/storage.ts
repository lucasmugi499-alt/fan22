'use client';

import { requireFirebaseClient } from './client';

type UploadSessionResponse = {
  uploadUrl: string;
  storagePath: string;
  downloadUrl?: string;
};

async function requestUploadSession(body: Record<string, unknown>) {
  const { auth } = requireFirebaseClient();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in again before uploading media.');
  const response = await fetch('/api/uploads/session', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Partial<UploadSessionResponse> & { error?: string };
  if (!response.ok || !data.uploadUrl || !data.storagePath) {
    throw new Error(data.error ?? 'GoalPlace256 could not authorize this upload.');
  }
  return data as UploadSessionResponse;
}

async function putSignedObject(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': file.type,
    },
    body: file,
  });
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}.`);
}

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
  const { auth } = requireFirebaseClient();
  if (auth.currentUser?.uid !== userId) throw new Error('Sign in again before uploading match evidence.');
  const refs: string[] = [];
  for (const file of files) {
    if (!file.type.match(/^(image|video)\//)) {
      throw new Error(`${file.name} is not an image or video.`);
    }
    if (file.size >= 15 * 1024 * 1024) {
      throw new Error(`${file.name} is larger than the 15 MB field-evidence limit.`);
    }
    const session = await requestUploadSession({
      kind: 'match_evidence',
      matchId,
      teamId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });
    await putSignedObject(session.uploadUrl, file);
    refs.push(session.storagePath);
  }
  return refs;
}

export async function uploadPublishedMedia({
  ownerType,
  ownerId,
  userId,
  file,
}: {
  ownerType: 'user' | 'athlete' | 'team' | 'league';
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
  const { auth } = requireFirebaseClient();
  if (auth.currentUser?.uid !== userId) throw new Error('Sign in again before uploading media.');
  const session = await requestUploadSession({
    kind: 'published_media',
    ownerType,
    ownerId,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  await putSignedObject(session.uploadUrl, file);
  return session.downloadUrl ?? session.storagePath;
}
