import Image from 'next/image';
import { cn } from '@/lib/utils';

const MARK_SIZE = {
  sm: 28,
  md: 32,
  lg: 40,
} as const;

type MarkSize = keyof typeof MARK_SIZE;
type LogoSize = 'sm' | 'md' | 'lg';

const LOGO_SIZE_CLASS: Record<LogoSize, string> = {
  sm: 'h-6 w-[11.25rem]',
  md: 'h-7 w-[13.125rem]',
  lg: 'h-10 w-[18.75rem]',
};

export function GoalPlaceMark({
  size = 'md',
  className,
}: {
  size?: MarkSize;
  className?: string;
}) {
  const pixels = MARK_SIZE[size];

  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-[10px] ring-1 ring-white/10 shadow-[0_10px_28px_rgba(0,0,0,0.32)]',
        className,
      )}
      style={{ width: pixels, height: pixels }}
      aria-hidden="true"
    >
      <Image
        src="/brand/goalplace-icon.png"
        alt=""
        fill
        sizes={`${pixels}px`}
        className="object-cover"
        priority={size !== 'sm'}
      />
    </span>
  );
}

export function GoalPlaceLockup({
  size = 'md',
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  return (
    <span className={cn('relative block shrink-0', LOGO_SIZE_CLASS[size], className)}>
      <Image
        src="/brand/goalplace-wordmark-official.png"
        alt="GoalPlace"
        fill
        sizes={size === 'lg' ? '300px' : size === 'md' ? '210px' : '180px'}
        className="object-contain object-left"
        priority
      />
    </span>
  );
}

export function GoalPlacePrimaryLogo({
  className,
}: {
  className?: string;
}) {
  return (
    <span className={cn('relative block aspect-[191/110] w-full max-w-sm', className)}>
      <Image
        src="/brand/goalplace-logo-official.png"
        alt="GoalPlace"
        fill
        sizes="(min-width: 768px) 384px, 80vw"
        className="object-contain"
        priority
      />
    </span>
  );
}
