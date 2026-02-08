// ═══════════════════════════════════════
// Jaspion Design Studio - v4 (InVision)
// ═══════════════════════════════════════

const TYPE_ICONS = { change: '✏️', bug: '🐛', add: '➕', remove: '➖', style: '🎨' };
const PRIORITY_COLORS = { high: '#FF3B30', medium: '#FF9500', low: '#34C759' };

// State
let annotations = JSON.parse(localStorage.getItem('ds-annotations') || '[]');
let currentTool = 'postit';
let editingIndex = -1;
let cloudPoints = [];
let isDrawingCloud = false;
let arrowStart = null;
let dragTarget = null;
let dragOffset = { x: 0, y: 0 };
let annotateMode = true;
let nextId = annotations.length ? Math.max(...annotations.map(a => a.id || 0)) + 1 : 1;

// Elements
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
// Mode buttons (Browse / Comment)
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (tool === 'browse') {
      annotateMode = false;
      currentTool = 'browse';
      clickLayer.style.pointerEvents = 'none';
      canvas.style.pointerEvents = 'none';
      statusText.textContent = 'Browse mode — interact with the page';
      statusTool.textContent = 'Browse mode';
    } else {
      annotateMode = true;
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
        saveState();
        renderAll();
        notify('All annotations cleared');
      }
      return;
    }

    // Activate comment mode
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.mode-btn[data-tool="postit"]').classList.add('active');
    annotateMode = true;
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
  const proxyUrl = `/proxy?url=${encodeURIComponent(url)}`;
  iframe.src = proxyUrl;
  chromeUrlDisplay.textContent = url;
  statusText.textContent = `Loading: ${url}`;
}

document.getElementById('url-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadUrl(e.target.value);
});
document.getElementById('btn-load-url').addEventListener('click', () => {
  loadUrl(document.getElementById('url-input').value);
});
document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => loadUrl(btn.dataset.url));
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
      id: nextId++,
      type: 'postit',
      targetX: xPct,
      targetY: yPct,
      postitX: Math.min(parseFloat(xPct) + 5, 80),
      postitY: Math.max(parseFloat(yPct) - 10, 2),
      text: '',
      priority: 'medium',
      category: 'change',
      timestamp: new Date().toISOString()
    };
    annotations.push(ann);
    editingIndex = annotations.length - 1;
    saveState();
    renderAll();
    openModal(editingIndex);
  }

  if (currentTool === 'arrow') {
    if (!arrowStart) {
      arrowStart = { x: xPct, y: yPct };
      statusText.textContent = 'Now click the end point for the arrow';
      notify('Arrow start set — click end point');
    } else {
      const ann = {
        id: nextId++,
        type: 'arrow',
        startX: arrowStart.x,
        startY: arrowStart.y,
        endX: xPct,
        endY: yPct,
        text: '',
        priority: 'medium',
        category: 'change',
        timestamp: new Date().toISOString()
      };
      annotations.push(ann);
      arrowStart = null;
      editingIndex = annotations.length - 1;
      saveState();
      renderAll();
      openModal(editingIndex);
    }
  }
});

// ── Cloud Drawing (freehand) on canvas ──
canvas.addEventListener('mousedown', (e) => {
  if (currentTool !== 'cloud') return;
  e.preventDefault();
  e.stopPropagation();
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
  cloudPoints.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
});

canvas.addEventListener('mouseup', (e) => {
  if (!isDrawingCloud || cloudPoints.length < 5) {
    isDrawingCloud = false;
    cloudPoints = [];
    redrawCanvas();
    return;
  }
  isDrawingCloud = false;
  const w = canvas.width;
  const h = canvas.height;
  const pctPoints = cloudPoints.map(p => ({
    x: (p.x / w * 100).toFixed(2),
    y: (p.y / h * 100).toFixed(2)
  }));
  const cx = pctPoints.reduce((s, p) => s + parseFloat(p.x), 0) / pctPoints.length;
  const cy = pctPoints.reduce((s, p) => s + parseFloat(p.y), 0) / pctPoints.length;
  const ann = {
    id: nextId++,
    type: 'cloud',
    points: pctPoints,
    postitX: Math.min(cx + 10, 75),
    postitY: Math.max(cy - 10, 2),
    text: '',
    priority: 'medium',
    category: 'change',
    timestamp: new Date().toISOString()
  };
  annotations.push(ann);
  editingIndex = annotations.length - 1;
  cloudPoints = [];
  saveState();
  renderAll();
  openModal(editingIndex);
});

// Touch support
canvas.addEventListener('touchstart', (e) => {
  if (currentTool !== 'cloud') return;
  e.preventDefault();
  isDrawingCloud = true;
  cloudPoints = [];
  const rect = canvas.getBoundingClientRect();
  const t = e.touches[0];
  cloudPoints.push({ x: t.clientX - rect.left, y: t.clientY - rect.top });
});
canvas.addEventListener('touchmove', (e) => {
  if (!isDrawingCloud) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const t = e.touches[0];
  cloudPoints.push({ x: t.clientX - rect.left, y: t.clientY - rect.top });
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
canvas.addEventListener('touchend', () => {
  canvas.dispatchEvent(new MouseEvent('mouseup'));
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
      // Pin at target location
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
          dragOffset.x = 0;
          dragOffset.y = 0;
        });
        pin.addEventListener('dblclick', (e) => { e.stopPropagation(); openModal(i); });
        postitLayer.appendChild(pin);
      }

      // Post-it card
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

    // Arrow label
    if (ann.type === 'arrow' && ann.text) {
      const midX = (parseFloat(ann.startX) + parseFloat(ann.endX)) / 2;
      const midY = (parseFloat(ann.startY) + parseFloat(ann.endY)) / 2;
      const label = document.createElement('div');
      label.className = `postit arrow-label ${ann.priority}`;
      label.style.left = `${midX}%`;
      label.style.top = `${midY}%`;
      label.style.minWidth = '100px';
      label.style.transform = 'translate(-50%, -50%)';
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
    const x = ((e.clientX - wRect.left) / wRect.width * 100);
    const y = ((e.clientY - wRect.top) / wRect.height * 100);
    ann.targetX = Math.max(0, Math.min(100, x)).toFixed(2);
    ann.targetY = Math.max(0, Math.min(100, y)).toFixed(2);
    dragTarget.el.style.left = `${ann.targetX}%`;
    dragTarget.el.style.top = `${ann.targetY}%`;
  } else {
    const x = ((e.clientX - wRect.left - dragOffset.x) / wRect.width * 100);
    const y = ((e.clientY - wRect.top - dragOffset.y) / wRect.height * 100);
    ann.postitX = Math.max(0, Math.min(85, x)).toFixed(2);
    ann.postitY = Math.max(0, Math.min(90, y)).toFixed(2);
    dragTarget.el.style.left = `${ann.postitX}%`;
    dragTarget.el.style.top = `${ann.postitY}%`;
  }
  renderSVG();
});
document.addEventListener('mouseup', () => {
  if (dragTarget) { saveState(); dragTarget = null; }
});

// Canvas clouds
function redrawExistingClouds() {
  const w = canvas.width;
  const h = canvas.height;
  annotations.forEach(ann => {
    if (ann.type === 'cloud' && ann.points) {
      ctx.beginPath();
      ctx.strokeStyle = PRIORITY_COLORS[ann.priority] || '#FF3366';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ann.points.forEach((p, i) => {
        const px = parseFloat(p.x) / 100 * w;
        const py = parseFloat(p.y) / 100 * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = (PRIORITY_COLORS[ann.priority] || '#FF3366') + '10';
      ctx.fill();
      ctx.setLineDash([]);
    }
  });
}

function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  redrawExistingClouds();
}

function renderSVG() {
  svgOverlay.innerHTML = '';
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;

  annotations.forEach(ann => {
    if (ann.type === 'postit' && ann.targetX && ann.postitX) {
      const x1 = parseFloat(ann.targetX) / 100 * w;
      const y1 = parseFloat(ann.targetY) / 100 * h;
      const x2 = parseFloat(ann.postitX) / 100 * w + 75;
      const y2 = parseFloat(ann.postitY) / 100 * h + 15;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', PRIORITY_COLORS[ann.priority] || '#FF3366');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '4,3');
      line.setAttribute('opacity', '0.4');
      svgOverlay.appendChild(line);
    }

    if (ann.type === 'arrow') {
      const x1 = parseFloat(ann.startX) / 100 * w;
      const y1 = parseFloat(ann.startY) / 100 * h;
      const x2 = parseFloat(ann.endX) / 100 * w;
      const y2 = parseFloat(ann.endY) / 100 * h;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', PRIORITY_COLORS[ann.priority] || '#FF3366');
      line.setAttribute('stroke-width', '2');
      svgOverlay.appendChild(line);
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 10) {
        const ux = dx / len, uy = dy / len;
        const ax = x2 - ux * 12, ay = y2 - uy * 12;
        const px = -uy * 6, py = ux * 6;
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${x2},${y2} ${ax + px},${ay + py} ${ax - px},${ay - py}`);
        arrow.setAttribute('fill', PRIORITY_COLORS[ann.priority] || '#FF3366');
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
    card.className = `ann-card`;
    card.innerHTML = `
      <div class="ann-number">${i + 1}</div>
      <div class="ann-header">
        <span class="ann-type">${TYPE_ICONS[ann.category] || '✏️'} ${ann.category || 'change'}</span>
        <span class="ann-priority ${ann.priority}">${ann.priority}</span>
      </div>
      <div class="ann-body">${ann.text || '<em style="opacity:0.4">No description</em>'}</div>
      <button class="ann-delete" data-i="${i}" title="Delete">✕</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('ann-delete')) {
        annotations.splice(parseInt(e.target.dataset.i), 1);
        saveState(); renderAll();
        return;
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
    saveState(); renderAll();
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
  saveState(); renderAll();
  notify('Comment saved');
};

window.deleteAnnotation = function() {
  if (editingIndex < 0) return;
  annotations.splice(editingIndex, 1);
  document.getElementById('edit-modal').classList.remove('show');
  editingIndex = -1;
  saveState(); renderAll();
  notify('Comment deleted');
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ── Gateway Config ──
const GATEWAY_TOKEN = localStorage.getItem('ds-gw-token') || '';
const CHAT_API = '/api/chat';

// ── Chat ──
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

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
    const res = await fetch(CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GW-Token': GATEWAY_TOKEN },
      body: JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: text }], stream: false })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    thinking.textContent = data.choices?.[0]?.message?.content || 'No response';
  } catch(e) {
    thinking.textContent = `Error: ${e.message}`;
    thinking.style.borderColor = 'var(--high)';
  }
}

// Token setup
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
    document.getElementById('token-save').addEventListener('click', () => {
      const t = document.getElementById('token-input').value.trim();
      if (t) { localStorage.setItem('ds-gw-token', t); location.reload(); }
    });
    document.getElementById('token-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('token-save').click();
    });
  }, 50);
}

chatSend.addEventListener('click', () => sendChat(chatInput.value));
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(chatInput.value); }
});

// ── Export Functions ──
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

// ── Submit ──
document.getElementById('btn-submit').addEventListener('click', async () => {
  if (annotations.length === 0) { notify('No annotations to submit'); return; }

  const url = document.getElementById('url-input').value || 'N/A';
  const report = annotations.map((a, i) => ({
    number: i + 1, type: a.type, category: a.category,
    priority: a.priority, description: a.text,
  }));

  statusText.textContent = 'Capturing screenshot...';

  let screenshotData = null;
  try {
    const captureArea = wrapper;
    const c = await html2canvas(captureArea, {
      backgroundColor: '#F5F5F7',
      scale: 1, useCORS: true, allowTaint: true, logging: false,
    });
    screenshotData = c.toDataURL('image/png');
  } catch(e) { console.warn('Screenshot failed:', e); }

  // Copy modal
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
      <textarea id="ds-copy-text" style="width:100%;height:180px;background:#F5F5F7;color:#1C1C1E;border:1px solid #E5E5EA;border-radius:8px;padding:12px;font-size:12px;resize:none;font-family:var(--font)" readonly>${telegramMsg}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="ds-copy-btn" style="flex:1;padding:10px;background:#FF3366;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;font-family:var(--font)">Copy to Clipboard</button>
        <button id="ds-close-btn" style="padding:10px 20px;background:#F0F0F2;color:#636366;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-family:var(--font)">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('ds-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(telegramMsg).then(() => {
      document.getElementById('ds-copy-btn').textContent = '✓ Copied!';
    });
  });
  document.getElementById('ds-close-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  localStorage.setItem('ds-last-submission', JSON.stringify({ url, timestamp: new Date().toISOString(), annotations: report }, null, 2));

  // Send to chat
  document.querySelector('[data-tab="chat"]').click();
  const screenshotNote = screenshotData ? '\n\n📸 Screenshot captured.' : '';
  const chatMsg = `📋 Design annotations for ${url}:\n\n${report.map((a, i) => {
    const prio = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🟢';
    return `${i+1}. ${prio} [${a.category}] ${a.description || 'No description'}`;
  }).join('\n')}\n\nPlease implement these changes.${screenshotNote}`;
  await sendChat(chatMsg);
  statusText.textContent = `✓ ${annotations.length} annotations sent to Jaspion`;
  notify('Annotations sent!');
});

// ── Tabs ──
document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Helpers ──
function saveState() {
  localStorage.setItem('ds-annotations', JSON.stringify(annotations));
}

function notify(msg) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Drag & Drop Image Upload ──
document.getElementById('preview-area').addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
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
      statusText.textContent = `Image loaded: ${file.name}`;
      notify('Image loaded');
    };
    reader.readAsDataURL(file);
  }
});

// ── Init ──
renderAll();
