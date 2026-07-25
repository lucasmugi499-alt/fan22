import type { ComponentType } from 'react';

/**
 * Shared type for icon components.
 *
 * The app uses a single icon family, `@phosphor-icons/react`. This type promises just what
 * the call sites use — `className` and Phosphor's `weight` — so nav configs and status
 * descriptors can hold an icon without coupling to the pack's full prop surface. `weight`
 * mirrors Phosphor's own union so a real Phosphor icon stays assignable to it.
 * `React.ElementType` cannot be used here: it unions every intrinsic element, and the
 * resulting prop intersection collapses `className` to `never`, which fails the build at
 * every `<Icon className="..." />` call site.
 */
export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

export type IconComponent = ComponentType<{ className?: string; weight?: IconWeight }>;
