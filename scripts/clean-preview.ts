/**
 * READ-ONLY preview of a GoalPlace256 data reset.
 *
 * Performs no writes of any kind. Produces the dry-run report that must be reviewed and
 * approved before `clean-execute.ts` is ever run.
 *
 *   npm run clean:preview -- --project <id> --database fg256 --env staging
 *   npm run clean:preview -- --project <id> --database fg256 --env production --preserve <uid>
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { buildProjectMap, parseArgs, validate, GuardError } from './clean/guards';
import { loadCredentials, createApp, destroyApp } from './clean/app';
import { buildInventory, renderInventory } from './clean/inventory';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const aliases = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects ?? {};
  const projectMap = buildProjectMap(aliases);

  const creds = loadCredentials((args as { credentials?: string }).credentials);
  if (!creds) {
    throw new GuardError(
      'No Admin credentials found. Provide --credentials <service-account.json> or set ' +
        'FIREBASE_ADMIN_* variables for the TARGET project.'
    );
  }

  // Preview writes nothing, so no confirmation phrase is required; every other guard applies.
  const plan = validate(args, projectMap, {
    requireConfirm: false,
    credentialProjectId: creds.projectId,
  });

  console.log('GoalPlace256 reset preview (READ ONLY, no writes)\n');

  const app = createApp(creds, `preview-${Date.now()}`);
  try {
    const inventory = await buildInventory(app, plan);
    const report = renderInventory(inventory);
    console.log(report);

    mkdirSync('reports', { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `reports/reset-preview-${plan.environment}-${stamp}`;
    writeFileSync(`${base}.json`, JSON.stringify(inventory, null, 2));
    writeFileSync(
      `${base}.md`,
      `# Reset preview: ${plan.environment}\n\nRead-only. No data was modified.\n\n\`\`\`\n${report}\n\`\`\`\n`
    );

    console.log(`\nWrote ${base}.json and ${base}.md`);
    console.log('\nNothing was deleted. This was a preview.');
  } finally {
    await destroyApp(app);
  }
}

main().catch((error) => {
  if (error instanceof GuardError) {
    console.error(`\nRefusing to run:\n\n${error.message}\n`);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});
