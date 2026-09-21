/**
 * Moves the clock 400 days forward for the whole suite.
 *
 * Loaded only by `vitest.future.config.ts`, which `npm run test:future` and the deploy gate
 * run beside the normal suite. Its job is to make a particular class of test failure happen
 * now rather than later.
 *
 * ## The failure
 *
 * A fixture carries a hardcoded date that is comfortably in the future when it is written —
 * `expiresAt: '2026-09-09T00:00:00.000Z'` — and the code under test correctly derives "expired"
 * from the real clock. On the day the date passes, the suite goes red for a reason that has
 * nothing to do with any change, during whoever's deploy happens to be running. It fired twice
 * in this repository in three weeks, on 3 and 9 September 2026, in two different files.
 *
 * Running the suite from the future turns a calendar bomb into an ordinary failing test at the
 * moment it is written, when the person who wrote it is looking.
 *
 * ## What it does not do
 *
 * It does not fake time in the sense `vi.useFakeTimers` does: timers still run at real speed,
 * and only the wall clock is offset. Tests that construct a date from explicit arguments are
 * untouched, because a fixture that names its own "now" was never the problem.
 */
const SHIFT_MS = 400 * 24 * 60 * 60 * 1000;
const RealDate = Date;
const realNow = Date.now;

class ShiftedDate extends RealDate {
  constructor(...args: unknown[]) {
    // `new Date()` with no arguments is the only form that reads the clock; every other form
    // names its own moment and must be left exactly as written.
    if (args.length === 0) {
      super(realNow() + SHIFT_MS);
      return;
    }
    super(...(args as ConstructorParameters<typeof Date>));
  }

  static now() {
    return realNow() + SHIFT_MS;
  }
}

globalThis.Date = ShiftedDate as DateConstructor;
