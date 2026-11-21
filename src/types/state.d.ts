// Shapes of the page state objects. Fields are added at run time by the scenes, so the types stay open
// ([k: string]: any); the named fields are the ones every scene relies on.
interface PageState { [k: string]: any; wf: string; mode: string; rate: string; pitShapes: any[]; pitSel: number }
interface SimState { [k: string]: any; fk: string; rate: string; t: number; hx: number; hy: number; shapes: any[]; sel: number; dirty?: boolean; running?: boolean }
interface CornerState { [k: string]: any; rate: string; H: number; A: number; type: string }
interface FinderState { [k: string]: any; delta: number; rate: string; items: any[]; sel: number }
interface UserSettings { layout: string; panelW: number; stageH: number; theme: string; labels: string; anim: boolean; pixel: string; snap: number; quality: string; autoRun: boolean; engine: string; coords: boolean; explain: boolean }
