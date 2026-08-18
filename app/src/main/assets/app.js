const TILE_BASE = 'https://act-webstatic.hoyoverse.com/map_manage/map/';
const DEFAULT_LABELS = [13, 186, 4, 10, 11, 232, 51, 52]; // Chests, Puzzle Chests, Special Items, Local Specialties, Ores, Fishing, Experience, World Quests
const MAX_MARKERS = 1500; // ponytail: cap DOM markers per view; cluster or canvas if perf matters
const state = {
  mapInfo: null,     // {origin, total_size, map_version, min_zoom, max_zoom}
  labels: null,      // label tree
  labelIcons: new Map(), // label_id -> icon url
  areas: null,       // region bounds
  points: [],        // all fetched points
  topLevelIds: [],   // top-level category label ids (only these return points)
  marks: new Set(),  // user's collected point ids
  selectedLabels: new Set(),
  markers: L.layerGroup(),
  zoneLayer: L.layerGroup(),
  hasCookie: false,
  onlyUncollected: true,
  showZones: true,
};

const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -5,
  maxZoom: 4,
  zoomControl: true,
  attributionControl: false,
});

const els = {
  filterList: document.getElementById('filter-list'),
  loading: document.getElementById('loading'),
  stats: document.getElementById('stats'),
  syncState: document.getElementById('sync-state'),
  cookieStatus: document.getElementById('cookie-status'),
  cookieInput: document.getElementById('cookie-input'),
  onlyUncollected: document.getElementById('only-uncollected'),
  showZone: document.getElementById('show-zone'),
};

// ---------------- init ----------------
async function init() {
  try {
    const [info, labels, areas] = await Promise.all([
      fetch('/api/info').then((r) => r.json()),
      fetch('/api/labels').then((r) => r.json()),
      fetch('/api/areas').then((r) => r.json()),
    ]);
    if (!info.info || !labels.tree || !areas.list) throw new Error('bad init data');
    state.mapInfo = info.info;
    state.labels = labels.tree;
    state.areas = areas;
    collectLabelIcons(labels.tree);

    const v2 = state.mapInfo.detail_v2;
    state.origin = v2.origin;          // [24206, 8918]
    state.totalSize = v2.total_size;   // [36864, 18432]
    state.mapVersion = v2.map_version;
    state.minZoom = v2.min_zoom;       // -3
    state.maxZoom = v2.max_zoom;       // 0

    setupTiles();
    buildFilters(state.labels);
    setupZones();
    bindEvents();
    await checkCookie();
    fitContent();
    updateCounts();
    refreshPoints();
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:0;left:0;z-index:9999;background:#300;color:#f88;padding:8px;font-size:11px">init error: ${e.stack || e}</pre>`);
  }
}

function fitContent() {
  // center view on the map content (total_size minus padding) at a moderate zoom
  const [w, h] = state.totalSize;
  const pad = state.mapInfo.detail_v2.padding || [0, 0];
  const cx = (pad[0] + (w - pad[0])) / 2;
  const cy = (pad[1] + (h - pad[1])) / 2;
  map.setView([-cy, cx], -2);
}

// ---------------- tiles ----------------
function setupTiles() {
  const [w, h] = state.totalSize;
  const suffix = (z) => (z < 0 ? 'N' : 'P') + Math.abs(z);
  const url = (x, y, z) => `${TILE_BASE}${2}/${state.mapVersion}/${x}_${y}_${suffix(z)}.png`;
  const bounds = L.latLngBounds(L.latLng(-h, 0), L.latLng(0, w));
  const tileLayer = L.tileLayer('', {
    tileSize: 256,
    maxNativeZoom: state.maxZoom,
    minNativeZoom: state.minZoom,
    maxZoom: 4,
    minZoom: -5,
    bounds,
    noWrap: true,
  });
  const orig = tileLayer.getTileUrl.bind(tileLayer);
  tileLayer.getTileUrl = (coords) => url(coords.x, coords.y, coords.z);
  tileLayer.addTo(map);
}

// ---------------- labels / filters ----------------
function collectLabelIcons(tree) {
  for (const cat of tree) {
    state.topLevelIds.push(cat.id);
    if (cat.icon) state.labelIcons.set(cat.id, cat.icon);
    for (const child of cat.children || []) {
      if (child.icon) state.labelIcons.set(child.id, child.icon);
    }
  }
}

function buildFilters(tree) {
  els.filterList.innerHTML = '';
  for (const cat of tree) {
    addCategory(cat);
  }
}

function addCategory(cat) {
  const div = document.createElement('div');
  div.className = 'cat';

  const head = document.createElement('div');
  head.className = 'cat-head';
  head.innerHTML = `${cat.icon ? `<img src="${cat.icon}" onerror="this.style.display='none'">` : ''}<span>${cat.name}</span><span class="count">${cat.children ? cat.children.length : 0}</span>`;
  head.addEventListener('click', () => {
    const children = div.querySelector('.cat-children');
    if (children) children.style.display = children.style.display === 'none' ? 'block' : 'none';
  });
  div.appendChild(head);

  if (cat.children && cat.children.length) {
    const box = document.createElement('div');
    box.className = 'cat-children';
    for (const child of cat.children) {
      box.appendChild(addChild(cat, child));
    }
    div.appendChild(box);
  }
  els.filterList.appendChild(div);
}

function addChild(parent, child) {
  const label = document.createElement('label');
  label.className = 'cat-child';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.labelId = child.id;
  cb.checked = DEFAULT_LABELS.includes(child.id);
  if (cb.checked) state.selectedLabels.add(child.id);
  cb.addEventListener('change', () => {
    if (cb.checked) state.selectedLabels.add(child.id);
    else state.selectedLabels.delete(child.id);
    refreshPoints();
  });
  const icon = child.icon ? `<img src="${child.icon}" style="width:16px;height:16px;border-radius:3px" onerror="this.style.display='none'">` : '';
  label.innerHTML = `${icon}<span>${child.name}</span><span class="count"></span>`;
  label.prepend(cb);
  return label;
}

// ---------------- zones ----------------
function setupZones() {
  for (const area of state.areas.list || []) {
    const b = L.latLngBounds(
      L.latLng(-(area.l_y + state.origin[1]), area.l_x + state.origin[0]),
      L.latLng(-(area.r_y + state.origin[1]), area.r_x + state.origin[0])
    );
    L.rectangle(b, {
      color: '#4fc3f7', weight: 1.5, opacity: 0.7, fill: false, dashArray: '4 4',
    }).bindTooltip(area.name, { sticky: true }).addTo(state.zoneLayer);
  }
  state.zoneLayer.addTo(map);
}

// ---------------- points ----------------
async function refreshPoints() {
  if (!state.selectedLabels.size) {
    state.markers.clearLayers();
    updateCounts();
    return;
  }
  els.loading.style.display = 'block';
  try {
    const labelIds = state.topLevelIds.join(',');
    const data = await fetch(`/api/points?label_ids=${labelIds}`).then((r) => r.json());
    state.points = data.point_list || [];
    renderMarkers();
  } catch (e) {
    els.loading.textContent = `Error: ${e.message}`;
  } finally {
    els.loading.style.display = 'none';
  }
}

function latlngOf(p) {
  return L.latLng(-(p.y_pos + state.origin[1]), p.x_pos + state.origin[0]);
}

function renderMarkers() {
  state.markers.clearLayers();
  let shown = 0;
  const view = map.getBounds();
  for (const p of state.points) {
    if (shown >= MAX_MARKERS) break;
    if (!state.selectedLabels.has(p.label_id)) continue;
    const collected = state.marks.has(p.id);
    if (state.onlyUncollected && collected) continue;
    const latlng = latlngOf(p);
    if (!view.contains(latlng)) continue;
    const iconUrl = p.icon_sign ? '' : (state.labelIcons.get(p.label_id) || '');
    const icon = L.divIcon({
      className: 'point-marker',
      html: `<img src="${iconUrl}" style="width:20px;height:20px" onerror="this.style.display='none'">`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    const mk = L.marker(latlng, { icon });
    const title = p.ext_attrs_map && p.ext_attrs_map.title ? p.ext_attrs_map.title : `Point ${p.id}`;
    const col = collected ? ' (collected)' : '';
    mk.bindTooltip(`${title}${col}`, { sticky: true, direction: 'top', offset: [0, -10] });
    mk.addTo(state.markers);
    shown++;
  }
  state.markers.addTo(map);
  state.shown = shown;
  updateCounts();
}

function updateCounts() {
  const total = state.points.length;
  const collected = [...state.marks].filter((id) => state.points.some((p) => p.id === id)).length;
  els.stats.innerHTML = `Total: <span class="num">${total}</span> · Collected: <span class="num">${collected}</span> · Uncollected: <span class="num">${Math.max(0, total - collected)}</span>`;
}

// ---------------- account sync ----------------
async function checkCookie() {
  const r = await fetch('/api/cookie').then((r) => r.json());
  state.hasCookie = r.hasCookie;
  els.cookieStatus.textContent = state.hasCookie ? 'Cookie saved ✓' : 'No cookie';
  els.cookieStatus.className = state.hasCookie ? 'ok' : '';
  if (state.hasCookie) await refreshMarks();
}

async function refreshMarks() {
  els.syncState.textContent = 'Syncing…';
  try {
    const data = await fetch('/api/marks').then((r) => (r.ok ? r.json() : null));
    if (data) {
      state.marks = new Set((data.point_list || []).map((m) => m.point_id));
      els.syncState.textContent = `Synced: ${state.marks.size} marks`;
      renderMarkers();
    }
  } catch (e) {
    els.syncState.textContent = 'Sync failed';
  }
}

// ---------------- events ----------------
function bindEvents() {
  els.cookieInput.value = localStorage.getItem('hoyo_cookie') || '';
  document.getElementById('cookie-save').addEventListener('click', async () => {
    const cookie = els.cookieInput.value.trim();
    if (!cookie) return;
    const r = await fetch('/api/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie }),
    });
    localStorage.setItem('hoyo_cookie', cookie);
    if (r.ok) {
      els.cookieStatus.textContent = 'Cookie saved ✓';
      els.cookieStatus.className = 'ok';
      await refreshMarks();
    } else {
      els.cookieStatus.textContent = 'Save failed';
      els.cookieStatus.className = 'err';
    }
  });
  document.getElementById('cookie-clear').addEventListener('click', async () => {
    localStorage.removeItem('hoyo_cookie');
    els.cookieInput.value = '';
    await fetch('/api/cookie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cookie: '' }) });
    state.marks.clear();
    state.hasCookie = false;
    els.cookieStatus.textContent = 'No cookie';
    els.cookieStatus.className = '';
    els.syncState.textContent = '';
    renderMarkers();
  });
  els.onlyUncollected.addEventListener('change', (e) => {
    state.onlyUncollected = e.target.checked;
    renderMarkers();
  });
  els.showZone.addEventListener('change', (e) => {
    if (e.target.checked) state.zoneLayer.addTo(map);
    else map.removeLayer(state.zoneLayer);
  });
  map.on('moveend', () => renderMarkers());
  map.on('zoomend', () => renderMarkers());
}

init();
