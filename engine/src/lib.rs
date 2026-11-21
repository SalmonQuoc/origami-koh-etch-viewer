//! Level-set kernel of the Origami 3D viewer etch simulator.
//!
//! This is a line-by-line port of `step`, `rebuild` and `makeReinit` in the JavaScript engine
//! (`src/engine/etch-engine.js`). The JavaScript code sets up the grid (mask distance field,
//! initial level set, rate table, dissipation coefficients); this crate advances it in time.
//! Arithmetic is done in f64 and stored in f32, as the JavaScript engine does with Float32Array,
//! so both engines give the same fields to rounding (checked by tests/engine-parity.mjs).
//!
//! The interface is a plain C ABI (no wasm-bindgen): JavaScript allocates a simulation with
//! `sim_new`, writes the input arrays through the pointers returned by the `sim_*_ptr` functions,
//! calls `sim_init`, then `sim_step` repeatedly, and reads `phi`, `T` and `Hr` in place.

pub mod sim;

use sim::Sim;

#[no_mangle]
pub extern "C" fn sim_new(nx: u32, ny: u32, nz: u32, n_rate: u32) -> *mut Sim {
    Box::into_raw(Box::new(Sim::new(nx as usize, ny as usize, nz as usize, n_rate as usize)))
}

/// # Safety
/// `s` must come from `sim_new` and not have been freed.
#[no_mangle]
pub unsafe extern "C" fn sim_free(s: *mut Sim) {
    if !s.is_null() {
        drop(Box::from_raw(s));
    }
}

/// Scalars: dx, band half-width B, time step dt0, dissipation ax, ay, az, start time t.
/// # Safety
/// `s` must be a live simulation.
#[no_mangle]
pub unsafe extern "C" fn sim_set_params(s: *mut Sim, dx: f64, b: f64, dt0: f64, ax: f64, ay: f64, az: f64, t: f64) {
    let s = &mut *s;
    s.dx = dx;
    s.b = b;
    s.dt0 = dt0;
    s.al = [ax, ay, az];
    s.t = t;
}

macro_rules! ptr_fn {
    ($name:ident, $field:ident, $ty:ty) => {
        /// # Safety
        /// `s` must be a live simulation.
        #[no_mangle]
        pub unsafe extern "C" fn $name(s: *mut Sim) -> *mut $ty {
            (*s).$field.as_mut_ptr()
        }
    };
}
ptr_fn!(sim_phi_ptr, phi, f32);
ptr_fn!(sim_t_ptr, tarr, f32);
ptr_fn!(sim_hr_ptr, hr, f32);
ptr_fn!(sim_gopen_ptr, gopen, f32);
ptr_fn!(sim_open_ptr, open, u8);
ptr_fn!(sim_tab_ptr, tab, f32);
ptr_fn!(sim_e_ptr, e, f64);

/// Builds the first narrow band (call after the arrays are filled).
/// # Safety
/// `s` must be a live simulation.
#[no_mangle]
pub unsafe extern "C" fn sim_init(s: *mut Sim) {
    (*s).rebuild(true);
}

/// Advances to `t_end` (at most `max_steps` steps) and returns the new time.
/// # Safety
/// `s` must be a live simulation.
#[no_mangle]
pub unsafe extern "C" fn sim_step(s: *mut Sim, t_end: f64, max_steps: u32) -> f64 {
    (*s).step(t_end, max_steps)
}

/// # Safety
/// `s` must be a live simulation.
#[no_mangle]
pub unsafe extern "C" fn sim_steps(s: *mut Sim) -> u32 {
    (*s).steps
}

/// Number of nodes in the narrow band (for tests and diagnostics).
/// # Safety
/// `s` must be a live simulation.
#[no_mangle]
pub unsafe extern "C" fn sim_nact(s: *mut Sim) -> u32 {
    (*s).act.len() as u32
}
