// ===================== SETTINGS =====================

// The sheet holds the gigs of all bands. Only rows whose "Band" cell equals
// this label (not case sensitive) are shown.
const BAND_LABEL = 'Simply Said';

// "Published to the web" CSV link of the shared agenda sheet.
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT6ql9eeunAAc-XCw5Gll8KzgT7UqEOuurBkcigpWr9mu80wfpu3tCT8HxdJNF_pJ3NhY4ikf2C7sfT/pub?gid=293892753&single=true&output=csv';

// Header names in the first row of the sheet (not case sensitive).
const COLUMNS = {
  band: 'Band',
  date: 'Date',
  time: 'Time',
  venue: 'Venue',
  city: 'Location',
  private: 'Private',
};

// Shown instead of venue and place for gigs marked TRUE in the Private column.
const PRIVATE_LABEL = 'Privé optreden';

// Videos: fill in a youtubeId (the part after v= in the link) or a file path.
// Entries with neither show the grey placeholder.
const VIDEOS = [
  { title: 'Holding Back the Years', caption: 'Studiosessie', youtubeId: '', file: '' },
  { title: 'Stars', caption: 'Studiosessie', youtubeId: '', file: '' },
  { title: 'For Your Babies', caption: 'Studiosessie', youtubeId: '', file: '' },
];

// ===================== HELPERS =====================

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Minimal CSV parser: handles quoted fields, escaped quotes and line breaks inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Accepts 2026-12-12, 12/12/2026, 12-12-2026, 12.12.2026 (day first) and 2-digit years.
function parseDate(value) {
  const s = (value || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, Number(m[2]) - 1, Number(m[1]));
  }
  return null;
}

function formatDate(date) {
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

// ===================== VIDEOS =====================

const PLAY_ICON = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path d="M8 4.5 L19 12 L8 19.5 Z" fill="#FFFFFF"></path></svg>';

function renderVideos() {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  VIDEOS.forEach((video) => {
    const item = el('div', 'video');
    const frame = el('div', 'video-frame');

    if (video.youtubeId) {
      const iframe = el('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(video.youtubeId);
      iframe.title = video.title;
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      frame.append(iframe);
    } else if (video.file) {
      const player = el('video');
      player.src = video.file;
      player.controls = true;
      player.preload = 'metadata';
      player.setAttribute('aria-label', video.title);
      frame.append(player);
    } else {
      frame.append(el('span', 'video-label', 'Hier komt je video'));
      const play = el('div', 'video-play');
      play.setAttribute('aria-hidden', 'true');
      play.innerHTML = PLAY_ICON;
      frame.append(play);
    }

    const text = el('div');
    text.append(el('span', 'video-title', video.title));
    if (video.caption) text.append(el('span', 'video-caption', video.caption));

    item.append(frame, text);
    grid.append(item);
  });
}

// ===================== AGENDA =====================

function showMessage(list, message) {
  const item = el('li');
  item.append(el('p', 'agenda-message', message));
  list.append(item);
}

async function loadAgenda() {
  const list = document.getElementById('agenda-list');
  if (!list) return;

  if (!SHEET_CSV_URL) {
    console.warn('script.js: SHEET_CSV_URL is empty, so the agenda is not loaded.');
    return;
  }

  try {
    const response = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const rows = parseCsv((await response.text()).replace(/^\uFEFF/, ''));
    const header = rows.shift().map((h) => h.trim().toLowerCase());
    const col = {};
    Object.keys(COLUMNS).forEach((key) => { col[key] = header.indexOf(COLUMNS[key].toLowerCase()); });
    if (col.band === -1 || col.date === -1) {
      throw new Error('Columns "' + COLUMNS.band + '" and "' + COLUMNS.date + '" not found in the sheet');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cell = (row, key) => (col[key] === -1 ? '' : (row[col[key]] || '').trim());

    const gigs = rows
      .filter((row) => cell(row, 'band').toLowerCase() === BAND_LABEL.toLowerCase())
      .map((row) => {
        const isPrivate = cell(row, 'private').toUpperCase() === 'TRUE';
        return {
          date: parseDate(cell(row, 'date')),
          time: cell(row, 'time'),
          venue: isPrivate ? PRIVATE_LABEL : cell(row, 'venue'),
          city: isPrivate ? '' : cell(row, 'city'),
        };
      })
      .filter((gig) => gig.date && gig.date >= today)
      .sort((a, b) => a.date - b.date || a.time.localeCompare(b.time));

    list.textContent = '';

    if (gigs.length === 0) {
      showMessage(list, 'Er staan momenteel geen optredens gepland.');
      return;
    }

    gigs.forEach((gig) => {
      const row = el('li', 'agenda-row');
      row.append(
        el('span', 'date', formatDate(gig.date)),
        el('span', 'venue', gig.venue),
        el('span', 'city', gig.city),
        el('span', 'time', WEEKDAYS[gig.date.getDay()] + (gig.time ? ' · ' + gig.time : ''))
      );
      list.append(row);
    });
  } catch (error) {
    console.error('script.js: could not load the agenda', error);
    list.textContent = '';
    showMessage(list, 'De agenda kan op dit moment niet geladen worden.');
  }
}

// ===================== INIT =====================

if (typeof document !== 'undefined') {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  renderVideos();
  loadAgenda();
}
