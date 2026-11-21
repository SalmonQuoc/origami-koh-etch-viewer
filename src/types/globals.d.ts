// Globals from the other <script> blocks of the page.
declare const THREE: any;                         // three.js r128 (CDN)
declare function etchEngineFactory(): any;        // src/engine/etch-engine.js (JavaScript, also serialised into the worker)
interface Window { __o3d: any }
// The page reads and writes form elements found by id or from events without narrowing their type.
interface HTMLElement { [k: string]: any }
interface Element { [k: string]: any }
interface EventTarget { [k: string]: any }
