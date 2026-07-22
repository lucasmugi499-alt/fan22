'use client';

import React from 'react';
import { motion } from 'motion/react';

export function SectionReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      // Scroll-triggered reveals need JS by definition. `data-reveal` lets the <noscript>
      // rule in the root layout force these visible, so the page still reads end-to-end
      // when JavaScript fails or is blocked.
      data-reveal
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
