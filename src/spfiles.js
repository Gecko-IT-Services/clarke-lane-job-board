/**
 * SharePoint files (Company Data, read only): a customer's Files tab, drawings found in their folders for an
 * order, and the material certificate folders for an order's grades. Logic in core/spfiles.js (tested);
 * this file only draws. Every file opens in SharePoint; nothing is copied.
 */
import { icon } from './icons.js';
import { groupFiles } from './core/spfiles.js';

const kb = n => n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const KIND = { client: 'Client folder', laser: 'Laser drawings (Bystronic)' };

/** Old quotes in words: "37 old quotes (2014 to 2025)". */
export const quoteHistWords = h => !h ? '' : `${h.count} old quote${h.count === 1 ? '' : 's'}${h.first ? h.first === h.last ? ` (${h.first})` : ` (${h.first} to ${h.last})` : ''}`;

/** The customer page's Files tab. p: { name, office, folders: customerFolders(), lists, files, state, err, q, pick, all, hist }. */
export function renderFilesTab(p, h) {
  const { esc, fmt } = h;
  const row = kind => {
    const x = p.folders?.[kind] || { folder: null, how: 'missing' }, f = x.folder;
    const list = kind === 'client' ? p.lists.clients : p.lists.laser;
    const picker = p.pick === kind ? `<div class="sppick"><label class="fl">Folder in ${kind === 'client' ? '01 Client Folder' : 'Bystronic Drawings › Customers'}
        <input type="text" id="sp-pick" list="sp-picks" autocomplete="off" placeholder="Start typing the folder name" value="${esc(f?.name || '')}"><datalist id="sp-picks">${list.map(x => `<option value="${esc(x.name)}"></option>`).join('')}</datalist></label>
        <div class="actions"><button class="btn sm pri" type="button" data-spsave="${kind}">Link this folder</button><button class="btn sm" type="button" data-spnone="${kind}">${esc(p.name)} has none</button>
          ${x.how === 'linked' || x.how === 'none' ? `<button class="btn sm" type="button" data-spunlink="${kind}">Find it by name again</button>` : ''}<button class="btn sm" type="button" data-sppick="">Cancel</button></div></div>` : '';
    const what = f ? `<a href="${esc(f.url)}" target="_blank" rel="noopener"><b>${esc(f.name)}</b></a> <span class="note">${x.how === 'linked' ? 'linked by hand' : 'found by name'}</span>`
      : x.how === 'none' ? '<span class="note">None</span>' : '<span class="note">No folder with this customer\'s name</span>';
    return `<li><span class="k">${KIND[kind]}</span> ${what} <button class="btn link sm" type="button" data-sppick="${kind}">${f ? 'Change' : 'Link a folder'}</button>${picker}</li>`;
  };
  const head = `<section class="panel"><h3>Folders in SharePoint <small>Company Data, read only</small></h3>
      ${p.err ? `<div class="err">${esc(p.err)}</div>` : ''}
      ${!p.lists.ready && !p.err ? '<p class="note">Reading the folder lists…</p>' : `<ul class="cfacts spfolders">${row('client')}${row('laser')}</ul>`}
      ${p.office && p.hist ? `<p class="note">${esc(quoteHistWords(p.hist))} in their folders, counted from the QCLE numbers.</p>` : ''}</section>`;
  if (!p.folders?.client.folder && !p.folders?.laser.folder) return head;
  if (p.state === 'loading') return head + '<section class="panel"><p class="note">Reading their files from SharePoint…</p></section>';
  if (p.state?.startsWith?.('error:')) return head + `<section class="panel"><div class="err">${esc(p.state.slice(6))}</div></section>`;
  const groups = groupFiles(p.files, { q: p.q, office: p.office });
  const item = f => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${icon('doc')}${esc(f.name)}</a> <span class="note">${f.at ? esc(fmt(f.at.slice(0, 10))) + ' ' + f.at.slice(0, 4) : ''}${f.size ? ' · ' + kb(f.size) : ''}${f.path ? ' · ' + esc(f.path) : ''}</span></li>`;
  const group = g => { const open = p.all?.[g.key], shown = open ? g.files : g.files.slice(0, 25);
    return `<h4>${esc(g.title)} <span class="note">${g.files.length}</span></h4><ul class="spfiles">${shown.map(item).join('')}</ul>
      ${g.files.length > shown.length ? `<p class="note"><button class="btn link sm" type="button" data-spall="${g.key}">Show all ${g.files.length}</button></p>` : ''}`; };
  return head + `<section class="panel"><div class="hsec-h"><h3>Files <small>newest first</small></h3>
      <input type="search" id="spq" placeholder="Search file names, e.g. a part number" aria-label="Search files" value="${esc(p.q || '')}"></div>
      ${groups.length ? groups.map(group).join('') : `<p class="note">${p.q ? 'No files match.' : 'No files in their folders.'}</p>`}
      <p class="note">Files open in SharePoint. The board only reads these folders; it never changes them.</p></section>`;
}

/** On an order (office): drawings in the customer's folders for the part numbers on its lines. found: foundDrawings(). */
export function foundDrawingsHtml({ jobId, found, state }, h) {
  const { esc, fmt } = h;
  if (state === 'loading') return '<p class="note">Looking for drawings in the customer\'s SharePoint folders…</p>';
  if (!found?.length) return '';
  return `<div class="spfound"><p class="note"><b>Found in the customer's SharePoint folders</b></p><ul class="files">${found.map(x => `<li>
      <a class="btn" href="${esc(x.file.url)}" target="_blank" rel="noopener">${icon('doc')}${esc(x.file.name)}</a>
      <span class="note">${esc(x.partNo)}${x.file.at ? ' · ' + esc(fmt(x.file.at.slice(0, 10))) + ' ' + x.file.at.slice(0, 4) : ''}${x.more ? ` · ${x.more} other file${x.more === 1 ? '' : 's'} name it` : ''}${x.file.path ? ' · ' + esc(x.file.path) : ''}</span>
      <button type="button" class="btn sm pri" data-spattach="${jobId}" data-spitem="${esc(x.file.itemId)}">${icon('plus')}Attach</button></li>`).join('')}</ul></div>`;
}

/** On an order (office): the certificate folder for each grade on its lines. certs: certFolders(). */
export function certsHtml({ certs, err }, h) {
  const { esc } = h;
  if (err) return `<div class="panel"><h3>Material certificates</h3><p class="note">${esc(err)}</p></div>`;
  if (!certs?.length) return '';
  return `<div class="panel"><h3>Material certificates</h3><p class="note">Grades on this order, and their folders in Company Data › Mat Certs:</p>
    <div class="actions">${certs.map(c => c.folder ? `<a class="btn sm" href="${esc(c.folder.url)}" target="_blank" rel="noopener">${icon('doc')}${esc(c.folder.name)}</a>`
      : `<span class="chip">${esc(c.grade)}: no folder</span>`).join(' ')}</div></div>`;
}
