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

/**
 * A recorded decision to ship with a known advisory.
 *
 * Every field here exists so a later reviewer can disagree with the decision on evidence
 * rather than on trust. An entry that cannot answer "which advisory, reached how, in which
 * tree, why not upgraded, and what stops exploitation" is not a decision — it is a note.
 */
type AdvisoryEntry = {
  /** GitHub advisory identifier, so the entry survives package renames and re-reports. */
  advisoryId: string;
  package: string;
  packages?: string[];
  severity: Severity;
  /** Which dependency tree this was found in. A root-clean audit must not clear functions. */
  tree: 'root' | 'functions';
  /** How a direct dependency reaches the vulnerable package. */
  dependencyPath: string;
  /** runtime-direct | runtime-transitive | functions-runtime | dev-tooling | unreachable. */
  classification: string;
  scope: string;
  status: 'accepted-temporarily';
  /** Why no safe upgrade exists today — not why the advisory is unimportant. */
  reason: string;
  /** Evidence the vulnerable API is not reached by attacker-controlled input. */
  reachability: string;
  mitigation: string;
  /** Who accepted this risk. A waiver with no owner is nobody's to renew. */
  owner: string;
  reviewedAt: string;
  expiresOn: string;
  /** The version that resolves it, when upstream has published one. */
  fixedIn?: string;
  reference?: string;
};

type AdvisoryRegister = {
  reviewedAt: string;
  entries: AdvisoryEntry[];
};

const ROOT = process.cwd();
const DEFAULT_REGISTER = path.join(ROOT, 'security/advisory-register.json');

/**
 * Identifier fields a waiver must name. Presence is the bar — an advisory id is short by
 * nature, and holding it to a prose length would be measuring the wrong thing.
 */
const REQUIRED_WAIVER_IDENTIFIERS = [
  'advisoryId',
  'tree',
  'dependencyPath',
  'classification',
  'owner',
] as const;

/**
 * Fields that have to contain actual analysis. These are what a later reviewer reads in
 * order to disagree, so a one-word answer in any of them makes the waiver undecidable.
 */
const REQUIRED_WAIVER_EVIDENCE = ['reason', 'reachability', 'mitigation'] as const;

/** Long enough that "n/a", "transitive" and "dev only" do not pass as analysis. */
const MIN_EVIDENCE_LENGTH = 40;

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
    // Critical is never waivable, and deliberately checked before anything else about the
    // register entry. A register that could grant an exception to a critical advisory is a
    // register that decides the most dangerous case by paperwork.
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

    /**
     * A waiver has to carry evidence, not a sentence.
     *
     * The register previously accepted any non-empty `reason` and `mitigation`, which is how
     * a list of considered decisions decays into a list of things somebody once typed. These
     * fields are what a reviewer needs in order to disagree: which advisory, reached through
     * what path, in which tree, why an upgrade is not available today, and what stops the
     * vulnerable code being reached.
     */
    const record = entry as unknown as Record<string, unknown>;
    const unnamed = REQUIRED_WAIVER_IDENTIFIERS.filter((field) => {
      const value = record[field];
      return typeof value !== 'string' || value.trim().length === 0;
    });
    if (unnamed.length) {
      problems.push(`${vulnerability.name}: waiver does not name ${unnamed.join(', ')}.`);
    }
    const thin = REQUIRED_WAIVER_EVIDENCE.filter((field) => {
      const value = record[field];
      return typeof value !== 'string' || value.trim().length < MIN_EVIDENCE_LENGTH;
    });
    if (thin.length) {
      problems.push(`${vulnerability.name}: waiver gives no real analysis for ${thin.join(', ')}.`);
    }

    /**
     * High-severity advisories in shipped runtime code are held to a stricter bar: a waiver
     * needs an explicit reachability analysis showing attacker-controlled input cannot reach
     * the vulnerable API. Development and build tooling is not held to it, because a
     * vulnerable devDependency is not exposed to anyone but the person running the build.
     */
    const runtimeScope = entry.scope !== 'dev' && entry.scope !== 'build' && entry.scope !== 'tooling';
    if (vulnerability.severity === 'high' && runtimeScope) {
      const analysis = (entry as unknown as Record<string, unknown>).reachability;
      if (typeof analysis !== 'string' || analysis.trim().length < MIN_EVIDENCE_LENGTH) {
        problems.push(
          `${vulnerability.name}: high-severity runtime advisories require a documented reachability analysis before they can be waived.`,
        );
      }
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
