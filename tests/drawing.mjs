// Reading a drawing's text: suggested processes, flags and facts (made-up drawings, like real ones).
import assert from 'node:assert/strict';
const { readDrawing, toAdd, processesFromHistory } = await import('../src/core/drawing.js');

// Like a formed aluminium bracket: holes with 90° chamfer, black anodise; its bends are only drawn.
const bracket = readDrawing(`NOTE 1. DIMENSIONS IN Millimetres U.O.S 2. TOLERANCE ± 0.25 3. MATERIAL ALUMINIUM 1050-H14 2.5mm THICK
  4. FINISH BLACK ANODISE 5. THIS DRAWING IS TO BE USED IN CONJUNCTION WITH: 6. CLEAN AND DEBURR ALL SHARP EDGES
  10 HOLES Ø19 & CHAMFER 90° INC 0.25 R6.35 TYP SECTION A-A WHERE INDICATED CHAMFER BOTH SIDES 0.5 X 45°
  CUSTOMER EXAMPLE RADIO LTD TITLE BRACKET DIPOLE P.No. EX-1001-A DRG.No. 3/SP0000/0000 DO NOT SCALE`);
assert.deepEqual(bracket.suggest, ['Laser', 'Tap & C/Sink', 'Plating / Anodising'], 'bends drawn only: Fold not suggested');
assert.match(bracket.why['Plating / Anodising'], /anodise/i);
assert.equal(bracket.facts.thickness, '2.5mm');
assert.match(bracket.facts.finish, /black anodise/i);
assert.equal(bracket.flags.length, 0);

// Like a turned handle: bar stock, outside M8 thread, engraving, masked powder coat.
const handle = readDrawing(`MASK THREADS AND POWDER COAT BLACK TO ALL OTHER SURFACES. M8 Machine Threads 0.50 X 45° 2-POS R0.30 max.
  ENGRAVE FONT STYLE "EXAMPLE" 0.5mm BELOW PART SURFACE. FINISH/COLOUR POWDER COAT MATERIAL 316 Stainless Steel (Bar) WEIGHT 129.10g
  DESCRIPTION HANDLE, LOCKING PART NUMBER 990000001 UNLESS OTHERWISE STATED REMOVE ALL BURRS AND SHARP EDGES COMPUTER GENERATED DRAWING, DO NOT CHANGE MANUALLY`);
assert.deepEqual(handle.suggest, ['P/Coat Paint'], 'not lasered, and an outside thread is not tapping');
assert.ok(handle.flags.some(f => /bar stock/.test(f)) && handle.flags.some(f => /outside thread/.test(f)) && handle.flags.includes('Engraving'));
assert.match(handle.facts.material, /316 stainless steel/i);

// Like a sheet shim with a hem: cut from sheet, flat pattern on sheet 2, no finish.
const shim = readDrawing(`NOTE: 1. PART TO BE CUT FROM 0.8 mm THICK 304 STAINLESS STEEL SHEET USING THE SUPPLIED CAD DATA.
  2. REMOVE ALL BURRS AND SHARP EDGES. 3. APPLY TEMPORARY PART MARKING AND PACKAGE USING SUITABLE PROTECTIVE MATERIAL.
  4. REFER TO SHEET 2 FOR FLAT PATTERN DIMENSIONS. MATERIAL AISI 304 HEAT TREATMENT NONE SURFACE TREATMENT NONE TITLE Exhaust Shim PART NO. EX-PR-00001 R2 R3 TYP`);
assert.deepEqual(shim.suggest, ['Laser', 'Fold']);
assert.equal(shim.facts.finish, '', 'surface treatment NONE is not a finish');
assert.equal(shim.facts.part, 'EX-PR-00001');

assert.equal(readDrawing('   ').readable, false, 'no text: a picture, or text drawn as lines');
assert.deepEqual(toAdd(shim, { Laser: { done: false } }), ['Fold']);

// Same part made before: its processes.
const jobs = [
  { id: 1, so: 'SO-1', status: 'open', createdAt: '2026-09-01', lines: [{ part: 'Exhaust shim EX-PR-00001' }], procs: { Laser: {}, Fold: {} } },
  { id: 2, so: 'SO-2', status: 'open', createdAt: '2026-10-01', lines: [{ part: 'Cover plate' }], procs: { Laser: {}, 'P/Coat Paint': {} } },
];
assert.deepEqual(processesFromHistory(jobs, 'EX-PR-00001 shim, rev 02'), { so: 'SO-1', processes: ['Laser', 'Fold'] }, 'by part number');
assert.deepEqual(processesFromHistory(jobs, 'cover  plate')?.processes, ['Laser', 'P/Coat Paint'], 'by name');
assert.equal(processesFromHistory(jobs, 'Bracket'), null);
// Lines with their own processes (22 Oct): only the matching line's.
const perLine = [{ id: 3, so: 'SO-3', status: 'open', createdAt: '2026-10-22', procs: { Laser: {}, Fold: {}, Weld: {} },
  lines: [{ part: 'Frame tube', procs: ['Weld'] }, { part: 'Side panel', procs: ['Laser', 'Fold'] }] }];
assert.deepEqual(processesFromHistory(perLine, 'Side panel')?.processes, ['Laser', 'Fold']);
console.log('drawing: ok');
