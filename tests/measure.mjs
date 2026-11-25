// Measurements on a finished etch-engine state, shared by tools/accuracy.mjs and tests/engine-physics.test.mjs.

// least-squares angle (degrees) of a wall given as [lateral position, depth] points, against the wafer surface
export function fitAngle(P) {
  const n = P.length, mx = P.reduce((s, p) => s + p[0], 0)/n, mz = P.reduce((s, p) => s + p[1], 0)/n;
  return Math.atan(Math.abs(P.reduce((s, p) => s + (p[0] - mx)*(p[1] - mz), 0)/P.reduce((s, p) => s + (p[0] - mx)**2, 0)))*180/Math.PI;
}

// Bevel of an undercut convex corner of a square mesa with <110> edges on (100). The grid covers one quarter (x, y >= 0),
// the mesa corner is at (H, H). The silicon outline in the top row is followed along y; between the point P where it
// leaves the mask edge x = H (retreat below 1 µm) and the point B where it meets the diagonal, the middle 60 % is fitted
// by a line. Returns the bevel angle alpha against the edge (degrees) and the undercut length l = H - y(P) along <110>
// (Pal & Sato p. 227, Fig. 6.13: undercutting ratio l/d).
export function bevel(S, H, dx) {
  const { Nx, Ny } = S, xb = [];
  for (let j = 0; j < Ny; j++) {
    let x = null;
    for (let i = 0; i < Nx - 1; i++) { const a = S.phi[j*Nx + i], b = S.phi[j*Nx + i + 1]; if (a > 0 && b <= 0) { x = (i + 0.5 + a/(a - b))*dx; break; } }
    xb.push([(j + 0.5)*dx, x]);
  }
  const B = xb.find(([y, x]) => x != null && x <= y), yB = B ? B[0] : H;
  const P = [...xb].reverse().find(([y, x]) => x != null && y < yB && H - x < 1), yP = P ? P[0] : 0;
  const pts = xb.filter(([y, x]) => x != null && y > yP + 0.2*(yB - yP) && y < yP + 0.8*(yB - yP));
  const n = pts.length, my = pts.reduce((s, p) => s + p[0], 0)/n, mx = pts.reduce((s, p) => s + p[1], 0)/n;
  const sl = pts.reduce((s, p) => s + (p[0] - my)*(p[1] - mx), 0)/pts.reduce((s, p) => s + (p[0] - my)**2, 0);
  return { alpha: Math.atan(-sl)*180/Math.PI, l: H - yP, n };
}

// Lateral underetch rate L(phi) on a (001) surface for a mask edge at angle phi (degrees) from [110]: the slowest
// lateral speed R(n)/sin(theta) over the planes through the edge, n tilted by theta from the surface normal (minimum
// envelope, Pal & Sato p. 228). Returns the local maxima of L between 0° and 45°: the corner bevel directions (p. 235).
export function lateralMaxima(E, RT, step = 0.1) {
  const D = Math.PI/180, s2 = Math.SQRT1_2, L = [];
  for (let p = 0; p <= 45/step + 1e-9; p++) {
    const phi = p*step*D, d = [s2*Math.cos(phi) - s2*Math.sin(phi), s2*Math.cos(phi) + s2*Math.sin(phi), 0];
    let m = Infinity;
    for (let q = 1; q <= 1800; q++) { const th = q*0.05*D, v = E.rateC(RT, Math.sin(th)*d[0], Math.sin(th)*d[1], Math.cos(th))/Math.sin(th); if (v < m) m = v; }
    L.push([p*step, m]);
  }
  return L.filter((x, i) => i > 0 && i < L.length - 1 && x[1] >= L[i-1][1] && x[1] >= L[i+1][1]);
}
