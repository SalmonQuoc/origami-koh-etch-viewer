// Lateral undercut of the vertical {100} walls under a 100 um square window at 45 deg on (100), 30 wt% KOH (Pal & Sato Table 4.1, p. 87).
// Usage: node undercut-100.js [dx um] [t min]
const E=require('./etch-engine.js');
const PAL30 = { '100': 0.797, '110': 1.455, '210': 1.561, '211': 1.319, '221': 0.714, '310': 1.456, '311': 1.436, '320': 1.543, '331': 1.160, '530': 1.556, '540': 1.512, '111': 0.005 };
const s2=Math.SQRT1_2, F=[[-s2,s2,0],[-s2,-s2,0],[0,0,1]];
const W=100, sq=[[W/2*Math.SQRT2,0],[0,W/2*Math.SQRT2],[-W/2*Math.SQRT2,0],[0,-W/2*Math.SQRT2]];
const dx=+process.argv[2]||3, t=+process.argv[3]||40;
const S=E.create({frame:F,rates:PAL30,shapes:[{pts:sq,op:'open'}],X0:-130,X1:130,Y0:-130,Y1:130,depth:50,dx});
E.step(S,t,1e9);
const {Nx,Ny,NXY,phi}=S, val=(x,y,k)=>{const i=Math.round((x+130)/dx-0.5), j=Math.round((y+130)/dx-0.5); return phi[k*NXY+j*Nx+i];};
const prof=[];
for (let k=0;k<S.Nz;k+=Math.max(1,Math.round(4/dx))) { let r=0; while (r<120 && val(r*s2, r*s2, k)<=0) r+=0.5; prof.push(`${((k+0.5)*dx).toFixed(0)}:${(r-W/2).toFixed(1)}`); }
console.log('dx',dx,'t',t,'lateral front beyond the edge (depth:um) ', prof.join('  '), ' expected', (0.797*t).toFixed(1));
