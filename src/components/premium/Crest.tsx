import { clubColor } from '@/lib/clubColors';
import { cn } from '@/lib/utils';

/**
 * A club crest chip: initials ringed in the club's identity colour (see clubColors.ts), so
 * every club reads as itself across tables, match cards and heroes. `sport` is accepted for
 * call-site compatibility but colour comes from the club, not the sport.
 */
export function Crest({
  name,
  sport,
  size = 32,
  className,
}: {
  name: string;
  sport?: string;
  size?: number;
  className?: string;
}) {
  void sport;
  const { primary } = clubColor(name);
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full border-2 font-bold text-text-strong', className)}
      style={{ width: size, height: size, borderColor: primary, background: 'var(--surface-3)', fontSize: size * 0.32 }}
    >
      {name.replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
    </span>
  );
}
