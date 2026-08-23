/**
 * Flattens `npm audit --json` into one row per advisory, per tree.
 *
 * npm's report is a graph keyed by package, where a single upstream CVE appears once as the
 * vulnerable package and again on every dependent that reaches it. Counting those rows as
 * separate advisories is how "9 moderate vulnerabilities" gets reported for what is actually
 * one bug — and how a remediation plan ends up chasing nine ghosts instead of one fix.
 *
 * This resolves each entry back to the advisories that actually cite a CVE, records the
 * dependency path that reaches them, and keeps the highest severity when a package is
 * reachable through more than one route.
 */
import { readFileSync, writeFileSync } from 'node:fs';

type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

type AuditVia = string | {
  source?: number;
  name?: string;
  title?: string;
  url?: string;
  severity?: Severity;
  range?: string;
};

type AuditVulnerability = {
  name: string;
  severity: Severity;
  isDirect: boolean;
  via: AuditVia[];
  effects?: string[];
  range?: string;
  nodes?: string[];
  fixAvailable?: boolean | { name: string; version: string; isSemVerMajor: boolean };
};

export type NormalizedAdvisory = {
  advisoryId: string;
  title: string;
  url?: string;
  package: string;
  severity: Severity;
  tree: 'root' | 'functions';
  direct: boolean;
  dependencyPath: string[];
  affectedVersions?: string;
  fix: 'none' | 'in-range' | 'major-change';
  fixDetail?: string;
  nodes?: string[];
};

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export function normalize(
  report: { vulnerabilities?: Record<string, AuditVulnerability> },
  tree: 'root' | 'functions',
) {
  const vulnerabilities = report.vulnerabilities ?? {};
  const advisories = new Map<string, NormalizedAdvisory>();

  /** Walks `effects` backwards to show how a direct dependency reaches this package. */
  function pathTo(name: string, seen = new Set<string>()): string[] {
    if (seen.has(name)) return [name];
    seen.add(name);
    const entry = vulnerabilities[name];
    if (!entry || entry.isDirect) return [name];
    const parent = (entry.effects ?? []).find((effect) => vulnerabilities[effect]);
    return parent ? [...pathTo(parent, seen), name] : [name];
  }

  for (const [name, entry] of Object.entries(vulnerabilities)) {
    for (const via of entry.via) {
      // A string `via` names another vulnerable package, not an advisory: this row exists
      // only because something upstream is broken. The CVE is recorded there.
      if (typeof via === 'string') continue;
      const advisoryId = via.source ? `GHSA-src-${via.source}` : `${name}-unknown`;
      const key = `${tree}:${advisoryId}:${via.name ?? name}`;
      const severity = via.severity ?? entry.severity;
      const fixAvailable = entry.fixAvailable;
      const fix: NormalizedAdvisory['fix'] = !fixAvailable
        ? 'none'
        : fixAvailable === true
          ? 'in-range'
          : fixAvailable.isSemVerMajor ? 'major-change' : 'in-range';

      const existing = advisories.get(key);
      if (existing && SEVERITY_RANK[existing.severity] >= SEVERITY_RANK[severity]) continue;

      advisories.set(key, {
        advisoryId,
        title: via.title ?? 'unknown advisory',
        url: via.url,
        package: via.name ?? name,
        severity,
        tree,
        direct: entry.isDirect,
        dependencyPath: pathTo(via.name ?? name),
        affectedVersions: via.range ?? entry.range,
        fix,
        fixDetail: typeof fixAvailable === 'object'
          ? `${fixAvailable.name}@${fixAvailable.version}${fixAvailable.isSemVerMajor ? ' (major)' : ''}`
          : undefined,
        nodes: entry.nodes?.slice(0, 3),
      });
    }
  }

  return [...advisories.values()].sort((left, right) =>
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity]
    || left.package.localeCompare(right.package));
}

function main() {
  const [rootFile, functionsFile, outFile] = process.argv.slice(2);
  const rows = [
    ...normalize(JSON.parse(readFileSync(rootFile, 'utf8')), 'root'),
    ...normalize(JSON.parse(readFileSync(functionsFile, 'utf8')), 'functions'),
  ];
  writeFileSync(outFile, `${JSON.stringify(rows, null, 2)}\n`);

  const bySeverity = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.severity] = (acc[row.severity] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Distinct advisories: ${rows.length}`, bySeverity);
  for (const row of rows) {
    console.log(`  [${row.severity}] ${row.tree} ${row.package} ${row.advisoryId} `
      + `path=${row.dependencyPath.join('>')} direct=${row.direct} fix=${row.fix}${row.fixDetail ? ` (${row.fixDetail})` : ''}`);
  }
}

if (process.argv[1]?.includes('normalize-audit')) main();
