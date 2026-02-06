// packages/shared/src/hex-utils.ts

export function hexToPixel(q: number, r: number, size: number) {
  // Pointy-topped (Sivri uç yukarı) standart Catan matematiği
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (3 / 2) * r;
  return { x, y };
}

export function getHexCorners(x: number, y: number, size: number) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30; // 30 derece ofset sivri ucun yukarıda olmasını sağlar
    const angle_rad = (Math.PI / 180) * angle_deg;
    corners.push({
      x: x + size * Math.cos(angle_rad),
      y: y + size * Math.sin(angle_rad)
    });
  }
  return corners;
}