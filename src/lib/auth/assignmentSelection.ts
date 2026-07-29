'use client';

const KEY_PREFIX = 'goalplace256:assignment:';

export type AssignmentKind = 'team' | 'league';

export function selectedAssignmentId(kind: AssignmentKind) {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(`${KEY_PREFIX}${kind}`) ?? undefined;
}

export function storeSelectedAssignmentId(kind: AssignmentKind, id: string) {
  window.localStorage.setItem(`${KEY_PREFIX}${kind}`, id);
}
