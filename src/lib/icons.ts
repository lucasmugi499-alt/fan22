import type { ComponentType } from 'react';

/**
 * Shared type for icon components.
 *
 * Icons come from several packs (`hugeicons-react`, `@phosphor-icons/react`) whose prop
 * types differ. `React.ElementType` cannot be used here: it unions every intrinsic
 * element, and the resulting prop intersection collapses `className` to `never`, which
 * fails the build at every `<Icon className="..." />` call site. This type promises only
 * what those call sites actually pass.
 */
export type IconComponent = ComponentType<{ className?: string }>;
