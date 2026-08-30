import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Which Firestore queries in this codebase need a composite index, and whether one is declared.
 *
 * ## Why this exists
 *
 * `getStoredStandings` filters on `leagueId` and orders by `rank`. That needs a composite
 * index. There was none, so every client-side table read on the deployed database failed with
 * FAILED_PRECONDITION — and because the whole batch failed with it, a club page lost its
 * record, its table, its fixtures and its results at once. It said "No record yet", which is a
 * claim about the league rather than about the read, and it said it for weeks.
 *
 * Nothing caught it. Typecheck cannot see it, the unit tests use a fake Firestore that has no
 * index requirements, and the emulator does not enforce them either. The only place the
 * requirement is real is production, and the only signal was a page quietly showing less than
 * it should.
 *
 * So the check is static: read the query shapes out of the source, read the declared indexes
 * out of `firestore.indexes.json`, and require one for the other.
 *
 * ## What needs an index, and what does not
 *
 * A conjunction of equality filters does NOT need one: Firestore serves it by merging the
 * single-field indexes it maintains automatically. Verified against the live database rather
 * than assumed — `standings` filtered on `leagueId` and `seasonId` together answers 200 with
 * no composite index declared for that pair.
 *
 * What needs one is an equality filter combined with an ORDERING or a RANGE on a different
 * field, which is exactly the standings query, and `array-contains` combined with anything at
 * all. Those are the only two shapes reported.
 *
 * ## What it deliberately does not do
 *
 * Parse TypeScript. A regex over a chained builder is crude and this knows it, which is why an
 * unrecognised shape is IGNORED rather than reported. A false alarm on every refactor is a
 * check people learn to skip, and a check people skip is worth less than no check at all.
 */

export type QueryShape = {
  file: string;
  line: number;
  collection: string;
  /** Equality-filtered fields, then range/ordered fields, in the order an index needs them. */
  fields: string[];
};

export type DeclaredIndex = { collectionGroup: string; fields: string[] };

const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'lib', 'dist']);

export function sourceFiles(root: string, out: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const path = join(root, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/**
 * The query shapes in one file that would need a composite index.
 *
 * Reads a window of lines after each `collection('name')` because these builders are written
 * across several lines, and stops at the terminal call so a second query further down is not
 * folded into the first.
 */
export function queryShapesIn(file: string, text: string): QueryShape[] {
  const lines = text.split('\n');
  const shapes: QueryShape[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opener = lines[index].match(/collection\(\s*'([A-Za-z][\w]*)'\s*\)/);
    if (!opener) continue;

    const window = lines.slice(index, index + 14).join(' ');
    const chain = window.slice(window.indexOf(opener[0]));
    const terminator = chain.search(/\.get\(|\.count\(|\.stream\(|\.onSnapshot\(|;/);
    const query = terminator > 0 ? chain.slice(0, terminator) : chain.slice(0, 500);

    const equalities = [...query.matchAll(/\.where\(\s*'([\w.]+)'\s*,\s*'(?:==|in)'/g)]
      .map((match) => match[1]);
    const arrayContains = [...query.matchAll(/\.where\(\s*'([\w.]+)'\s*,\s*'array-contains(?:-any)?'/g)]
      .map((match) => match[1]);
    const ranges = [...query.matchAll(/\.where\(\s*'([\w.]+)'\s*,\s*'(?:>=|<=|>|<|!=|not-in)'/g)]
      .map((match) => match[1]);
    const orders = [...query.matchAll(/\.orderBy\(\s*'([\w.]+)'/g)].map((match) => match[1]);

    const constrained = new Set([...equalities, ...arrayContains]);
    // Only an ordering or a range on a field the equality filters do not already pin needs a
    // composite index. An ordering on a field that is pinned to one value orders one value.
    const sorting = [...new Set([...ranges, ...orders])].filter((field) => !constrained.has(field));

    const needsIndex = (constrained.size > 0 && sorting.length > 0)
      // `array-contains` is the exception: combined with any other filter or ordering it needs
      // a composite index even when everything else is an equality.
      || (arrayContains.length > 0 && constrained.size + sorting.length > 1);
    if (!needsIndex) continue;

    // Deduplicated: a window can span two branches of a ternary that build the same query two
    // ways, and the same field named twice is one field to an index.
    const fields = [...new Set([...equalities, ...arrayContains, ...sorting])];
    shapes.push({ file, line: index + 1, collection: opener[1], fields });
  }

  shapes.push(...constraintArrayShapes(file, lines));
  return shapes;
}

/**
 * The other way this codebase writes a query, and the one the standings bug was written in.
 *
 * `firebaseProvider` builds a `QueryConstraint[]` conditionally and hands it to
 * `readCollection('name', constraints)`, so the collection name and its filters never appear in
 * one chained expression. The first pass sees a `readCollection` call with no `.where` attached
 * and a `where(...)` call with no collection attached, and reports nothing — which is exactly
 * how `getStoredStandings` shipped a query with no index.
 *
 * The window looks BACKWARD from the call, because that is where the constraints were built,
 * and stops at the enclosing function's opening line. Bounding it matters more than it sounds:
 * a fixed number of lines bleeds across method boundaries in a file of short methods, and a
 * `readCollection('standings', …)` then inherits the filters of the three methods above it and
 * reports an index shape nobody wrote.
 */
function constraintArrayShapes(file: string, lines: string[]): QueryShape[] {
  const shapes: QueryShape[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const call = lines[index].match(/(?:readCollection|getCollectionDocs)(?:<[^>]*>)?\(\s*'([A-Za-z][\w]*)'/);
    if (!call) continue;

    const body = lines.slice(enclosingFunctionStart(lines, index), index + 3).join(' ');
    const equalities = [...body.matchAll(/\bwhere\(\s*'([\w.]+)'\s*,\s*'(?:==|in)'/g)].map((m) => m[1]);
    const arrayContains = [...body.matchAll(/\bwhere\(\s*'([\w.]+)'\s*,\s*'array-contains(?:-any)?'/g)].map((m) => m[1]);
    const ranges = [...body.matchAll(/\bwhere\(\s*'([\w.]+)'\s*,\s*'(?:>=|<=|>|<|!=|not-in)'/g)].map((m) => m[1]);
    const orders = [...body.matchAll(/\borderBy\(\s*'([\w.]+)'/g)].map((m) => m[1]);

    const constrained = new Set([...equalities, ...arrayContains]);
    const sorting = [...new Set([...ranges, ...orders])].filter((field) => !constrained.has(field));
    const needsIndex = (constrained.size > 0 && sorting.length > 0)
      || (arrayContains.length > 0 && constrained.size + sorting.length > 1);
    if (!needsIndex) continue;

    /*
     * An OPTIONAL filter makes this several queries, and each one needs its own index.
     *
     * `getStoredStandings` pushes `leagueId` if it was given and `seasonId` if it was given,
     * then orders by `rank`. So four queries can run, and Firestore matches an index by
     * PREFIX: `[leagueId, seasonId, rank]` does not serve `where(leagueId) + orderBy(rank)`,
     * because `seasonId` sits between the two. That is the exact query that failed in
     * production while a three-field index for the same collection sat in the file looking
     * like coverage.
     *
     * A mutually exclusive `if / else if` chain is the same idea with a smaller set: only one
     * branch ever applies, so the alternatives are the single filters rather than their
     * combinations.
     */
    const conditional = conditionalEqualityFields(body);
    const always = [...constrained].filter((field) => !conditional.includes(field));
    const exclusive = /else\s+if\s*\([^)]*\)\s*(?:\{[^}]*)?constraints\.push\(\s*where\(/.test(body);

    const variants = exclusive
      ? conditional.map((field) => [field])
      : subsetsOf(conditional);

    for (const variant of variants) {
      const fields = [...new Set([...always, ...variant, ...sorting])];
      // A variant with nothing but the sort is a plain ordered read, which needs no composite.
      if (fields.length === sorting.length) continue;
      shapes.push({ file, line: index + 1, collection: call[1], fields });
    }
  }

  return shapes;
}

/** Equality fields pushed under an `if`, so the query runs with and without each of them. */
function conditionalEqualityFields(body: string): string[] {
  return [...body.matchAll(
    /\bif\s*\([^)]*\)\s*\{?\s*constraints\.push\(\s*where\(\s*'([\w.]+)'\s*,\s*'(?:==|in)'/g,
  )].map((match) => match[1]);
}

/**
 * Every combination of the optional filters, capped.
 *
 * Three optional filters is eight queries, which is already more than any method here has. The
 * cap exists so an unusual builder cannot turn this check into an exponential one; past it the
 * filters are treated as always present, which under-reports rather than hanging.
 */
function subsetsOf(fields: string[]): string[][] {
  if (fields.length === 0) return [[]];
  if (fields.length > 3) return [fields];
  const out: string[][] = [];
  for (let mask = 0; mask < 2 ** fields.length; mask += 1) {
    out.push(fields.filter((_, position) => mask & (1 << position)));
  }
  return out;
}

/**
 * The line the enclosing function opens on, searching back from a call.
 *
 * Matches the shapes this codebase uses for a query-building function: an object-literal method
 * (`async getStoredStandings(options) {`), a plain or exported function, and an arrow assigned
 * to a const. Falls back to a bounded window when none is found, so an unfamiliar shape reads
 * a little too much rather than reading the whole file.
 */
function enclosingFunctionStart(lines: string[], from: number): number {
  const opener = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?[\w$]+\s*(?:=\s*(?:async\s*)?)?\([^)]*\)\s*(?::[^=]*)?(?:=>\s*)?\{\s*$/;
  for (let index = from - 1; index >= Math.max(0, from - 60); index -= 1) {
    if (opener.test(lines[index])) return index;
  }
  return Math.max(0, from - 12);
}

export function declaredIndexes(json: string): DeclaredIndex[] {
  const parsed = JSON.parse(json) as { indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string }> }> };
  return parsed.indexes.map((index) => ({
    collectionGroup: index.collectionGroup,
    // `__name__` is a tiebreaker Firestore appends and never something a query names.
    fields: index.fields.map((field) => field.fieldPath).filter((path) => path !== '__name__'),
  }));
}

/**
 * A shape is covered when some declared index begins with its equality fields in any order and
 * then carries its ordered field.
 *
 * Order-insensitive across the equality prefix on purpose: Firestore serves equality filters
 * from any position in the prefix, and requiring the source to list them in index order would
 * report a gap every time somebody reordered two `where` calls.
 */
export function isCovered(shape: QueryShape, indexes: DeclaredIndex[]): boolean {
  return indexes.some((index) => {
    if (index.collectionGroup !== shape.collection) return false;
    if (index.fields.length < shape.fields.length) return false;
    const prefix = index.fields.slice(0, shape.fields.length);
    return shape.fields.every((field) => prefix.includes(field));
  });
}

export function uncoveredShapes(roots: string[], indexesJson: string): QueryShape[] {
  const indexes = declaredIndexes(indexesJson);
  const uncovered: QueryShape[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      for (const shape of queryShapesIn(file, readFileSync(file, 'utf8'))) {
        if (!isCovered(shape, indexes)) uncovered.push(shape);
      }
    }
  }
  return uncovered;
}
