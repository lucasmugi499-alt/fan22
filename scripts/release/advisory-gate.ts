import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

type AuditVia = string | {
  name?: string;
  title?: string;
  url?: string;
  severity?: Severity;
};

type AuditVulnerability = {
  name: string;
  severity: Severity;
  isDirect: boolean;
  via: AuditVia[];
  range?: string;
};

type AuditReport = {
  vulnerabilities?: Record<string, AuditVulnerability>;
  metadata?: {
    vulnerabilities?: Record<string, number>;
  };
};

type AdvisoryEntry = {
  package: string;
  packages?: string[];
  severity: Severity;
  scope: string;
  status: 'accepted-temporarily';
  expiresOn: string;
  reason: string;
  mitigation: string;
};

type AdvisoryRegister = {
  reviewedAt: string;
  entries: AdvisoryEntry[];
};

const ROOT = process.cwd();
const DEFAULT_REGISTER = path.join(ROOT, 'security/advisory-register.json');

const severityRank: Record<Severity, number> = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

/**
 * Cloud Functions carry their own dependency tree, and it was never being audited.
 *
 * `functions/package.json` declares a separate dependency set — including a different
 * `firebase-admin` major line — and it ships to production as the trusted runtime that
 * writes official results. Auditing only the repository root meant the gate reported a clean
 * bill of health for a codebase whose most privileged half it had not looked at.
 */
const AUDIT_TREES = [
  { label: 'root', cwd: ROOT },
  { label: 'functions', cwd: path.join(ROOT, 'functions') },
];

function auditTree(cwd: string, label: string): AuditReport {
  const audit = spawnSync('npm', ['audit', '--json'], { cwd, encoding: 'utf8' });
  if (!audit.stdout.trim()) {
    throw new Error(audit.stderr.trim() || `npm audit produced no JSON output for the ${label} tree.`);
  }
  return JSON.parse(audit.stdout) as AuditReport;
}

/**
 * Merges the trees into one report, tagging each advisory with where it came from so a
 * waiver decision can tell a build-time dev dependency from one running in the finalizer.
 */
export function loadAuditReport(file?: string): AuditReport {
  if (file) return JSON.parse(readFileSync(file, 'utf8')) as AuditReport;

  const vulnerabilities: NonNullable<AuditReport['vulnerabilities']> = {};
  for (const tree of AUDIT_TREES) {
    if (!existsSync(path.join(tree.cwd, 'package.json'))) continue;
    const report = auditTree(tree.cwd, tree.label);
    for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
      // Same package in both trees keeps the higher severity rather than whichever was read
      // second, so a merge can never quietly downgrade a finding.
      const existing = vulnerabilities[name];
      const incoming = { ...vulnerability, tree: tree.label };
      if (!existing || severityRank[incoming.severity] > severityRank[existing.severity]) {
        vulnerabilities[name] = incoming;
      }
    }
  }
  return { vulnerabilities };
}

export function loadRegister(file = DEFAULT_REGISTER): AdvisoryRegister {
  return JSON.parse(readFileSync(file, 'utf8')) as AdvisoryRegister;
}

function arg(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function matchesEntry(name: string, entry: AdvisoryEntry) {
  return entry.package === name || entry.packages?.includes(name) === true;
}

function today() {
  return process.env.GOALPLACE_RELEASE_AUDIT_DATE ?? new Date().toISOString().slice(0, 10);
}

export function evaluateAdvisories(
  audit: AuditReport,
  register: AdvisoryRegister,
  asOf = today(),
) {
  const problems: string[] = [];
  const acknowledged: string[] = [];
  const vulnerabilities = Object.values(audit.vulnerabilities ?? {});

  for (const vulnerability of vulnerabilities) {
    const entry = register.entries.find((candidate) => matchesEntry(vulnerability.name, candidate));
    if (!entry) {
      problems.push(`${vulnerability.name}: unregistered ${vulnerability.severity} advisory.`);
      continue;
    }
    if (vulnerability.severity === 'critical') {
      problems.push(`${vulnerability.name}: critical advisories cannot be waived.`);
      continue;
    }
    if (entry.status !== 'accepted-temporarily') {
      problems.push(`${vulnerability.name}: advisory register status is not accepted-temporarily.`);
    }
    if (entry.expiresOn < asOf) {
      problems.push(`${vulnerability.name}: advisory exception expired on ${entry.expiresOn}.`);
    }
    if (severityRank[vulnerability.severity] > severityRank[entry.severity]) {
      problems.push(`${vulnerability.name}: severity rose from registered ${entry.severity} to ${vulnerability.severity}.`);
    }
    if (!entry.reason.trim() || !entry.mitigation.trim()) {
      problems.push(`${vulnerability.name}: advisory register entry needs reason and mitigation.`);
    }
    acknowledged.push(`${vulnerability.name} (${vulnerability.severity}, ${entry.scope ?? 'registered'})`);
  }

  return {
    ok: problems.length === 0,
    problems,
    acknowledged,
    counts: audit.metadata?.vulnerabilities ?? {},
  };
}

function main() {
  const audit = loadAuditReport(arg('audit-json'));
  const register = loadRegister(arg('register'));
  const result = evaluateAdvisories(audit, register);

  if (!result.ok) {
    console.error('Dependency advisory gate failed:');
    for (const problem of result.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log('Dependency advisory gate passed with registered temporary exceptions.');
  console.log(`Registered advisories: ${result.acknowledged.length}`);
  console.log(`Counts: ${JSON.stringify(result.counts)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
