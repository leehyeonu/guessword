"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  shape: "circle" | "square" | "triangle";
  angle: number;
  velocity: number;
}

const COLORS = [
  "#f43f5e", // Rose
  "#ec4899", // Pink
  "#d946ef", // Fuchsia
  "#a855f7", // Purple
  "#6366f1", // Indigo
  "#3b82f6", // Blue
  "#06b6d4", // Cyan
  "#14b8a6", // Teal
  "#10b981", // Emerald
  "#eab308", // Yellow
  "#f97316", // Orange
];

const SHAPES: ("circle" | "square" | "triangle")[] = ["circle", "square", "triangle"];

export default function Confetti() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // 컴포넌트 마운트 시 85개의 커스텀 파티클 데이터 생성
    const generated: Particle[] = Array.from({ length: 85 }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2; // 방사형 방향
      const velocity = 4 + Math.random() * 8; // 속도
      const size = 6 + Math.random() * 8; // 크기
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];

      return {
        id: i,
        x: 0,
        y: 0,
        color,
        size,
        shape,
        angle,
        velocity,
      };
    });

    setParticles(generated);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden flex items-center justify-center">
      {particles.map((p) => {
        // 초기 속력 폭발 및 중력으로 인한 하강에 대한 벡터 계산
        const targetX = Math.cos(p.angle) * p.velocity * 38;
        const targetYUp = Math.sin(p.angle) * p.velocity * 25 - 120; // 최고 높이
        const targetYDown = targetYUp + 400 + Math.random() * 250;   // 중력에 의해 하강

        return (
          <motion.div
            key={p.id}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: [0, targetX * 0.4, targetX],
              y: [0, targetYUp, targetYDown],
              scale: [0, 1.2, 1, 0.7, 0],
              opacity: [1, 1, 1, 0.8, 0],
              rotate: [0, Math.random() * 360, Math.random() * 720],
            }}
            transition={{
              duration: 2.0 + Math.random() * 0.8,
              ease: "easeOut",
            }}
            style={{
              position: "absolute",
              width: p.size,
              height: p.size,
              backgroundColor: p.shape !== "triangle" ? p.color : "transparent",
              borderRadius: p.shape === "circle" ? "50%" : "0%",
              borderLeft: p.shape === "triangle" ? `${p.size / 2}px solid transparent` : undefined,
              borderRight: p.shape === "triangle" ? `${p.size / 2}px solid transparent` : undefined,
              borderBottom: p.shape === "triangle" ? `${p.size}px solid ${p.color}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
