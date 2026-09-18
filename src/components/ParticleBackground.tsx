import React, { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  maxOpacity: number;
  pulseSpeed: number;
  color: string;
}

export const ParticleBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Generate gold bokeh & star particles
    const particleCount = 75;
    const particles: Particle[] = [];
    const colors = ["#FFD700", "#FACC15", "#E0FBFC", "#00B4D8", "#B8860B"];

    for (let i = 0; i < particleCount; i++) {
      const isCyan = Math.random() < 0.15;
      const color = isCyan ? "#00B4D8" : colors[Math.floor(Math.random() * colors.length)];
      const size = Math.random() * 2.8 + 0.8;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size,
        speedX: (Math.random() - 0.5) * 0.35,
        speedY: (Math.random() - 0.5) * 0.35,
        opacity: Math.random() * 0.7 + 0.2,
        maxOpacity: Math.random() * 0.8 + 0.3,
        pulseSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        color,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep subtle space nebula gradient
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        50,
        width * 0.5,
        height * 0.5,
        width * 0.8
      );
      bgGrad.addColorStop(0, "rgba(25, 20, 5, 0.4)");
      bgGrad.addColorStop(0.5, "rgba(8, 12, 18, 0.2)");
      bgGrad.addColorStop(1, "rgba(5, 5, 7, 0)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0) p.x = width;
        else if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        else if (p.y > height) p.y = 0;

        p.opacity += p.pulseSpeed;
        if (p.opacity > p.maxOpacity || p.opacity < 0.15) {
          p.pulseSpeed = -p.pulseSpeed;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

        // Soft bokeh glow
        ctx.shadowBlur = p.size * 4;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0.1, Math.min(1, p.opacity));
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: "#050507" }}
    />
  );
};
