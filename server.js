// ══════════════════════════════════════════════════════════
//  NavWalk — Express Server
//  실행: node server.js
//  환경변수: TMAP_APP_KEY, PORT
// ══════════════════════════════════════════════════════════
const express = require('express');
const https   = require('https');
const path    = require('path');
const app     = express();

app.use(express.json());

// HTML 파일을 같은 폴더에서 서빙
app.use(express.static(path.join(__dirname)));

const TMAP_APP_KEY = process.env.TMAP_APP_KEY || 'G8Nuq8t5My4OvjVD2VTxr7pHTpcvWZdg9P3xSaaz';

// ── 위치 저장 (세션 토큰 기반, 사용자별 분리) ────────────
const locationStore = new Map();

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [token, loc] of locationStore) {
    if (loc.timestamp < cutoff) locationStore.delete(token);
  }
}, 5 * 60 * 1000);

// ── GET / ─────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'naver-walk-nav_button_sets_current_location.html'));
});

// ── POST /api/location ────────────────────────────────────
app.post('/api/location', (req, res) => {
  const { lat, lng, accuracy, timestamp, token } = req.body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ success: false, error: 'lat, lng 값이 필요합니다.' });
  }

  const sessionToken = token || 'default';
  const location = {
    lat,
    lng,
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    timestamp: typeof timestamp === 'number' ? timestamp : Date.now(),
    updatedAt: new Date().toISOString(),
  };

  locationStore.set(sessionToken, location);
  console.log('📍 위치 업데이트 [' + sessionToken + ']:', lat, lng);
  res.json({ success: true, location });
});

// ── GET /api/location ─────────────────────────────────────
app.get('/api/location', (req, res) => {
  const token    = req.query.token || 'default';
  const location = locationStore.get(token);
  if (!location) return res.json({ success: false, message: '아직 위치 없음' });
  res.json({ success: true, location });
});

// ── GET /api/directions ───────────────────────────────────
app.get('/api/directions', (req, res) => {
  const { start, goal } = req.query;

  if (!start || !goal) {
    return res.status(400).json({ error: 'start, goal 파라미터가 필요합니다.' });
  }

  const [startLng, startLat] = String(start).split(',');
  const [goalLng,  goalLat]  = String(goal).split(',');

  if (!startLng || !startLat || !goalLng || !goalLat) {
    return res.status(400).json({ error: '좌표 형식: start=lng,lat&goal=lng,lat' });
  }

  const body = JSON.stringify({
    startX: Number(startLng),
    startY: Number(startLat),
    endX:   Number(goalLng),
    endY:   Number(goalLat),
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    startName:    '출발',
    endName:      '도착',
    searchOption: '0',
    sort:         'index',
  });

  const options = {
    hostname: 'apis.openapi.sk.com',
    path:     '/tmap/routes/pedestrian?version=1',
    method:   'POST',
    headers: {
      'Accept':         'application/json',
      'Content-Type':   'application/json',
      'appKey':         TMAP_APP_KEY,
      'Content-Length': Buffer.byteLength(body),
    },
  };

  console.log('📡 TMAP 경로 요청:', { start, goal });

  const apiReq = https.request(options, apiRes => {
    let data = '';
    apiRes.on('data', chunk => { data += chunk; });
    apiRes.on('end', () => {
      console.log('📨 TMAP 응답:', apiRes.statusCode, data.slice(0, 200));
      res.setHeader('Content-Type', 'application/json');
      res.status(apiRes.statusCode || 200).send(data);
    });
  });

  apiReq.on('error', err => {
    console.error('TMAP API 오류:', err);
    res.status(500).json({ error: 'TMAP API 요청 실패: ' + err.message });
  });

  apiReq.write(body);
  apiReq.end();
});

// ── GET /api/health ───────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'NavWalk server running', uptime: process.uptime() });
});

// ── 서버 시작 ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('✅ NavWalk 서버 실행 중 → http://localhost:' + PORT);
  console.log('   TMAP 앱키:', TMAP_APP_KEY === 'YOUR_TMAP_APP_KEY' ? '⚠️  미설정 (환경변수 TMAP_APP_KEY 필요)' : '✅ 설정됨');
});
