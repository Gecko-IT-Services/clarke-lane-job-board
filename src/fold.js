/**
 * A panel that drops down (Philip, 25 Oct: "too much space is being used in one go"): folded, only its heading
 * shows, so put the count in the heading; clicking the heading opens or closes it (app.js), remembered on that
 * computer as localStorage fold:<key>. Works on any panel string that starts <section class="panel …"> or <div class="panel …">.
 */
export const fold = (key, html, folded) => String(html || '')
  .replace(/^(\s*<(?:section|div) class="panel)(?=[ "])/, `$1 fold${folded ? ' folded' : ''}`)
  .replace(/^(\s*<(?:section|div) class="panel[^"]*")/, `$1 data-fold="${key}"`);
