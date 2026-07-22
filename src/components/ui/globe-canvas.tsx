'use client';

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * three.js + fiber + drei are ~700KB before compression. This module is loaded only via
 * the lazy wrapper in `globe.tsx`, which mounts it on desktop viewports only — never
 * import it directly, or it lands in the shared bundle for every mobile visitor.
 */

function GlobeMesh() {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group ref={meshRef}>
      <Sphere args={[2, 64, 64]}>
        <meshBasicMaterial color="#00C46A" wireframe transparent opacity={0.15} />
      </Sphere>

      {/* Node representing Uganda/Africa */}
      <mesh position={[1.4, 0.5, 1.3]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#00C46A" />
      </mesh>

      {/* Glow effect on the node */}
      <mesh position={[1.4, 0.5, 1.3]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="#4DFFB3" transparent opacity={0.4} />
      </mesh>

      {/* Connection lines simulating the network */}
      <Line
        points={[
          [1.4, 0.5, 1.3],
          [0.8, 1.2, 1.4],
        ]}
        color="#F5B942"
        lineWidth={2}
        transparent
        opacity={0.6}
      />
      <mesh position={[0.8, 1.2, 1.4]}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color="#F5B942" />
      </mesh>

      <Line
        points={[
          [1.4, 0.5, 1.3],
          [1.8, -0.2, 0.8],
        ]}
        color="#4DFFB3"
        lineWidth={2}
        transparent
        opacity={0.6}
      />
      <mesh position={[1.8, -0.2, 0.8]}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color="#4DFFB3" />
      </mesh>
    </group>
  );
}

export default function SportsGlobeCanvas() {
  return (
    <div className="w-full h-[600px] relative pointer-events-none">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <GlobeMesh />
      </Canvas>
    </div>
  );
}
