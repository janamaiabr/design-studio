// ═══════════════════════════════════════
// Jaspion Design Studio - v5 (Live Editor)
// ═══════════════════════════════════════

// ── Password Protection ──
const CORRECT_PW = 'JanaJuli@2026!';
const pwScreen = document.getElementById('password-screen');
const pwInput = document.getElementById('pw-input');
const pwBtn = document.getElementById('pw-btn');

if (localStorage.getItem('ds-authed') === 'true') {
  pwScreen.style.display = 'none';
  document.getElementById('top-bar').classList.remove('hidden');
  document.getElementById('workspace').classList.remove('hidden');
  document.getElementById('status-bar').classList.remove('hidden');
  initApp();
} else {
  pwBtn.addEventListener('click', tryLogin);
  pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
}

function tryLogin() {
  if (pwInput.value === CORRECT_PW) {
    localStorage.setItem('ds-authed', 'true');
    pwScreen.style.display = 'none';
    document.getElementById('top-bar').classList.remove('hidden');
    document.getElementById('workspace').classList.remove('hidden');
    document.getElementById('status-bar').classList.remove('hidden');
    initApp();
  } else {
    pwInput.style.borderColor = '#FF3B30';
    pwInput.value = '';
    pwInput.placeholder = 'Wrong password...';
  }
}

function initApp() {

const TYPE_ICONS = { change: '✏️', bug: '🐛', add: '➕', remove: '➖', style: '🎨' };
const PRIORITY_COLORS = { high: '#FF3B30', medium: '#FF9500', low: '#34C759' };

// ── State ──
let annotations = JSON.parse(localStorage.getItem('ds-annotations') || '[]');
let currentTool = 'postit';
let editingIndex = -1;
let cloudPoints = [];
let isDrawingCloud = false;
let arrowStart = null;
let dragTarget = null;
let dragOffset = { x: 0, y: 0 };
let annotateMode = true;
let designMode = false;
let nextId = annotations.length ? Math.max(...annotations.map(a => a.id || 0)) + 1 : 1;

// ── Design State ──
// designConfig: { selectors: { "body": { "background-color": "#fff", ... }, ".hero": {...} }, customCSS: "" }
let designConfig = JSON.parse(localStorage.getItem('ds-design-config') || '{"selectors":{},"customCSS":""}');
let activeSelector = 'body';
let hasUnsavedChanges = false;

// ── History (Undo/Redo) ──
let historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

function pushHistory() {
  const state = {
    annotations: JSON.parse(JSON.stringify(annotations)),
    designConfig: JSON.parse(JSON.stringify(designConfig))
  };
  // Remove future states if we're not at the end
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(state);
  if (historyStack.length > MAX_HISTORY) historyStack.shift();
  historyIndex = historyStack.length - 1;
  updateUndoRedoButtons();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreHistory();
}

function redo() {
  if (historyIndex >= historyStack.length - 1) return;
  historyIndex++;
  restoreHistory();
}

function restoreHistory() {
  const state = historyStack[historyIndex];
  annotations = JSON.parse(JSON.stringify(state.annotations));
  designConfig = JSON.parse(JSON.stringify(state.designConfig));
  saveState();
  saveDesignConfig();
  renderAll();
  applyDesignToPreview();
  loadDesignUIFromConfig();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  document.getElementById('btn-undo').disabled = historyIndex <= 0;
  document.getElementById('btn-redo').disabled = historyIndex >= historyStack.length - 1;
}

// Push initial state
pushHistory();

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// ── Elements ──
const iframe = document.getElementById('preview-iframe');
const wrapper = document.getElementById('preview-wrapper');
const postitLayer = document.getElementById('postit-layer');
const svgOverlay = document.getElementById('svg-overlay');
const canvas = document.getElementById('annotation-canvas');
const ctx = canvas.getContext('2d');
const annList = document.getElementById('annotation-list');
const statusText = document.getElementById('status-text');
const statusTool = document.getElementById('status-tool');
const annBadge = document.getElementById('ann-badge');
const annCountTab = document.getElementById('ann-count-tab');
const emptyState = document.getElementById('empty-annotations');
const chromeUrlDisplay = document.getElementById('chrome-url-display');
const deviceFrame = document.getElementById('device-frame');
const unsavedIndicator = document.getElementById('unsaved-indicator');

// ── Create click-capture overlay ──
const clickLayer = document.createElement('div');
clickLayer.id = 'click-layer';
clickLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:15;cursor:crosshair;';
wrapper.appendChild(clickLayer);

// ── Resize canvas ──
function resizeCanvas() {
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  redrawCanvas();
  renderSVG();
}
window.addEventListener('resize', resizeCanvas);
new ResizeObserver(resizeCanvas).observe(wrapper);
setTimeout(resizeCanvas, 200);

// ── Mode & Tool Selection ──
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (tool === 'browse') {
      annotateMode = false;
      designMode = false;
      currentTool = 'browse';
      clickLayer.style.pointerEvents = 'none';
      canvas.style.pointerEvents = 'none';
      statusText.textContent = 'Browse mode — interact with the page';
      statusTool.textContent = 'Browse mode';
    } else if (tool === 'design') {
      annotateMode = false;
      designMode = true;
      currentTool = 'design';
      clickLayer.style.pointerEvents = 'none';
      canvas.style.pointerEvents = 'none';
      statusText.textContent = 'Design mode — edit visual styles';
      statusTool.textContent = 'Design mode';
      // Switch to design tab
      document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="design"]').classList.add('active');
      document.getElementById('tab-design').classList.add('active');
      document.getElementById('sidebar').classList.add('open');
    } else {
      annotateMode = true;
      designMode = false;
      currentTool = 'postit';
      clickLayer.style.pointerEvents = 'auto';
      canvas.style.pointerEvents = 'none';
      statusText.textContent = 'Comment mode — click to place annotations';
      statusTool.textContent = 'Comment mode';
    }
  });
});

// Tool buttons (cloud, arrow, clear)
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if (tool === 'clear') {
      if (confirm('Clear ALL annotations?')) {
        annotations = [];
        pushHistory();
        saveState();
        renderAll();
        notify('All annotations cleared');
      }
      return;
    }
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.mode-btn[data-tool="postit"]').classList.add('active');
    annotateMode = true;
    designMode = false;
    currentTool = tool;
    clickLayer.style.pointerEvents = 'auto';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (tool === 'cloud') {
      canvas.style.pointerEvents = 'auto';
      canvas.style.zIndex = '18';
      canvas.style.cursor = 'crosshair';
      statusText.textContent = 'Click and drag to circle an area';
    } else if (tool === 'arrow') {
      canvas.style.pointerEvents = 'none';
      statusText.textContent = 'Click start point, then end point for arrow';
    }
    statusTool.textContent = `Tool: ${tool}`;
  });
});

// ── URL Loading ──
function loadUrl(url) {
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  document.getElementById('url-input').value = url;
  iframe.src = url;
  chromeUrlDisplay.textContent = url;
  statusText.textContent = `Loading: ${url}`;
  // Re-apply design overrides after iframe loads
  iframe.onload = () => {
    statusText.textContent = `Loaded: ${url}`;
    applyDesignToPreview();
  };
}

document.getElementById('url-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadUrl(e.target.value);
});
document.getElementById('btn-load-url').addEventListener('click', () => {
  loadUrl(document.getElementById('url-input').value);
});
document.getElementById('project-select').addEventListener('change', e => {
  if (e.target.value) loadUrl(e.target.value);
});

// Device toggles
document.querySelectorAll('.device-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const w = btn.dataset.w;
    deviceFrame.className = '';
    if (w === '100%') {
      deviceFrame.classList.add('frame-desktop');
      deviceFrame.style.maxWidth = '100%';
    } else if (w === '768px') {
      deviceFrame.classList.add('frame-tablet');
      deviceFrame.style.maxWidth = '768px';
    } else {
      deviceFrame.classList.add('frame-mobile');
      deviceFrame.style.maxWidth = '375px';
    }
    setTimeout(resizeCanvas, 100);
  });
});

// Toggle sidebar
document.getElementById('toggle-sidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ── Click Handler on click-layer ──
clickLayer.addEventListener('click', (e) => {
  if (!annotateMode) return;
  if (e.target.closest('.postit') || e.target.closest('.ann-pin')) return;
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const xPct = (x / rect.width * 100).toFixed(2);
  const yPct = (y / rect.height * 100).toFixed(2);

  if (currentTool === 'postit') {
    const ann = {
      id: nextId++, type: 'postit',
      targetX: xPct, targetY: yPct,
      postitX: Math.min(parseFloat(xPct) + 5, 80),
      postitY: Math.max(parseFloat(yPct) - 10, 2),
      text: '', priority: 'medium', category: 'change',
      timestamp: new Date().toISOString()
    };
    annotations.push(ann);
    editingIndex = annotations.length - 1;
    pushHistory();
    saveState();
    renderAll();
    openModal(editingIndex);
  }
  if (currentTool === 'arrow') {
    if (!arrowStart) {
      arrowStart = { x: xPct, y: yPct };
      statusText.textContent = 'Now click the end point for the arrow';
    } else {
      const ann = {
        id: nextId++, type: 'arrow',
        startX: arrowStart.x, startY: arrowStart.y,
        endX: xPct, endY: yPct,
        text: '', priority: 'medium', category: 'change',
        timestamp: new Date().toISOString()
      };
      annotations.push(ann);
      arrowStart = null;
      editingIndex = annotations.length - 1;
      pushHistory();
      saveState();
      renderAll();
      openModal(editingIndex);
    }
  }
});

// ── Cloud Drawing ──
canvas.addEventListener('mousedown', (e) => {
  if (currentTool !== 'cloud') return;
  e.preventDefault(); e.stopPropagation();
  isDrawingCloud = true;
  cloudPoints = [];
  const rect = canvas.getBoundingClientRect();
  cloudPoints.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
});
canvas.addEventListener('mousemove', (e) => {
  if (!isDrawingCloud) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  cloudPoints.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  redrawExistingClouds();
  ctx.beginPath();
  ctx.strokeStyle = '#FF3366';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  cloudPoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.stroke();
  ctx.setLineDash([]);
});
canvas.addEventListener('mouseup', (e) => {
  if (!isDrawingCloud || cloudPoints.length < 5) { isDrawingCloud = false; cloudPoints = []; redrawCanvas(); return; }
  isDrawingCloud = false;
  const w = canvas.width, h = canvas.height;
  const pctPoints = cloudPoints.map(p => ({ x: (p.x / w * 100).toFixed(2), y: (p.y / h * 100).toFixed(2) }));
  const cx = pctPoints.reduce((s, p) => s + parseFloat(p.x), 0) / pctPoints.length;
  const cy = pctPoints.reduce((s, p) => s + parseFloat(p.y), 0) / pctPoints.length;
  const ann = {
    id: nextId++, type: 'cloud', points: pctPoints,
    postitX: Math.min(cx + 10, 75), postitY: Math.max(cy - 10, 2),
    text: '', priority: 'medium', category: 'change',
    timestamp: new Date().toISOString()
  };
  annotations.push(ann);
  editingIndex = annotations.length - 1;
  cloudPoints = [];
  pushHistory();
  saveState();
  renderAll();
  openModal(editingIndex);
});

// ── Render Everything ──
function renderAll() {
  renderPostits();
  renderSidebar();
  redrawCanvas();
  renderSVG();
  const count = annotations.length;
  annBadge.textContent = count || '';
  annCountTab.textContent = count;
  emptyState.style.display = count === 0 ? 'flex' : 'none';
  annList.style.display = count === 0 ? 'none' : 'flex';
}

function renderPostits() {
  postitLayer.innerHTML = '';
  annotations.forEach((ann, i) => {
    if (ann.type === 'postit' || ann.type === 'cloud') {
      if (ann.type === 'postit') {
        const pin = document.createElement('div');
        pin.className = `ann-pin ${ann.priority}`;
        pin.style.left = `${ann.targetX}%`;
        pin.style.top = `${ann.targetY}%`;
        pin.textContent = i + 1;
        pin.innerHTML += `<span class="pin-tooltip">${ann.text || 'No description'}</span>`;
        pin.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          dragTarget = { index: i, el: pin, dragType: 'target' };
          dragOffset.x = 0; dragOffset.y = 0;
        });
        pin.addEventListener('dblclick', (e) => { e.stopPropagation(); openModal(i); });
        postitLayer.appendChild(pin);
      }
      const postit = document.createElement('div');
      postit.className = `postit ${ann.priority}`;
      postit.style.left = `${ann.postitX}%`;
      postit.style.top = `${ann.postitY}%`;
      postit.dataset.index = i;
      postit.innerHTML = `
        <div class="postit-num">${i + 1}</div>
        <div class="postit-header">
          <span>${TYPE_ICONS[ann.category] || '✏️'} ${ann.category || 'change'}</span>
          <span>${ann.priority}</span>
        </div>
        <div class="postit-text">${ann.text || '<i style="opacity:0.4">Double-click to edit</i>'}</div>
      `;
      postit.addEventListener('dblclick', (e) => { e.stopPropagation(); openModal(i); });
      postit.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        dragTarget = { index: i, el: postit };
        const rect = postit.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
      });
      postitLayer.appendChild(postit);
    }
    if (ann.type === 'arrow' && ann.text) {
      const midX = (parseFloat(ann.startX) + parseFloat(ann.endX)) / 2;
      const midY = (parseFloat(ann.startY) + parseFloat(ann.endY)) / 2;
      const label = document.createElement('div');
      label.className = `postit arrow-label ${ann.priority}`;
      label.style.left = `${midX}%`; label.style.top = `${midY}%`;
      label.style.minWidth = '100px'; label.style.transform = 'translate(-50%, -50%)';
      label.innerHTML = `<div class="postit-num">${i + 1}</div><div class="postit-text">${ann.text}</div>`;
      label.addEventListener('dblclick', (e) => { e.stopPropagation(); openModal(i); });
      postitLayer.appendChild(label);
    }
  });
}

// Drag
document.addEventListener('mousemove', (e) => {
  if (!dragTarget) return;
  const wRect = wrapper.getBoundingClientRect();
  const ann = annotations[dragTarget.index];
  if (dragTarget.dragType === 'target') {
    ann.targetX = Math.max(0, Math.min(100, (e.clientX - wRect.left) / wRect.width * 100)).toFixed(2);
    ann.targetY = Math.max(0, Math.min(100, (e.clientY - wRect.top) / wRect.height * 100)).toFixed(2);
    dragTarget.el.style.left = `${ann.targetX}%`;
    dragTarget.el.style.top = `${ann.targetY}%`;
  } else {
    ann.postitX = Math.max(0, Math.min(85, (e.clientX - wRect.left - dragOffset.x) / wRect.width * 100)).toFixed(2);
    ann.postitY = Math.max(0, Math.min(90, (e.clientY - wRect.top - dragOffset.y) / wRect.height * 100)).toFixed(2);
    dragTarget.el.style.left = `${ann.postitX}%`;
    dragTarget.el.style.top = `${ann.postitY}%`;
  }
  renderSVG();
});
document.addEventListener('mouseup', () => {
  if (dragTarget) { pushHistory(); saveState(); dragTarget = null; }
});

// Canvas clouds
function redrawExistingClouds() {
  const w = canvas.width, h = canvas.height;
  annotations.forEach(ann => {
    if (ann.type === 'cloud' && ann.points) {
      ctx.beginPath();
      ctx.strokeStyle = PRIORITY_COLORS[ann.priority] || '#FF3366';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ann.points.forEach((p, i) => {
        const px = parseFloat(p.x) / 100 * w, py = parseFloat(p.y) / 100 * h;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = (PRIORITY_COLORS[ann.priority] || '#FF3366') + '10';
      ctx.fill(); ctx.setLineDash([]);
    }
  });
}
function redrawCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); redrawExistingClouds(); }

function renderSVG() {
  svgOverlay.innerHTML = '';
  const w = wrapper.clientWidth, h = wrapper.clientHeight;
  annotations.forEach(ann => {
    if (ann.type === 'postit' && ann.targetX && ann.postitX) {
      const x1 = parseFloat(ann.targetX)/100*w, y1 = parseFloat(ann.targetY)/100*h;
      const x2 = parseFloat(ann.postitX)/100*w+75, y2 = parseFloat(ann.postitY)/100*h+15;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',x2); line.setAttribute('y2',y2);
      line.setAttribute('stroke', PRIORITY_COLORS[ann.priority]||'#FF3366');
      line.setAttribute('stroke-width','1'); line.setAttribute('stroke-dasharray','4,3');
      line.setAttribute('opacity','0.4'); svgOverlay.appendChild(line);
    }
    if (ann.type === 'arrow') {
      const x1 = parseFloat(ann.startX)/100*w, y1 = parseFloat(ann.startY)/100*h;
      const x2 = parseFloat(ann.endX)/100*w, y2 = parseFloat(ann.endY)/100*h;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1',x1); line.setAttribute('y1',y1);
      line.setAttribute('x2',x2); line.setAttribute('y2',y2);
      line.setAttribute('stroke', PRIORITY_COLORS[ann.priority]||'#FF3366');
      line.setAttribute('stroke-width','2'); svgOverlay.appendChild(line);
      const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy);
      if (len>10) {
        const ux=dx/len,uy=dy/len,ax=x2-ux*12,ay=y2-uy*12,px=-uy*6,py=ux*6;
        const arrow = document.createElementNS('http://www.w3.org/2000/svg','polygon');
        arrow.setAttribute('points',`${x2},${y2} ${ax+px},${ay+py} ${ax-px},${ay-py}`);
        arrow.setAttribute('fill', PRIORITY_COLORS[ann.priority]||'#FF3366');
        svgOverlay.appendChild(arrow);
      }
    }
  });
}

function renderSidebar() {
  annList.innerHTML = '';
  if (annotations.length === 0) return;
  annotations.forEach((ann, i) => {
    const card = document.createElement('div');
    card.className = 'ann-card';
    card.innerHTML = `
      <div class="ann-number">${i+1}</div>
      <div class="ann-header">
        <span class="ann-type">${TYPE_ICONS[ann.category]||'✏️'} ${ann.category||'change'}</span>
        <span class="ann-priority ${ann.priority}">${ann.priority}</span>
      </div>
      <div class="ann-body">${ann.text||'<em style="opacity:0.4">No description</em>'}</div>
      <button class="ann-delete" data-i="${i}" title="Delete">✕</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('ann-delete')) {
        annotations.splice(parseInt(e.target.dataset.i), 1);
        pushHistory(); saveState(); renderAll(); return;
      }
      openModal(i);
    });
    annList.appendChild(card);
  });
}

// ── Modal ──
function openModal(index) {
  editingIndex = index;
  const ann = annotations[index];
  document.getElementById('edit-text').value = ann.text || '';
  document.getElementById('edit-priority').value = ann.priority || 'medium';
  document.getElementById('edit-type').value = ann.category || 'change';
  document.getElementById('edit-title').textContent = `Comment #${index + 1}`;
  document.getElementById('edit-modal').classList.add('show');
  setTimeout(() => document.getElementById('edit-text').focus(), 100);
}

window.closeModal = function() {
  document.getElementById('edit-modal').classList.remove('show');
  if (editingIndex >= 0 && annotations[editingIndex] && !annotations[editingIndex].text) {
    annotations.splice(editingIndex, 1);
    pushHistory(); saveState(); renderAll();
  }
  editingIndex = -1;
};
window.saveAnnotation = function() {
  if (editingIndex < 0) return;
  annotations[editingIndex].text = document.getElementById('edit-text').value;
  annotations[editingIndex].priority = document.getElementById('edit-priority').value;
  annotations[editingIndex].category = document.getElementById('edit-type').value;
  document.getElementById('edit-modal').classList.remove('show');
  editingIndex = -1;
  pushHistory(); saveState(); renderAll();
  notify('Comment saved');
};
window.deleteAnnotation = function() {
  if (editingIndex < 0) return;
  annotations.splice(editingIndex, 1);
  document.getElementById('edit-modal').classList.remove('show');
  editingIndex = -1;
  pushHistory(); saveState(); renderAll();
  notify('Comment deleted');
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ═══════════════════════════════════════
// DESIGN EDITOR
// ═══════════════════════════════════════

// Property map: control ID → CSS property
const PROPERTY_MAP = {
  'css-bg-color': 'background-color',
  'css-text-color': 'color',
  'css-accent-color': '--accent-color',
  'css-link-color': '--link-color',
  'css-border-color': 'border-color',
  'css-font-family': 'font-family',
  'css-font-size': { prop: 'font-size', unit: 'px' },
  'css-font-weight': 'font-weight',
  'css-line-height': 'line-height',
  'css-letter-spacing': { prop: 'letter-spacing', unit: 'px' },
  'css-text-transform': 'text-transform',
  'css-padding': { prop: 'padding', unit: 'px' },
  'css-padding-top': { prop: 'padding-top', unit: 'px' },
  'css-padding-bottom': { prop: 'padding-bottom', unit: 'px' },
  'css-margin': { prop: 'margin', unit: 'px' },
  'css-gap': { prop: 'gap', unit: 'px' },
  'css-border-radius': { prop: 'border-radius', unit: 'px' },
  'css-border-width': { prop: 'border-width', unit: 'px' },
  'css-box-shadow': 'box-shadow',
  'css-opacity': 'opacity',
  'css-display': 'display',
  'css-flex-direction': 'flex-direction',
  'css-justify-content': 'justify-content',
  'css-align-items': 'align-items',
  'css-text-align': 'text-align',
  'css-max-width': 'max-width',
};

// Selector management
function renderSelectorChips() {
  const container = document.getElementById('selector-chips');
  container.innerHTML = '';
  const selectors = Object.keys(designConfig.selectors);
  if (selectors.length === 0 && activeSelector) {
    designConfig.selectors[activeSelector] = designConfig.selectors[activeSelector] || {};
  }
  const allSelectors = [...new Set([...selectors, activeSelector])];
  allSelectors.forEach(sel => {
    const chip = document.createElement('span');
    chip.className = `chip ${sel === activeSelector ? 'active' : ''}`;
    const propCount = Object.keys(designConfig.selectors[sel] || {}).length;
    chip.innerHTML = `${sel}${propCount ? ` <small>(${propCount})</small>` : ''}`;
    chip.addEventListener('click', () => {
      activeSelector = sel;
      document.getElementById('css-selector').value = sel;
      renderSelectorChips();
      loadDesignUIFromConfig();
    });
    // Right click to remove
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(`Remove selector "${sel}" and its overrides?`)) {
        delete designConfig.selectors[sel];
        if (activeSelector === sel) activeSelector = Object.keys(designConfig.selectors)[0] || 'body';
        pushHistory(); saveDesignConfig(); renderSelectorChips(); loadDesignUIFromConfig(); applyDesignToPreview();
      }
    });
    container.appendChild(chip);
  });
}

document.getElementById('btn-add-selector').addEventListener('click', () => {
  const sel = document.getElementById('css-selector').value.trim();
  if (!sel) return;
  activeSelector = sel;
  if (!designConfig.selectors[sel]) designConfig.selectors[sel] = {};
  renderSelectorChips();
  loadDesignUIFromConfig();
  notify(`Selector "${sel}" active`);
});

document.getElementById('css-selector').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-selector').click();
});

// Collapsible sections
document.querySelectorAll('.design-section-header[data-collapse]').forEach(header => {
  header.addEventListener('click', () => {
    const body = document.getElementById(header.dataset.collapse);
    body.classList.toggle('collapsed');
    header.querySelector('.collapse-arrow').textContent = body.classList.contains('collapsed') ? '▸' : '▾';
  });
});

// Wire up all design controls
function wireDesignControls() {
  // Color pickers sync with text inputs
  ['bg-color', 'text-color', 'accent-color', 'link-color', 'border-color'].forEach(name => {
    const picker = document.getElementById(`css-${name}`);
    const text = document.getElementById(`css-${name}-text`);
    picker.addEventListener('input', () => {
      text.value = picker.value;
      onDesignChange(`css-${name}`, picker.value);
    });
    text.addEventListener('change', () => {
      if (text.value.match(/^#[0-9a-f]{3,8}$/i)) picker.value = text.value;
      onDesignChange(`css-${name}`, text.value);
    });
  });

  // Range sliders
  ['font-size', 'line-height', 'letter-spacing', 'padding', 'padding-top', 'padding-bottom', 'margin', 'gap', 'border-radius', 'border-width', 'opacity'].forEach(name => {
    const range = document.getElementById(`css-${name}`);
    const valSpan = document.getElementById(`css-${name}-val`);
    range.addEventListener('input', () => {
      const mapping = PROPERTY_MAP[`css-${name}`];
      const unit = (typeof mapping === 'object' && mapping.unit) ? mapping.unit : '';
      valSpan.textContent = range.value + unit;
      onDesignChange(`css-${name}`, range.value);
    });
  });

  // Selects
  ['font-family', 'font-weight', 'text-transform', 'box-shadow', 'display', 'flex-direction', 'justify-content', 'align-items', 'text-align'].forEach(name => {
    const select = document.getElementById(`css-${name}`);
    select.addEventListener('change', () => onDesignChange(`css-${name}`, select.value));
  });

  // Text inputs
  ['max-width'].forEach(name => {
    const input = document.getElementById(`css-${name}`);
    input.addEventListener('change', () => onDesignChange(`css-${name}`, input.value));
  });

  // Custom font
  document.getElementById('css-font-custom').addEventListener('change', (e) => {
    if (e.target.value) {
      onDesignChange('css-font-family', e.target.value);
      document.getElementById('css-font-family').value = '';
    }
  });

  // Custom CSS
  document.getElementById('btn-apply-custom').addEventListener('click', () => {
    designConfig.customCSS = document.getElementById('css-custom-raw').value;
    pushHistory(); saveDesignConfig(); applyDesignToPreview();
    markUnsaved();
    notify('Custom CSS applied');
  });
}

function onDesignChange(controlId, value) {
  const mapping = PROPERTY_MAP[controlId];
  if (!mapping) return;

  const cssProp = typeof mapping === 'object' ? mapping.prop : mapping;
  const unit = typeof mapping === 'object' ? (mapping.unit || '') : '';

  if (!designConfig.selectors[activeSelector]) designConfig.selectors[activeSelector] = {};

  if (value === '' || value === undefined || value === null) {
    delete designConfig.selectors[activeSelector][cssProp];
  } else {
    // For range values, add unit
    const needsUnit = unit && !String(value).includes(unit) && !String(value).includes('%');
    designConfig.selectors[activeSelector][cssProp] = needsUnit ? value + unit : value;
  }

  // Special: link-color and accent-color apply to specific selectors
  if (controlId === 'css-link-color' && value) {
    if (!designConfig.selectors['a']) designConfig.selectors['a'] = {};
    designConfig.selectors['a']['color'] = value;
  }
  if (controlId === 'css-accent-color' && value) {
    // Store as CSS variable on root
    if (!designConfig.selectors[':root']) designConfig.selectors[':root'] = {};
    designConfig.selectors[':root']['--accent-color'] = value;
  }

  pushHistory();
  saveDesignConfig();
  applyDesignToPreview();
  renderSelectorChips();
  markUnsaved();
}

function loadDesignUIFromConfig() {
  const props = designConfig.selectors[activeSelector] || {};

  // Colors
  ['bg-color|background-color', 'text-color|color', 'border-color|border-color'].forEach(pair => {
    const [name, cssProp] = pair.split('|');
    const val = props[cssProp] || '';
    const picker = document.getElementById(`css-${name}`);
    const text = document.getElementById(`css-${name}-text`);
    if (val && val.match(/^#/)) picker.value = val;
    text.value = val;
  });

  // Accent from :root
  const accentVal = (designConfig.selectors[':root'] || {})['--accent-color'] || '';
  document.getElementById('css-accent-color-text').value = accentVal;
  if (accentVal.match(/^#/)) document.getElementById('css-accent-color').value = accentVal;

  // Link from a
  const linkVal = (designConfig.selectors['a'] || {})['color'] || '';
  document.getElementById('css-link-color-text').value = linkVal;
  if (linkVal.match(/^#/)) document.getElementById('css-link-color').value = linkVal;

  // Ranges
  const rangeMap = {
    'font-size': ['font-size', 'px', '16'],
    'line-height': ['line-height', '', '1.5'],
    'letter-spacing': ['letter-spacing', 'px', '0'],
    'padding': ['padding', 'px', '0'],
    'padding-top': ['padding-top', 'px', '0'],
    'padding-bottom': ['padding-bottom', 'px', '0'],
    'margin': ['margin', 'px', '0'],
    'gap': ['gap', 'px', '0'],
    'border-radius': ['border-radius', 'px', '0'],
    'border-width': ['border-width', 'px', '0'],
    'opacity': ['opacity', '', '1'],
  };
  Object.entries(rangeMap).forEach(([name, [cssProp, unit, def]]) => {
    const val = props[cssProp] || '';
    const numVal = val ? parseFloat(val) : parseFloat(def);
    document.getElementById(`css-${name}`).value = numVal;
    document.getElementById(`css-${name}-val`).textContent = numVal + unit;
  });

  // Selects
  ['font-family', 'font-weight', 'text-transform', 'box-shadow', 'display', 'flex-direction', 'justify-content', 'align-items', 'text-align'].forEach(name => {
    const cssProp = (typeof PROPERTY_MAP[`css-${name}`] === 'object') ? PROPERTY_MAP[`css-${name}`].prop : PROPERTY_MAP[`css-${name}`];
    document.getElementById(`css-${name}`).value = props[cssProp] || '';
  });

  // Text inputs
  document.getElementById('css-max-width').value = props['max-width'] || '';
  document.getElementById('css-custom-raw').value = designConfig.customCSS || '';
}

// ── Generate CSS from config ──
function generateCSS() {
  let css = '/* Generated by Jaspion Design Studio */\n/* ' + new Date().toISOString() + ' */\n\n';

  Object.entries(designConfig.selectors).forEach(([selector, props]) => {
    const entries = Object.entries(props).filter(([,v]) => v !== '' && v !== undefined);
    if (entries.length === 0) return;
    css += `${selector} {\n`;
    entries.forEach(([prop, val]) => {
      css += `  ${prop}: ${val} !important;\n`;
    });
    css += '}\n\n';
  });

  if (designConfig.customCSS) {
    css += '/* Custom CSS */\n' + designConfig.customCSS + '\n';
  }

  return css;
}

// ── Apply design to iframe ──
function applyDesignToPreview() {
  const css = generateCSS();
  try {
    // Try same-origin access
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    let styleEl = doc.getElementById('jaspion-design-overrides');
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'jaspion-design-overrides';
      doc.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  } catch(e) {
    // Cross-origin: use postMessage approach
    // The CSS is still generated and can be exported
    console.log('Cross-origin iframe — CSS generated for export. Preview limited.');
    statusText.textContent = 'Cross-origin: CSS generated for export (preview limited)';
  }
}

// ── Export Functions ──
document.getElementById('btn-copy-css').addEventListener('click', () => {
  const css = generateCSS();
  navigator.clipboard.writeText(css).then(() => {
    notify('CSS copied to clipboard!');
    document.getElementById('btn-copy-css').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    setTimeout(() => {
      document.getElementById('btn-copy-css').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy CSS`;
    }, 2000);
  });
});

document.getElementById('btn-download-css').addEventListener('click', () => {
  const css = generateCSS();
  const blob = new Blob([css], { type: 'text/css' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'design-overrides.css';
  a.click();
  notify('CSS file downloaded');
  markSaved();
});

document.getElementById('btn-reset-design').addEventListener('click', () => {
  if (!confirm('Reset ALL design changes? This cannot be undone.')) return;
  designConfig = { selectors: {}, customCSS: '' };
  activeSelector = 'body';
  pushHistory();
  saveDesignConfig();
  applyDesignToPreview();
  loadDesignUIFromConfig();
  renderSelectorChips();
  markSaved();
  notify('Design reset to defaults');
});

// ── Unsaved indicator ──
function markUnsaved() {
  hasUnsavedChanges = true;
  unsavedIndicator.classList.remove('hidden');
}
function markSaved() {
  hasUnsavedChanges = false;
  unsavedIndicator.classList.add('hidden');
}

// ── Persistence ──
function saveState() {
  localStorage.setItem('ds-annotations', JSON.stringify(annotations));
}
function saveDesignConfig() {
  localStorage.setItem('ds-design-config', JSON.stringify(designConfig));
}

// ── Tabs ──
document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Chat (kept from v4) ──
const GATEWAY_TOKEN = localStorage.getItem('ds-gw-token') || '';
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

function addChatBubble(text, role) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

async function sendChat(text) {
  if (!text.trim()) return;
  addChatBubble(text, 'user');
  chatInput.value = '';
  const thinking = addChatBubble('Thinking...', 'assistant');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GW-Token': GATEWAY_TOKEN },
      body: JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: text }], stream: false })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    thinking.textContent = data.choices?.[0]?.message?.content || 'No response';
  } catch(e) {
    thinking.textContent = `Error: ${e.message}`;
  }
}

if (!GATEWAY_TOKEN) {
  const setupDiv = document.createElement('div');
  setupDiv.style.cssText = 'padding:20px;text-align:center;';
  setupDiv.innerHTML = `
    <div style="width:48px;height:48px;border-radius:50%;background:var(--gray-800);margin:0 auto 12px;display:flex;align-items:center;justify-content:center">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gray-500)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </div>
    <p style="color:var(--gray-400);font-size:13px;margin-bottom:12px">Enter gateway token to connect</p>
    <input id="token-input" type="password" placeholder="Paste token..." style="width:100%;padding:10px 12px;background:var(--gray-800);border:1px solid var(--gray-700);color:var(--gray-300);border-radius:8px;font-size:13px;font-family:var(--font);margin-bottom:8px;outline:none">
    <button id="token-save" style="width:100%;padding:10px;background:var(--pink);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;font-family:var(--font)">Connect</button>
  `;
  chatMessages.appendChild(setupDiv);
  setTimeout(() => {
    document.getElementById('token-save')?.addEventListener('click', () => {
      const t = document.getElementById('token-input').value.trim();
      if (t) { localStorage.setItem('ds-gw-token', t); location.reload(); }
    });
  }, 50);
}

document.getElementById('chat-send').addEventListener('click', () => sendChat(chatInput.value));
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(chatInput.value); }
});

// ── Annotation Export ──
function exportJSON() {
  const url = document.getElementById('url-input').value || 'N/A';
  const data = { url, timestamp: new Date().toISOString(), annotations: annotations.map((a, i) => ({ number: i+1, type: a.type, category: a.category, priority: a.priority, description: a.text })) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'design-annotations.json';
  a.click();
  notify('Exported as JSON');
}
function exportMarkdown() {
  const url = document.getElementById('url-input').value || 'N/A';
  let md = `# Design Annotations\n\n**URL:** ${url}\n**Date:** ${new Date().toLocaleString()}\n\n`;
  annotations.forEach((a, i) => {
    const prio = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🟢';
    md += `**${i+1}.** ${prio} [${a.category}] ${a.text || 'No description'}\n\n`;
  });
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'design-annotations.md';
  a.click();
  notify('Exported as Markdown');
}
document.getElementById('btn-export-json').addEventListener('click', exportJSON);
document.getElementById('btn-export-md').addEventListener('click', exportMarkdown);

// ── Submit to Jaspion ──
document.getElementById('btn-submit').addEventListener('click', async () => {
  if (annotations.length === 0) { notify('No annotations to submit'); return; }
  const url = document.getElementById('url-input').value || 'N/A';
  const report = annotations.map((a, i) => ({ number: i+1, type: a.type, category: a.category, priority: a.priority, description: a.text }));
  const telegramMsg = `🎨 DESIGN STUDIO SUBMISSION\n📍 ${url}\n⏰ ${new Date().toLocaleString()}\n\n${report.map((a, i) => {
    const prio = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🟢';
    return `${i+1}. ${prio} [${a.category}] ${a.description || 'No description'}`;
  }).join('\n')}`;

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  modal.innerHTML = `
    <div style="background:white;border-radius:12px;padding:24px;max-width:500px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.16)">
      <h3 style="margin:0 0 4px;font-size:16px;font-weight:600">Annotations Ready</h3>
      <p style="margin:0 0 16px;color:#8E8E93;font-size:13px">Copy and send to Jaspion</p>
      <textarea style="width:100%;height:180px;background:#F5F5F7;color:#1C1C1E;border:1px solid #E5E5EA;border-radius:8px;padding:12px;font-size:12px;resize:none;font-family:var(--font)" readonly>${telegramMsg}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="ds-copy-btn2" style="flex:1;padding:10px;background:#FF3366;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px">Copy to Clipboard</button>
        <button id="ds-close-btn2" style="padding:10px 20px;background:#F0F0F2;color:#636366;border:none;border-radius:8px;cursor:pointer;font-size:13px">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('ds-copy-btn2').addEventListener('click', () => {
    navigator.clipboard.writeText(telegramMsg).then(() => { document.getElementById('ds-copy-btn2').textContent = '✓ Copied!'; });
  });
  document.getElementById('ds-close-btn2').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
});

// ── Drag & Drop Image Upload ──
document.getElementById('preview-area').addEventListener('dragover', (e) => {
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
});
document.getElementById('preview-area').addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      iframe.style.display = 'none';
      wrapper.style.backgroundImage = `url(${ev.target.result})`;
      wrapper.style.backgroundSize = 'contain';
      wrapper.style.backgroundRepeat = 'no-repeat';
      wrapper.style.backgroundPosition = 'center';
      chromeUrlDisplay.textContent = file.name;
      notify('Image loaded');
    };
    reader.readAsDataURL(file);
  }
});

// ── Notify ──
function notify(msg) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Init ──
wireDesignControls();
renderSelectorChips();
loadDesignUIFromConfig();
renderAll();

// Re-apply design when iframe loads
iframe.addEventListener('load', () => {
  setTimeout(() => applyDesignToPreview(), 300);
});

// Warn on unload if unsaved
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

} // end initApp
