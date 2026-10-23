const E=require(process.env.ENG||'./etch-engine.js');
const PAL30 = { '100': 0.797, '110': 1.455, '210': 1.561, '211': 1.319, '221': 0.714, '310': 1.456, '311': 1.436, '320': 1.543, '331': 1.160, '530': 1.556, '540': 1.512, '111': 0.005 };
const s2=Math.SQRT1_2, F110=[[-s2,s2,0],[0,0,1],[s2,s2,0]], F=[[-s2,s2,0],[-s2,-s2,0],[0,0,1]];
const D=Math.PI/180, a1=54.7356*D, a2=125.2644*D;
const para=(w,h)=>{const u=[Math.cos(a1),Math.sin(a1)],v=[Math.cos(a2),Math.sin(a2)];return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([p,q])=>[p*w/2*u[0]+q*h/2*v[0],p*w/2*u[1]+q*h/2*v[1]]);};
const sq=(cx,cy,w,h)=>[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]];
const rot=(P,deg)=>P.map(([x,y])=>[x*Math.cos(deg*D)-y*Math.sin(deg*D),x*Math.sin(deg*D)+y*Math.cos(deg*D)]);
for (const ghost of ['noflux']) {
 const run=(name,cfg,t)=>{const t0=Date.now();cfg.ghost=ghost;const S=E.create(cfg);if(cfg.shapesMap){} E.step(S,t,1e9);const st=E.stats(S,t);
   const {Nx,T,dx}=S;console.log(ghost,name,((Date.now()-t0)/1000).toFixed(1)+'s','depth',st.depth.toFixed(1),'under',st.under.toFixed(1),'susp',st.susp);return S;};
 run('110 para',{frame:F110,rates:PAL30,shapes:[{pts:para(300,160),op:'open'}],X0:-260,X1:260,Y0:-200,Y1:200,depth:150,dx:6},40);
 run('100 pit',{frame:F,rates:PAL30,shapes:[{pts:sq(0,0,200,200),op:'open'}],X0:-160,X1:160,Y0:-160,Y1:160,depth:80,dx:4},60);
 run('100 mesa',{frame:F,rates:PAL30,shapes:[{pts:sq(0,0,1000,1000),op:'open'},{pts:sq(0,0,200,200),op:'mask'}],X0:-180,X1:180,Y0:-180,Y1:180,depth:70,dx:4},40);
 run('100 cant110',{frame:F,rates:PAL30,shapes:[{pts:sq(0,0,300,180),op:'open'},{pts:sq(-57.5,0,185,50),op:'mask'}],X0:-200,X1:200,Y0:-130,Y1:130,depth:90,dx:5},60);
 run('100 square45',{frame:F,rates:PAL30,shapes:[{pts:rot(sq(0,0,140,140),45),op:'open'}],X0:-160,X1:160,Y0:-160,Y1:160,depth:90,dx:4},60);
}
