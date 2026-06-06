import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function credential() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

function initAdmin() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: credential(),
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

async function main() {
  initAdmin();
  const email = process.env.ADMIN_EMAIL || process.argv[2];
  const role = process.env.ADMIN_ROLE || process.argv[3] || 'platform_admin';

  if (!email) {
    throw new Error('Provide ADMIN_EMAIL or pass an email argument.');
  }

  if (role !== 'platform_admin' && role !== 'super_admin') {
    throw new Error('ADMIN_ROLE must be platform_admin or super_admin.');
  }

  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { role });
  console.log(`Set ${role} custom claim for ${email}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
