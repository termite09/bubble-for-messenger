// The least DOM a row reader needs: elements with attributes, children and a computed style,
// and querySelector(All) over simple selectors — `tag`, `.class`, `[attr]`, `[attr="v"]`,
// `tag[attr="v"]`, comma lists, and one descendant combinator (`a b`). Installs `document` and
// `getComputedStyle` as globals for the duration of `withDocument`.

function el(tagName, attrs = {}, children = [], { style = {}, scroll = null, rect = null } = {}) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attrs: { ...attrs },
    style,
    childNodes: [],
    parentElement: null,
    scrollHeight: scroll ? scroll.height : 0,
    clientHeight: scroll ? scroll.client : 0,
    scrollTop: scroll ? scroll.top : 0,
    getAttribute: (n) => (n in node.attrs ? node.attrs[n] : null),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      ...(rect || {}),
    }),
    get classList() {
      return (node.attrs.class || '').split(/\s+/).filter(Boolean);
    },
    contains(other) {
      for (let e = other; e; e = e.parentElement) if (e === node) return true;
      return false;
    },
    get children() {
      return node.childNodes.filter((c) => c.nodeType === 1);
    },
    get title() {
      return node.attrs.title || '';
    },
    get alt() {
      return node.attrs.alt || '';
    },
    get src() {
      return node.attrs.src || '';
    },
    get textContent() {
      return node.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent)).join('');
    },
    querySelectorAll: (sel) => selectAll(node, sel),
    querySelector: (sel) => selectAll(node, sel)[0] || null,
    closest(sel) {
      for (let e = node; e; e = e.parentElement) if (matches(e, sel)) return e;
      return null;
    },
  };
  for (const child of children) {
    const c = typeof child === 'string' ? { nodeType: 3, nodeValue: child } : child;
    c.parentElement = node;
    node.childNodes.push(c);
  }
  return node;
}

function matchesSimple(node, simple) {
  const m = /^([a-z]*)((?:\[[^\]]+\]|\.[\w-]+)*)$/i.exec(simple.trim());
  if (!m) throw new Error('unsupported selector ' + simple);
  if (m[1] && node.tagName !== m[1].toUpperCase()) return false;
  for (const cls of m[2].match(/\.[\w-]+/g) || [])
    if (!node.classList.includes(cls.slice(1))) return false;
  for (const attr of m[2].match(/\[[^\]]+\]/g) || []) {
    const a = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(attr);
    const v = node.getAttribute(a[1]);
    if (v === null) return false;
    if (a[2] !== undefined && v !== a[2]) return false;
  }
  return true;
}

function matches(node, selector) {
  return selector.split(',').some((alt) => {
    const parts = alt.trim().split(/\s+/);
    if (!matchesSimple(node, parts[parts.length - 1])) return false;
    let e = node.parentElement;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (e && !matchesSimple(e, parts[i])) e = e.parentElement;
      if (!e) return false;
      e = e.parentElement;
    }
    return true;
  });
}

function selectAll(root, selector) {
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      if (matches(c, selector)) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

// Run `fn` with `document` (whose body is `body`) and `getComputedStyle` in scope.
function withDocument(body, fn) {
  const doc = {
    body,
    childNodes: [body],
    querySelectorAll: (sel) => selectAll(doc, sel),
    querySelector: (sel) => selectAll(doc, sel)[0] || null,
  };
  body.parentElement = null;
  global.document = doc;
  global.getComputedStyle = (node) => ({
    fontWeight: '400',
    visibility: 'visible',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    ...node.style,
  });
  global.CSS = { escape: (s) => s.replace(/([^\w-])/g, '\\$1') };
  try {
    return fn();
  } finally {
    delete global.document;
    delete global.getComputedStyle;
    delete global.CSS;
  }
}

module.exports = { el, withDocument };
