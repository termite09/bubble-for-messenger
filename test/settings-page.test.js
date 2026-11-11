const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'settings.html'),
  'utf8',
);

// A click on a row's words flips its switch: a <label> activates its first labelable
// descendant, so a row that also holds a button (Check now) must name its switch with `for`,
// or the click presses the button instead (3.0.2 ran an update check from the row's text).
test("a click on a settings row's text reaches its switch, never another control", () => {
  const rows = [...html.matchAll(/<label class="row"([^>]*)>([\s\S]*?)<\/label>/g)];
  assert.ok(rows.length > 5);
  for (const [, attrs, inner] of rows) {
    const first = /<(button|input|select|textarea)\b([^>]*)>/.exec(inner);
    assert.ok(first, 'a row with nothing to switch');
    const target = /\bfor="([^"]+)"/.exec(attrs);
    if (target) {
      assert.match(inner, new RegExp(`<input[^>]*\\bid="${target[1]}"[^>]*data-key=`));
    } else {
      assert.equal(first[1], 'input', `a row labels its ${first[1]}: ${inner.slice(0, 80)}`);
      assert.match(first[2], /data-key=/);
    }
  }
});
