// Live preview for the Code Dojo: wraps learner TSX in a sandboxed page
// that compiles it in-browser (React 18 UMD + Babel standalone) and
// renders a component called App.
//
// The transform runs MANUALLY (not text/babel auto-compile) so the
// TypeScript preset gets its documented TSX options — plain JSX and full
// type annotations both compile. Transform AND runtime errors render in
// red inside the preview instead of a silent blank pane.
//
// Sandboxing: the host renders this via <iframe sandbox="allow-scripts"
// srcDoc={...}> — scripts run, but the frame has no access to the parent.
// CDN scripts carry Subresource Integrity hashes (pinned react/babel the
// dojo already pinned by version); if the CDN is unreachable (offline,
// corporate proxy), the preview swaps the spinner for a clear "needs the
// network" notice instead of hanging on "Running your code…" forever.
//
// Self-contained (no runtime cross-imports) so plain `node --test` covers it.

const REACT_URL = "https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js";
const REACT_SHA384 =
  "sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z";
const REACT_DOM_URL =
  "https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js";
const REACT_DOM_SHA384 =
  "sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1";
const BABEL_URL =
  "https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js";
const BABEL_SHA384 =
  "sha384-x/ilTFv/u/eu6YSmkFDZl5V5Mm/pkxxcVv2cVJOrr1J0rvILhMvRBCy6yA75wYBj";

/** Escape the one sequence that would break out of the wrapping <script>. */
export function escapeForScript(code: string): string {
  return (code || "").replace(/<\/script/gi, "<\\/script");
}

const ONERROR =
  "var r=document.getElementById('root'),o=document.getElementById('offline');if(o)o.style.display='block';if(r)r.style.display='none';";

/** Full HTML document for iframe srcDoc. Appends the App render call. */
export function buildPreviewDoc(code: string): string {
  const safe = escapeForScript(code);
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    "<style>body{font-family:system-ui,sans-serif;padding:16px;color:#111}button{font-size:14px;padding:6px 14px;border-radius:8px;border:1px solid #999;background:#fff;cursor:pointer}pre{white-space:pre-wrap;font-size:12px}#offline{display:none;color:#b3261e;padding:12px;border:1px solid #b3261e;border-radius:8px}</style>",
    "</head><body>",
    '<div id="root"><p style="opacity:.55">⏳ Running your code… (stuck here = still compiling)</p></div>',
    '<div id="offline">⚠️ Live preview needs the network — React &amp; Babel load from the jsdelivr CDN. Check your connection or proxy, then press ▶ Run again.</div>',
    `<script src="${REACT_URL}" integrity="${REACT_SHA384}" crossorigin="anonymous" onerror="${ONERROR}"></script>`,
    `<script src="${REACT_DOM_URL}" integrity="${REACT_DOM_SHA384}" crossorigin="anonymous" onerror="${ONERROR}"></script>`,
    `<script src="${BABEL_URL}" integrity="${BABEL_SHA384}" crossorigin="anonymous" onerror="${ONERROR}"></script>`,
    '<script id="usersrc" type="text/plain">',
    safe,
    "</script>",
    "<script>",
    "function showError(m){",
    "var r=document.getElementById('root');if(!r)return;",
    "r.innerHTML='<pre style=\"color:#b3261e\">⚠️ '+String(m).replace(/</g,'&lt;')+'</pre>';",
    "}",
    "window.addEventListener('error',function(e){",
    "var m=(e&&(e.message||(e.error&&e.error.message)))||e;showError(m);",
    "});",
    "if(typeof React==='undefined'||typeof ReactDOM==='undefined'||typeof Babel==='undefined'){/* offline: #offline notice is already shown by the failing script's onerror */}",
    "else{",
    "try{",
    "var src=document.getElementById('usersrc').textContent;",
    "var out=Babel.transform(src,{filename:'app.tsx',presets:[['typescript',{isTSX:true,allExtensions:true}],'react']}).code;",
    "out+='\\n;ReactDOM.createRoot(document.getElementById(\\'root\\')).render(React.createElement(App));';",
    "new Function(out)();",
    "}catch(err){showError((err&&err.message)||err);}",
    "}",
    "</script>",
    "</body></html>",
  ].join("\n");
}
