// ═══════════════════════════════════════
// Jaspion Design Studio - v3
// ═══════════════════════════════════════

const TYPE_ICONS = { change: '✏️', bug: '🐛', add: '➕', remove: '➖', style: '🎨' };
const PRIORITY_COLORS = { high: '#e94560', medium: '#ffc107', low: '#00d97e' };

// State
let annotations = JSON.parse(localStorage.getItem('ds-annotations') || '[]');
let currentTool = 'postit';
let editingIndex = -1;
let cloudPoints = [];
let isDrawingCloud = false;
let arrowStart = null;
let dragTarget = null;
let dragOffset = { x: 0, y: 0 };
let annotateMode = true; // true = clicks create annotations, false = browse iframe
let nextId = annotations.length ? Math.max(...annotations.map(a => a.id || 0)) + 1 : 1;

// Elements
const iframe = document.getElementById('preview-iframe');
const wrapper = document.getElementById('preview-wrapper');
const postitLayer = document.getElementById('postit-layer');
const svgOverlay = document.getElementById('svg-overlay');
const canvas = document.getElementById('annotation-canvas');
const ctx = canvas.getContext('2d');
const annList = document.getElementById('annotation-list');
const annCount = document.getElementById('ann-count');
const statusText = document.getElementById('status-text');
const statusTool = document.getElementById('status-tool');

// ── Create click-capture overlay ──
// This transparent div sits on top of the iframe to capture clicks
const clickLayer = document.createElement('div');
clickLayer.id = 'click-layer';
clickLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:4;cursor:crosshair;';
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

// ── Tool Selection ──
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
    if (tool === 'browse') {
      annotateMode = !annotateMode;
      clickLayer.style.pointerEvents = annotateMode ? 'auto' : 'none';
      canvas.style.pointerEvents = 'none';
      btn.classList.toggle('active', !annotateMode);
      statusText.textContent = annotateMode ? 'Annotate mode — click to place annotations' : 'Browse mode — interact with the page';
      statusTool.textContent = annotateMode ? 'Mode: Annotate' : 'Mode: Browse';
      return;
    }
    
    currentTool = tool;
    annotateMode = true;
    clickLayer.style.pointerEvents = 'auto';
    
    document.querySelectorAll('.tool-btn:not([data-tool="clear"]):not([data-tool="browse"])').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Enable canvas for cloud drawing
    if (tool === 'cloud') {
      canvas.style.pointerEvents = 'auto';
      canvas.style.zIndex = '7';
    } else {
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '5';
    }
    
    statusTool.textContent = `Tool: ${btn.textContent.trim()}`;
    if (tool === 'postit') statusText.textContent = 'Click anywhere to place a post-it';
    if (tool === 'cloud') statusText.textContent = 'Click and drag to circle an area';
    if (tool === 'arrow') statusText.textContent = 'Click start point, then end point';
    if (tool === 'move') statusText.textContent = 'Drag post-its to reposition';
  });
});

// ── URL Loading ──
function loadUrl(url) {
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  document.getElementById('url-input').value = url;
  iframe.src = url;
  statusText.textContent = `Loading: ${url}`;
}

document.getElementById('url-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadUrl(e.target.value);
});
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => loadUrl(btn.dataset.url));
});

// Device toggles
document.querySelectorAll('.device-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const w = btn.dataset.w;
    if (w === '100%') {
      wrapper.style.maxWidth = '100%';
      wrapper.style.margin = '0';
    } else {
      wrapper.style.maxWidth = w;
      wrapper.style.margin = '0 auto';
    }
    setTimeout(resizeCanvas, 100);
  });
});

// ── Click Handler on click-layer ──
clickLayer.addEventListener('click', (e) => {
  if (!annotateMode) return;
  if (e.target.closest('.postit')) return;
  
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
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  cloudPoints.push({ x, y });
  
  // Draw live
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  redrawExistingClouds();
  ctx.beginPath();
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
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

// Touch support for cloud
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
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
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
  annCount.textContent = `${annotations.length} annotation${annotations.length !== 1 ? 's' : ''}`;
}

function renderPostits() {
  postitLayer.innerHTML = '';
  
  annotations.forEach((ann, i) => {
    if (ann.type === 'postit' || ann.type === 'cloud') {
      // Target dot (draggable to stretch leader)
      if (ann.type === 'postit') {
        const dot = document.createElement('div');
        dot.className = `target-dot ${ann.priority}`;
        dot.style.left = `${ann.targetX}%`;
        dot.style.top = `${ann.targetY}%`;
        dot.style.transform = 'translate(-50%, -50%)';
        dot.style.cursor = 'grab';
        dot.style.pointerEvents = 'auto';
        dot.style.zIndex = '12';
        dot.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          dragTarget = { index: i, el: dot, dragType: 'target' };
          dragOffset.x = 0;
          dragOffset.y = 0;
        });
        postitLayer.appendChild(dot);
      }
      
      // Post-it
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
        <div class="postit-text">${ann.text || '<i>Double-click to edit</i>'}</div>
      `;
      
      postit.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openModal(i);
      });
      
      postit.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        dragTarget = { index: i, el: postit };
        const rect = postit.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
      });
      
      postitLayer.appendChild(postit);
    }
    
    // Arrow annotations get a label
    if (ann.type === 'arrow' && ann.text) {
      const midX = (parseFloat(ann.startX) + parseFloat(ann.endX)) / 2;
      const midY = (parseFloat(ann.startY) + parseFloat(ann.endY)) / 2;
      const label = document.createElement('div');
      label.className = `postit ${ann.priority}`;
      label.style.left = `${midX}%`;
      label.style.top = `${midY}%`;
      label.style.minWidth = '100px';
      label.style.transform = 'translate(-50%, -50%)';
      label.innerHTML = `<div class="postit-num">${i + 1}</div><div class="postit-text" style="font-size:11px">${ann.text}</div>`;
      label.addEventListener('dblclick', (e) => { e.stopPropagation(); openModal(i); });
      postitLayer.appendChild(label);
    }
  });
}

// Drag — supports both postit body and target dot
document.addEventListener('mousemove', (e) => {
  if (!dragTarget) return;
  const wRect = wrapper.getBoundingClientRect();
  const ann = annotations[dragTarget.index];
  
  if (dragTarget.dragType === 'target') {
    // Dragging the target dot (stretches leader)
    const x = ((e.clientX - wRect.left) / wRect.width * 100);
    const y = ((e.clientY - wRect.top) / wRect.height * 100);
    ann.targetX = Math.max(0, Math.min(100, x)).toFixed(2);
    ann.targetY = Math.max(0, Math.min(100, y)).toFixed(2);
    dragTarget.el.style.left = `${ann.targetX}%`;
    dragTarget.el.style.top = `${ann.targetY}%`;
  } else {
    // Dragging the postit note
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
      ctx.strokeStyle = PRIORITY_COLORS[ann.priority] || '#00d4ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ann.points.forEach((p, i) => {
        const px = parseFloat(p.x) / 100 * w;
        const py = parseFloat(p.y) / 100 * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = (PRIORITY_COLORS[ann.priority] || '#00d4ff') + '15';
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
      line.setAttribute('stroke', PRIORITY_COLORS[ann.priority] || '#888');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4,3');
      line.setAttribute('opacity', '0.6');
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
      line.setAttribute('stroke', PRIORITY_COLORS[ann.priority] || '#00d4ff');
      line.setAttribute('stroke-width', '2.5');
      svgOverlay.appendChild(line);
      
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 10) {
        const ux = dx / len, uy = dy / len;
        const ax = x2 - ux * 12, ay = y2 - uy * 12;
        const px = -uy * 6, py = ux * 6;
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${x2},${y2} ${ax + px},${ay + py} ${ax - px},${ay - py}`);
        arrow.setAttribute('fill', PRIORITY_COLORS[ann.priority] || '#00d4ff');
        svgOverlay.appendChild(arrow);
      }
    }
  });
}

function renderSidebar() {
  annList.innerHTML = '';
  if (annotations.length === 0) {
    annList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim)">No annotations yet.<br><br>📌 Click on the page to add post-its<br>☁️ Draw to circle areas<br>➡️ Click two points for arrows</div>';
    return;
  }
  annotations.forEach((ann, i) => {
    const card = document.createElement('div');
    card.className = `ann-card ${ann.priority}`;
    card.innerHTML = `
      <div class="ann-header">
        <span>#${i + 1} ${TYPE_ICONS[ann.category] || '✏️'} ${ann.category || 'change'}</span>
        <span class="ann-delete" data-i="${i}">✕</span>
      </div>
      <div class="ann-body">${ann.text || '<em style="opacity:0.5">No description</em>'}</div>
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
  document.getElementById('edit-title').textContent = `✏️ Annotation #${index + 1} (${ann.type})`;
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
  notify('Annotation saved!');
};

window.deleteAnnotation = function() {
  if (editingIndex < 0) return;
  annotations.splice(editingIndex, 1);
  document.getElementById('edit-modal').classList.remove('show');
  editingIndex = -1;
  saveState(); renderAll();
  notify('Annotation deleted');
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ── Gateway Config ──
// Token stored in localStorage. Chat proxied through local server to avoid CORS.
const GATEWAY_TOKEN = localStorage.getItem('ds-gw-token') || '';
const CHAT_API = '/api/chat'; // proxied through server.py

// ── Chat ──
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

function addChatBubble(text, role) {
  const bubble = document.createElement('div');
  bubble.style.cssText = `padding:8px 12px;border-radius:8px;max-width:90%;font-size:0.85rem;line-height:1.4;white-space:pre-wrap;word-break:break-word;${
    role === 'user'
      ? 'background:var(--accent);color:#000;align-self:flex-end;'
      : 'background:var(--glass);border:1px solid var(--glass-border);color:var(--text);align-self:flex-start;'
  }`;
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
      headers: {
        'Content-Type': 'application/json',
        'X-GW-Token': GATEWAY_TOKEN
      },
      body: JSON.stringify({
        model: 'openclaw',
        messages: [{ role: 'user', content: text }],
        stream: false
      })
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    thinking.textContent = data.choices?.[0]?.message?.content || 'No response';
  } catch(e) {
    thinking.textContent = `❌ Error: ${e.message}`;
    thinking.style.borderColor = 'var(--red)';
  }
}

// Show setup prompt if no token
if (!GATEWAY_TOKEN) {
  const setupDiv = document.createElement('div');
  setupDiv.style.cssText = 'padding:12px;text-align:center;';
  setupDiv.innerHTML = `
    <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:8px">🔑 Enter gateway token to connect:</p>
    <input id="token-input" type="password" placeholder="Paste token here..." style="width:100%;padding:8px;background:var(--glass);border:1px solid var(--glass-border);color:var(--text);border-radius:6px;font-size:0.85rem;margin-bottom:6px">
    <button id="token-save" style="width:100%;padding:8px;background:var(--accent);color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:bold">Connect</button>
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

// ── Submit ──
document.getElementById('btn-submit').addEventListener('click', async () => {
  if (annotations.length === 0) { notify('No annotations to submit!'); return; }
  
  const url = document.getElementById('url-input').value || 'N/A';
  const report = annotations.map((a, i) => ({
    number: i + 1, type: a.type, category: a.category,
    priority: a.priority, description: a.text,
  }));
  
  statusText.textContent = '📸 Capturing screenshot...';
  notify('📸 Capturing screenshot with annotations...');
  
  // Capture screenshot of the preview area with all annotations visible
  let screenshotData = null;
  try {
    const captureArea = wrapper;
    const canvas = await html2canvas(captureArea, {
      backgroundColor: '#1a1a2e',
      scale: 1,
      useCORS: true,
      allowTaint: true,
      logging: false,
    });
    screenshotData = canvas.toDataURL('image/png');
  } catch(e) {
    console.warn('Screenshot capture failed:', e);
  }
  
  // Send to Jaspion via webhook (works on GitHub Pages - no backend needed)
  try {
    const submission = {
      url,
      timestamp: new Date().toISOString(),
      annotations: report,
      screenshot: screenshotData ? screenshotData.substring(0, 500) + '...[truncated]' : null,
      userAgent: navigator.userAgent,
    };
    
    // Store in Supabase for Jaspion to pick up
    const SUPABASE_URL = 'https://uquztttljpswheiikbkw.supabase.co';
    const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxdXp0dHRsanBzd2hlaWlrYmt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyNjI1MTIsImV4cCI6MjA1NDgzODUxMn0.YOUR_KEY';
    
    // Fallback: save to localStorage and show copy button
    const submissionJSON = JSON.stringify(submission, null, 2);
    localStorage.setItem('ds-pending-submission', submissionJSON);
    
    // Create a shareable text version for Telegram
    const telegramMsg = `🎨 DESIGN STUDIO SUBMISSION\n📍 ${url}\n⏰ ${new Date().toLocaleString()}\n\n${report.map((a, i) => {
      const prio = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🟢';
      return \`\${i+1}. \${prio} [\${a.category}] \${a.description || 'No description'}\`;
    }).join('\n')}\n\n💬 Copy this and send to Jaspion on Telegram!`;
    
    // Show copy-to-clipboard modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
    modal.innerHTML = \`
      <div style="background:#1e1e2e;border-radius:16px;padding:24px;max-width:500px;width:100%;color:#fff">
        <h3 style="margin:0 0 12px;color:#00d4aa">✅ Annotations Ready!</h3>
        <p style="margin:0 0 16px;opacity:0.8">Copy and send to Jaspion on Telegram:</p>
        <textarea id="ds-copy-text" style="width:100%;height:200px;background:#2a2a3e;color:#fff;border:1px solid #444;border-radius:8px;padding:12px;font-size:13px;resize:none" readonly>\${telegramMsg}</textarea>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button id="ds-copy-btn" style="flex:1;padding:12px;background:#00d4aa;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px">📋 Copy to Clipboard</button>
          <button id="ds-close-btn" style="padding:12px 20px;background:#333;color:#fff;border:none;border-radius:8px;cursor:pointer">Close</button>
        </div>
      </div>
    \`;
    document.body.appendChild(modal);
    
    document.getElementById('ds-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(telegramMsg).then(() => {
        document.getElementById('ds-copy-btn').textContent = '✅ Copied!';
        document.getElementById('ds-copy-btn').style.background = '#00aa88';
      });
    });
    document.getElementById('ds-close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    
  } catch(e) {
    console.warn('Submission failed:', e);
  }
  
  // Save to localStorage
  localStorage.setItem('ds-last-submission', JSON.stringify({ url, timestamp: new Date().toISOString(), annotations: report }, null, 2));
  
  // Switch to chat tab and send to Jaspion
  document.querySelector('[data-tab="chat"]').click();
  
  const screenshotNote = screenshotData ? '\n\n📸 Screenshot with annotations saved at design-studio/uploads/ for visual reference.' : '';
  const chatMsg = `📋 Design annotations submitted for ${url}:\n\n${report.map((a, i) => {
    const prio = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🟢';
    return `${i+1}. ${prio} [${a.category}] ${a.description || 'No description'}`;
  }).join('\n')}\n\nPlease implement these changes.${screenshotNote}`;
  
  await sendChat(chatMsg);
  statusText.textContent = `✅ ${annotations.length} annotations + screenshot sent to Jaspion`;
  notify('✅ Annotations + screenshot sent!');
});

// ── Tabs ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.style.background = 'transparent'; b.style.color = 'var(--text-dim)'; });
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    btn.classList.add('active');
    btn.style.background = 'var(--glass)';
    btn.style.color = 'var(--text)';
    document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'flex';
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

function generateMarkdown(report) {
  let md = `# 🎨 Design Annotations\n\n`;
  md += `**URL:** ${report.url}\n**Date:** ${new Date(report.timestamp).toLocaleString()}\n\n`;
  report.annotations.forEach(a => {
    const prio = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🟢';
    md += `**${a.number}.** ${prio} [${a.category}] ${a.description || 'No description'}\n\n`;
  });
  return md;
}

// ── Init ──
renderAll();
