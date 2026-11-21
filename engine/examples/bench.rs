// Native timing of the kernel on a state dumped from the JavaScript set-up (dev tool; not part of the page).
use etch_core::sim::Sim;
use std::time::Instant;
fn main() {
    let path = std::env::args().nth(1).expect("state.bin");
    let b = std::fs::read(path).unwrap();
    let f64s = |o: usize, n: usize| -> Vec<f64> { (0..n).map(|i| f64::from_le_bytes(b[o + 8 * i..o + 8 * i + 8].try_into().unwrap())).collect() };
    let h = f64s(0, 20);
    let (nx, ny, nz, n) = (h[0] as usize, h[1] as usize, h[2] as usize, h[3] as usize);
    let mut s = Sim::new(nx, ny, nz, n);
    s.dx = h[4]; s.b = h[5]; s.dt0 = h[6]; s.al = [h[7], h[8], h[9]];
    for i in 0..9 { s.e[i] = h[11 + i]; }
    let mut o = 160;
    let f32s = |o: usize, n: usize| -> Vec<f32> { (0..n).map(|i| f32::from_le_bytes(b[o + 4 * i..o + 4 * i + 4].try_into().unwrap())).collect() };
    s.phi = f32s(o, s.nn); o += 4 * s.nn;
    s.tarr = f32s(o, s.nn); o += 4 * s.nn;
    s.gopen = f32s(o, s.nxy); o += 4 * s.nxy;
    s.tab = f32s(o, (n + 1) * (n + 1)); o += 4 * (n + 1) * (n + 1);
    s.open = b[o..o + s.nxy].to_vec();
    s.rebuild(true);
    let t0 = Instant::now();
    s.step(h[10], u32::MAX);
    println!("{} steps in {:?}; band {}", s.steps, t0.elapsed(), s.act.len());
    println!("timers: {:?}", s.timers);
}
