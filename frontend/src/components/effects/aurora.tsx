"use client";

import { useEffect, useRef } from "react";

export function Aurora() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = [
      [59, 130, 246],  // blue-500
      [139, 92, 246],  // violet-500
      [16, 185, 129],  // emerald-500
      [99, 102, 241],  // indigo-500
    ];

    function drawBlob(
      cx: number,
      cy: number,
      r: number,
      color: number[],
      phase: number
    ) {
      if (!ctx || !canvas) return;
      const x = cx + Math.sin(time * 0.7 + phase) * 120;
      const y = cy + Math.cos(time * 0.5 + phase * 1.3) * 80;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0.3)`);
      gradient.addColorStop(0.5, `rgba(${color[0]},${color[1]},${color[2]},0.1)`);
      gradient.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function animate() {
      if (!ctx || !canvas) return;
      time += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;

      drawBlob(w * 0.3, h * 0.3, w * 0.5, colors[0], 0);
      drawBlob(w * 0.7, h * 0.5, w * 0.4, colors[1], 2);
      drawBlob(w * 0.5, h * 0.7, w * 0.45, colors[2], 4);
      drawBlob(w * 0.2, h * 0.6, w * 0.35, colors[3], 6);

      animationId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden="true"
    />
  );
}
