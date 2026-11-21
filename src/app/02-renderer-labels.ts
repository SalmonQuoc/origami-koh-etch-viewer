// --------------------------------------------------------------------- renderer, camera
const stage = document.getElementById("stage"), labelsEl = document.getElementById("labels"), tip = document.getElementById("tip");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(SET.pixel === "fast" ? 1 : Math.min(2, window.devicePixelRatio || 1));
renderer.localClippingEnabled = true;
stage.insertBefore(renderer.domElement, labelsEl);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
camera.up.set(0, 0, 1);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.addEventListener("change", () => { dirty = true; });
let scene = new THREE.Scene(), dirty = true, radius = 1, labels = [];
let frameR = 0;   // > 0: the view is framed for this radius (whole wafer) instead of the die
const simLike = () => S.mode === "sim" || S.mode === "corner";

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  const a = w/h, r = (frameR || radius)*1.08, R = Math.max(radius, frameR);
  if (a >= 1) { camera.left = -r*a; camera.right = r*a; camera.top = r; camera.bottom = -r; }
  else { camera.left = -r; camera.right = r; camera.top = r/a; camera.bottom = -r/a; }
  camera.near = -R*20; camera.far = R*20;
  camera.updateProjectionMatrix(); dirty = true;
}
new ResizeObserver(resize).observe(stage);

const OBL: Record<string, [number, number]> = { "100": [30, -60], "110": [26, -34], "111": [28, -70] };
const VIEWS: Record<string, [number, number]> = { oblique: [30, -60], back: [30, 120], top: [89.5, -90], flat: [0, -90], left: [0, 0], below: [-40, -60] };
const dirOf = (e: number, a: number) => new V3(Math.cos(e/C.DEG)*Math.cos(a/C.DEG), Math.cos(e/C.DEG)*Math.sin(a/C.DEG), Math.sin(e/C.DEG));
let anim = null, anim0Zoom = 1;   // anim0Zoom: zoom the next setView ends at (1 = fit)
function setView(dir, target, instant = false) {
  if (!SET.anim) instant = true;
  dir = dir.clone().normalize();
  const tgt = target ? target.clone() : controls.target.clone();
  if (instant) {
    controls.target.copy(tgt); camera.position.copy(tgt).addScaledVector(dir, Math.max(radius, frameR)*4); camera.zoom = anim0Zoom; anim0Zoom = 1;
    camera.updateProjectionMatrix(); controls.update(); dirty = true; return;
  }
  const d0 = camera.position.clone().sub(controls.target).normalize(), t0 = controls.target.clone(), z0 = camera.zoom;
  anim = { d0, d1: dir, t0, t1: tgt, z0, z1: anim0Zoom, start: performance.now(), dur: 500 }; anim0Zoom = 1;
}
function stepAnim(now) {
  if (!anim) return;
  let s = Math.min(1, (now - anim.start)/anim.dur); s = s < 0.5 ? 2*s*s : 1 - 2*(1 - s)*(1 - s);
  const q = new THREE.Quaternion().setFromUnitVectors(anim.d0, anim.d1.clone().normalize());
  const q1 = new THREE.Quaternion().slerp(q, s);
  const d = anim.d0.clone().applyQuaternion(q1);
  if (Math.abs(anim.d0.dot(anim.d1) + 1) < 1e-6) d.copy(anim.d0).lerp(anim.d1, s).normalize();
  controls.target.lerpVectors(anim.t0, anim.t1, s);
  camera.position.copy(controls.target).addScaledVector(d, Math.max(radius, frameR)*4);
  camera.zoom = anim.z0*Math.pow(anim.z1/anim.z0, s); camera.updateProjectionMatrix();
  controls.update(); dirty = true;
  if (s >= 1) anim = null;
}

// --------------------------------------------------------------------- overlay labels
let labelTag = null;   // "wafer" while the wafer labels are added: they stay visible in the wafer overview
function addLabel(pos, html, cls = "", show = null) {
  const el = document.createElement("div"); el.innerHTML = html; if (cls) el.className = cls;
  labelsEl.appendChild(el); labels.push({ el, pos: pos.clone(), show, tag: labelTag }); return el;
}
function clearLabels() { labels = []; labelsEl.innerHTML = ""; }
function placeLabels() {
  const w = stage.clientWidth, h = stage.clientHeight, camDir = camera.position.clone().sub(controls.target).normalize();
  for (const L of labels) {
    const vis = (L.show ? L.show(camDir) : true) && !(frameR && L.tag !== "wafer" && camera.zoom < 0.12*frameR/radius);
    if (!vis) { L.el.style.display = "none"; continue; }
    const p = L.pos.clone().project(camera);
    L.el.style.display = "";
    L.el.style.left = `${(p.x + 1)/2*w}px`; L.el.style.top = `${(1 - p.y)/2*h}px`;
  }
}

