/**
 * Quant Stock Board 개인 프록시 — Cloudflare Worker (무료, 하루 10만 요청)
 *
 * ★ 이 파일의 버전은 아래 `const VER` 하나뿐이다. **머리 주석에 버전을 다시 적지 않는다.**
 *   v7.2까지 이 줄이 'v7.0'이라고 선언하고 있었는데 `VER`은 이미 7.2였다 — 파일을 연 사람이
 *   "옛날 파일인가?"를 묻게 만들었다. 같은 값을 두 군데 적으면 반드시 갈라진다(§22-⑲).
 *   아래 연혁에 (v6.9)·(v7.0) 같은 표기는 **과거 판을 가리키는 기록**이지 이 파일의 현재
 *   버전이 아니다. 현재 버전은 `VER`이고, 소스와 `VER`의 짝은 docs/WORKERHASH.json이 지킨다.
 *
 * (v7.0 · 앱 v5.5) v5.4 워커(v6.8 + revenueBasis·deRatio·upstreamFetch·선택적 Origin/레이트리밋 래퍼)에
 *   v6.9 보안 설계를 합쳤다. 응답 본문 키는 v5.4와 같고, /summary 끝에 epsFwdSrc 하나가 늘었다.
 *   · v5.4 래퍼의 '선택적' Origin 검사·CORS `*`·URL 전체 캐시 키는 v6.9의 **필수** ID 토큰 인증 ·
 *     Origin 반사 · 정규화 캐시 키 · 부분 성공 미캐시로 대체한다(Origin 없는 curl이 통과하던 문제).
 *   · upstreamFetch: 8초 + **본문 8MB 상한**(v5.4는 크기 제한 없이 r.text()).
 *   · 500 응답에 내부 오류 원문을 싣지 않는다(로그에만 남긴다).
 *   · /summary epsFwdSrc: 'ks'(상장 통화) | 'trend'(재무제표 통화·원주 추정) — 앱이 ADR 통화 불일치를 가린다.
 *
 * (v6.9) 보안·신뢰성 강화 — **응답 키·기능은 하나도 바꾸지 않는다**(앱 호환).
 *   ① 호출자 인증: 모든 경로가 `Authorization: Bearer <Firebase ID 토큰>`을 요구한다.
 *      v6.8까지 워커 URL은 공개였고 누구나 우리 무료 한도(10만/일)·KRX 키·야후 크럼을
 *      빌려 쓸 수 있었다. 입장 명단은 firestore.rules와 **같은 조건**(google.com 로그인 ·
 *      email_verified · 명단 이메일)이며, 명단 자체는 env `ALLOWED_EMAILS`로만 받는다.
 *      env `AUTH_MODE=report`면 실패해도 통과시키고 `X-QA-Auth: fail:<사유>`만 단다(전환기).
 *   ② CORS를 `*`에서 env `ALLOWED_ORIGINS` 반사로 좁힌다(기본 wonjeong-dev.github.io).
 *   ③ KRX 호출을 https로(env `KRX_SCHEME=http`로 되돌릴 수 있다 — 지원 여부 미실측).
 *   ④ raw/diag 진단은 인증 통과 요청만. report 모드에서도 거부한다.
 *   ⑤ 크럼 응답 검증(ok·형식) · 실패 미캐시 · 야후 429는 Retry-After 전달 + 냉각.
 *   ⑥ 응답 캐시(메모리 + caches.default). 인증은 캐시 조회 **전**에 한다.
 *   ⑦ 패스스루: URL 파싱 · https 강제 · 호스트 정확 일치 · 리다이렉트 거부 · 자격증명 URL 거부.
 *   ⑧ /news의 hl은 en|ko만.
 *   무인증 경로는 OPTIONS preflight와 /health({ver}) 둘뿐이다.
 *
 * (v6.8) v6.7의 치명 결함 수정 — `const et`(earningsTrend)가 첫 사용처보다 아래에 선언돼
 *   TDZ ReferenceError가 났고, /summary의 **주식 경로 전체가 500**이었다.
 *   배포 시점(2026-08-26)부터 이벤트 채널이 한 건도 도착하지 않은 원인이다.
 *   ETF 경로는 이 코드에 닿지 않아 정상이었다 — 그래서 부분 증상으로만 보였다.
 *
 * (v6.7) 사후 판단 감사용 **이벤트 채널 4종**을 /summary 응답에 추가한다.
 *   surp : 실적 서프라이즈 (발표 EPS vs 컨센) — earningsHistory 모듈 **신규 요청**
 *   ugd  : 애널리스트 등급 변경 (90일 상향/하향 건수 + 최신 3건)
 *   rt   : 의견 분포 (기존) — 이제 4개월치 전부
 *   rev  : 컨센 EPS 추정 개정 (최근 7·30·90일 상·하향 건수)
 *   est  : 컨센 **추정 수준** (EPS·매출, 다음분기/내년) — 가이던스 해석의 대리변수
 *   capex: 분기 CapEx 4개 + 잉여현금흐름 — ★ 부호를 고정하지 않는 '양향성' 채널
 *  ★ 왜 서프라이즈만으로 부족한가: EPS를 beat하고도 가이던스 때문에 급락하는 일이 흔하고,
 *    CapEx 급증은 성장 투자로도 마진 훼손으로도 읽힌다. 부호를 못 박으면 조용히 틀린다.
 *  ★ ugd·rt·rev는 **v3부터 이미 받아오면서 최신 값 하나만 쓰고 버리던 것**이다.
 *    실제로 새로 요청하는 모듈은 earningsHistory 하나뿐이다(§22-⑮).
 *  ★ 앱 v4.35와 짝. 워커가 구버전이면 이 필드들이 undefined가 되고 앱은 판단 감사에서
 *    해당 채널을 '관측 없음'으로 둔다 — 조용히 틀리지 않는다.
 *
 * 기능 2가지:
 *  1) 시세 중계:            /?url={대상URL}          — 야후·네이버 CORS 우회 패스스루
 *  2) 애널리스트 자동 조회: /summary?sym={심볼}
 *     야후 quoteSummary(financialData + upgradeDowngradeHistory)를 축약해 반환:
 *     { n: 애널리스트 수, tgt: 평균목표가, rec: 의견평균, lg: 최근 애널리스트 액션 epoch초 }
 *     야후가 요구하는 쿠키+크럼 인증을 워커가 서버 측에서 대행합니다.
 *     (애널리스트 수 numberOfAnalystOpinions, 평균목표가 targetMeanPrice 등 반환)
 *     (v6.5) 재무제표통화→시세통화 환율(fx)을 **이 응답 안에서 확정해** 함께 보낸다.
 *  3) 환율 단독 조회:       /fx?from=EUR&to=USD      — 교차쌍→역쌍→USD삼각 3단 폴백
 *
 * 배포/업데이트: dash.cloudflare.com → Workers → qa-proxy → Edit code →
 *  기존 코드 전체를 이 파일로 교체 → Deploy. 주소·대시보드 설정은 그대로 유지됩니다.
 */
const ALLOW = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'polling.finance.naver.com', 'news.google.com', 'feeds.finance.yahoo.com'];
/* (v6) KRX Open API — ETF 전종목 일별매매정보.
 * 인증키는 소스에 두지 않는다. Cloudflare 대시보드에서
 *   Workers > qa-proxy > Settings > Variables and Secrets > Add
 *   Type: Secret · Name: KRX_AUTH_KEY · Value: (발급받은 키)
 * 로 넣으면 env.KRX_AUTH_KEY로 들어온다. 소스에는 키 문자열이 존재하지 않으므로
 * 저장소가 공개돼도 노출되지 않는다.
 * ※ KRX는 인증키 발급과 **별도로** 서비스별 이용신청이 필요하다. 안 하면 401이 온다.
 *    openapi.krx.co.kr > 서비스 이용 > 증권상품 > ETF 일별매매정보 신청 */
/* (v6.9) KRX 호출을 https로. v6.8까지 http였다 — AUTH_KEY 헤더가 **평문으로** 망을 건넜다.
 * 단 data-dbg.krx.co.kr의 https 지원을 아직 실측하지 못했다. 배포 후 /krxshrs가 깨지면
 * env `KRX_SCHEME=http`로 코드 수정 없이 되돌릴 수 있게 한다(그 외 값은 https로 본다).
 * URL은 요청마다 env에서 만든다 — 상수로 굳히면 되돌릴 방법이 재배포뿐이다. */
const KRX_HOST = 'data-dbg.krx.co.kr';
function krxBase(env) {
  return ((env && String(env.KRX_SCHEME || '').trim().toLowerCase()) === 'http' ? 'http' : 'https')
    + '://' + KRX_HOST;
}
const KRX_ETF_PATH = '/svc/apis/etp/etf_bydd_trd';
/* (v6.6) 주식 일별매매정보 — 상장주식수(LIST_SHRS) 관측용.
 * ETF와 동일 규약(AUTH_KEY 헤더 · basDd 파라미터 · OutBlock_1 배열)이고
 * 서비스 이용신청만 따로 해야 한다: openapi.krx.co.kr > 서비스 이용 > 주식 >
 *   유가증권 일별매매정보 · 코스닥 일별매매정보 (둘 다 신청)
 *
 * ★ 이 경로가 돌려주는 것은 '무슨 일이 있었는가'가 아니라 '상장주식수가 몇 주인가'다.
 *   상장주식수가 늘어나는 원인은 무상증자·유상증자·CB전환·스톡옵션 행사 등 여러 가지이고,
 *   그중 **주주의 보유 수량을 바꾸는 것은 무상 계열뿐**이다. 원인 판정은 워커가 하지 않는다 —
 *   앱이 같은 날 주가와 대조해서 가른다(§주식수 변동 규약). 여기서 추측하면 조용히 틀린다. */
const KRX_STK_PATHS = [                      /* (v6.9) 경로만 — 스킴·호스트는 krxBase(env) */
  ['KOSPI',  '/svc/apis/sto/stk_bydd_trd'],
  ['KOSDAQ', '/svc/apis/sto/ksq_bydd_trd']
];
/* (v6.3) 첫 거래일 역탐색 최대 일수. 연휴 최장(설·추석 + 주말 ≈ 5영업일 공백)에
 * 실측된 게시 지연 2일을 더하고 여유를 둔 값. 주말은 요청 없이 건너뛰므로
 * 실제 KRX 호출은 이보다 적다. 평상시 관측 2~3회. */
const KRX_LOOKBACK = 12;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
/* (v7.1) ★ 워커를 바꿀 때마다 올린다. v7.0에서 /dart를 더하고도 VER을 그대로 둬서,
 * /health가 'ver 7.0'을 돌려줘도 **그 7.0이 어느 7.0인지 알 수 없었다** — 배포됐는지
 * 확인할 방법이 없는 상태였다. 관측 장치가 두 상태를 구분하지 못하면 관측이 아니다(§22-㉒). */
const VER = '7.4';

/* ============ (v6.9) CORS — `*`를 버리고 허용 Origin만 반사한다 ============
 * v6.8은 `Allow-Origin: *` + `Allow-Headers: *`였다. 인증이 없던 시절엔 어차피 공개라
 * 의미가 없었지만, 이제 Authorization을 받으므로 **어느 사이트의 스크립트가 우리 워커를
 * 부를 수 있는가**를 좁힌다. 목록은 env `ALLOWED_ORIGINS`(쉼표) — 없으면 앱이 실제로
 * 올라가 있는 GitHub Pages 한 곳. 목록에 없으면 헤더를 **생략**한다('null'을 적지 않는다).
 * 응답이 Origin에 따라 달라지므로 `Vary: Origin`을 늘 붙인다(중간 캐시 오염 방지).
 * ※ CORS는 브라우저용 장치다 — curl은 막지 못한다. 실제 차단은 아래 토큰 검증이 한다. */
const DEFAULT_ORIGINS = 'https://wonjeong-dev.github.io';
function allowedOrigin(request, env) {
  const o = request.headers.get('Origin');
  if (!o) return null;
  const list = String((env && env.ALLOWED_ORIGINS) || DEFAULT_ORIGINS)
    .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return list.includes(o) ? o : null;
}
/* 응답에 CORS·관측 헤더를 입힌다. 내부 표식(X-QA-NoCache)과 캐시용 Cache-Control은
 * 여기서 걷어낸다 — v6.8 응답에는 Cache-Control이 없었고, 브라우저 캐시 동작을 바꾸지 않는다. */
function finalize(resp, request, env, extra) {
  const h = new Headers(resp.headers);
  h.delete('X-QA-NoCache');
  h.delete('Cache-Control');
  const ao = allowedOrigin(request, env);
  if (ao) h.set('Access-Control-Allow-Origin', ao);
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  /* 앱이 JS에서 읽어야 하는 헤더. Expose하지 않으면 fetch()에서 null로 보인다. */
  h.set('Access-Control-Expose-Headers', 'X-QA-Auth, X-QA-Cache, Retry-After');
  if (extra) for (const k in extra) if (extra[k] != null) h.set(k, extra[k]);
  return new Response(resp.body, { status: resp.status, headers: h });
}

/* ============ (v6.9) 호출자 인증 — Firebase ID 토큰(RS256) ============
 * 조건은 firestore.rules의 isBoardUser()와 **같게** 맞춘다. 워커만 느슨하면 DB는 못 여는
 * 계정이 워커(=KRX 키·야후 크럼·무료 한도)는 쓸 수 있게 된다.
 *   iss = https://securetoken.google.com/<프로젝트>   aud = <프로젝트>
 *   exp > now(여유 60초) · iat ≤ now+60 · auth_time ≤ now+60 · sub 비어있지 않음
 *   email_verified == true · firebase.sign_in_provider == 'google.com'
 *   email(소문자) ∈ env ALLOWED_EMAILS
 * ★ 명단은 **env 필수**다. 코드 상수 기본값을 두지 않는다 —
 *   (a) 미설정이 '누군가의 기본 명단으로 조용히 열림'이 아니라 503으로 **드러나야** 하고
 *   (b) 명단 변경이 재배포가 아니라 설정 변경이어야 하며
 *   (c) 워커 소스에 개인 이메일을 남기지 않는다. 명단의 출처는 firestore.rules 하나다. */
const FB_PROJECT = 'quantitative-analysis-ed463';
const FB_ISS = 'https://securetoken.google.com/' + FB_PROJECT;
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SKEW = 60;                                   // 초 — CF와 구글 사이 시계 차 허용
/* 사유 코드별 안내. §22-㉓: 원인이 다르면 문구가 달라야 한다 — 하나로 뭉치면
 * 가장 흔했던 과거 원인을 영구히 지목한다. */
const AUTH_MSG = {
  no_token:         'Authorization: Bearer <Firebase ID 토큰> 헤더가 없습니다 — 앱이 v6.9 대응 버전인지, 로그인 상태인지 확인하세요',
  malformed:        '토큰 형식이 JWT(헤더.본문.서명)가 아닙니다',
  alg:              '서명 알고리즘이 RS256이 아닙니다 — Firebase ID 토큰이 아닙니다',
  kid_unknown:      '토큰의 kid가 구글 공개키 목록에 없습니다 — 다른 발급자의 토큰이거나 키 교체 직후입니다(재로그인)',
  jwks_fetch:       '구글 공개키를 받아오지 못했습니다 — 잠시 뒤 다시 시도하세요(토큰 문제 아님)',
  signature:        '서명 검증 실패 — 토큰이 변조됐거나 다른 프로젝트의 토큰입니다',
  expired:          '토큰이 만료됐습니다(1시간 수명) — 앱이 getIdToken()으로 갱신해야 합니다',
  iat_future:       '토큰 발급시각(iat)이 미래입니다 — 시계 오차 60초 초과',
  auth_time:        '로그인 시각(auth_time)이 없거나 미래입니다',
  iss:              '발급자(iss)가 이 Firebase 프로젝트가 아닙니다',
  aud:              '대상(aud)이 이 Firebase 프로젝트가 아닙니다',
  sub:              'sub(UID)가 비어 있습니다',
  email_unverified: 'email_verified가 true가 아닙니다',
  provider:         '구글 로그인(google.com)으로 발급된 토큰이 아닙니다',
  email_not_allowed:'이 계정은 허용 명단(ALLOWED_EMAILS)에 없습니다',
  allowlist_unset:  '워커에 ALLOWED_EMAILS 환경변수가 설정되지 않아 모든 요청을 거부합니다 — Cloudflare > Workers > qa-proxy > Settings > Variables and Secrets',
  verify_error:     '토큰 검증 중 내부 오류'
};

const b64uBytes = s => {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64uJson = s => JSON.parse(new TextDecoder().decode(b64uBytes(s)));

/* 공개키 캐시 — 모듈 변수. 구글 응답의 Cache-Control max-age를 수명으로 쓴다.
 * 모르는 kid가 오면 **한 번만** 강제 갱신한다(키 교체 직후 대응). 갱신은 최소 60초 간격 —
 * 위조 kid를 퍼부어 구글 호출을 폭주시키는 것을 막는다.
 * 받아오기에 실패해도 수명이 지난 키가 남아 있으면 그것으로 검증한다(구글 키는 교체 뒤에도
 * 한동안 병행 게시되므로 오래된 키로 서명된 유효 토큰이 거부되는 편이 더 나쁘다). */
let JWKS = null;             // {keys: Map kid->jwk, exp: ms, fetched: ms}
const JWK_CRYPTO = new Map(); // kid -> CryptoKey
let JWKS_INFLIGHT = null;
async function loadJwks(force) {
  const now = Date.now();
  if (!force && JWKS && now < JWKS.exp) return JWKS;
  if (force && JWKS && now - JWKS.fetched < 60e3) return JWKS;
  if (JWKS_INFLIGHT) return JWKS_INFLIGHT;
  JWKS_INFLIGHT = (async () => {
    try {
      const r = await fetch(JWK_URL, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('jwks http ' + r.status);
      const j = await r.json();
      const keys = new Map();
      for (const k of (j && Array.isArray(j.keys) ? j.keys : []))
        if (k && k.kid && k.kty === 'RSA' && k.n && k.e) keys.set(k.kid, k);
      if (!keys.size) throw new Error('jwks empty');
      const m = /max-age=(\d+)/i.exec(r.headers.get('Cache-Control') || '');
      const ttl = Math.min(Math.max(m ? +m[1] : 3600, 60), 86400);
      JWKS = { keys, exp: now + ttl * 1000, fetched: now };
      JWK_CRYPTO.clear();
      return JWKS;
    } catch (e) {
      if (JWKS) { JWKS.fetched = now; return JWKS; }   // 낡은 키로 버틴다(위 주석)
      throw e;
    } finally { JWKS_INFLIGHT = null; }
  })();
  return JWKS_INFLIGHT;
}
async function cryptoKeyFor(kid, jwk) {
  let ck = JWK_CRYPTO.get(kid);
  if (!ck) {
    ck = await crypto.subtle.importKey('jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    JWK_CRYPTO.set(kid, ck);
  }
  return ck;
}
function allowList(env) {
  const raw = env && env.ALLOWED_EMAILS;
  if (!raw || !String(raw).trim()) return null;
  return new Set(String(raw).split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}
/* 반환: {ok:true, email, sub} | {ok:false, reason, status(401|503)} */
async function verifyAuth(request, env) {
  const fail = (reason, status) => ({ ok: false, reason, status: status || 401 });
  const allow = allowList(env);
  if (!allow || !allow.size) return fail('allowlist_unset', 503);
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m) return fail('no_token');
  const parts = m[1].split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return fail('malformed');
  let hdr, pl, sig;
  try { hdr = b64uJson(parts[0]); pl = b64uJson(parts[1]); sig = b64uBytes(parts[2]); }
  catch (e) { return fail('malformed'); }
  if (!hdr || hdr.alg !== 'RS256') return fail('alg');
  if (!hdr.kid || typeof hdr.kid !== 'string') return fail('kid_unknown');
  try {
    let ks;
    try { ks = await loadJwks(false); } catch (e) { return fail('jwks_fetch', 503); }
    let jwk = ks.keys.get(hdr.kid);
    if (!jwk) {
      try { ks = await loadJwks(true); } catch (e) { return fail('jwks_fetch', 503); }
      jwk = ks.keys.get(hdr.kid);
    }
    if (!jwk) return fail('kid_unknown');
    const key = await cryptoKeyFor(hdr.kid, jwk);
    const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
    if (!good) return fail('signature');
  } catch (e) { return fail('verify_error'); }
  /* 서명이 맞은 뒤에만 클레임을 믿는다 */
  const now = Math.floor(Date.now() / 1000);
  if (!pl || typeof pl !== 'object') return fail('malformed');
  if (pl.iss !== FB_ISS) return fail('iss');
  if (pl.aud !== FB_PROJECT) return fail('aud');
  if (!(typeof pl.exp === 'number' && pl.exp + SKEW > now)) return fail('expired');
  if (!(typeof pl.iat === 'number' && pl.iat <= now + SKEW)) return fail('iat_future');
  /* auth_time ≤ iat ≤ now+60 이 정상 관계이므로 같은 여유를 준다 — 여유 0이면 로그인 직후
   * 워커 시계가 1초만 늦어도 방금 받은 토큰이 거부된다. */
  if (!(typeof pl.auth_time === 'number' && pl.auth_time <= now + SKEW)) return fail('auth_time');
  if (typeof pl.sub !== 'string' || !pl.sub) return fail('sub');
  if (pl.email_verified !== true) return fail('email_unverified');
  if (!(pl.firebase && pl.firebase.sign_in_provider === 'google.com')) return fail('provider');
  const email = typeof pl.email === 'string' ? pl.email.toLowerCase() : '';
  if (!email || !allow.has(email)) return fail('email_not_allowed');
  return { ok: true, email, sub: pl.sub };
}
function authMode(env) {
  /* 모르는 값은 enforce — 오타가 조용히 문을 여는 쪽으로 떨어지면 안 된다 */
  return (env && String(env.AUTH_MODE || '').trim().toLowerCase() === 'report') ? 'report' : 'enforce';
}
function authFailResponse(a) {
  const r = json({ error: 'auth', reason: a.reason, 안내: AUTH_MSG[a.reason] || a.reason }, a.status);
  if (a.status === 401) r.headers.set('WWW-Authenticate', 'Bearer error="invalid_token"');
  return r;
}

/* ============ (v6.9) 응답 캐시 — 메모리 + caches.default 2단 ============
 * 같은 값을 여러 기기·여러 탭이 짧은 간격으로 반복 요청한다(시세 폴링·/summary 일괄조회).
 * 상류(야후·KRX·구글)를 매번 두드리면 한도·429의 원인이 된다.
 * ★ 캐시 키에는 Authorization을 넣지 않는다 — 넣으면 토큰이 1시간마다 바뀌어 적중률이 0이다.
 *   대신 **인증을 캐시 조회보다 먼저** 한다. 캐시 적중이 인증을 건너뛰는 길이 되면 안 된다.
 * ★ 200만 저장한다. 오류·부분성공·상류 실패를 담은 200(X-QA-NoCache 표식)도 저장하지 않는다 —
 *   실패를 캐시하면 TTL 동안 실패가 '정답'처럼 반복된다.
 * ★ 메모리 단을 두는 이유: 워커가 *.workers.dev에서 돌 때 Cache API가 실제로 저장하는지
 *   미확인이다(공식 문서상 대시보드 미리보기에서는 무효). 메모리 단은 인스턴스 수명 동안만
 *   유효하지만 어디서든 동작한다. 응답의 X-QA-Cache(mem|edge|miss)로 배포 후 실측한다. */
const MEMC = new Map();          // key -> {body, ct, status, exp, size}
const MEMC_MAX_N = 300, MEMC_MAX_BYTES = 16e6, MEMC_MAX_ITEM = 2e6;
let MEMC_BYTES = 0;
function memGet(key) {
  const e = MEMC.get(key);
  if (!e) return null;
  if (Date.now() >= e.exp) { MEMC.delete(key); MEMC_BYTES -= e.size; return null; }
  return e;
}
function memPut(key, body, ct, ttl) {
  const size = body.length * 2;
  if (size > MEMC_MAX_ITEM) return;
  const old = MEMC.get(key);
  if (old) { MEMC.delete(key); MEMC_BYTES -= old.size; }
  MEMC.set(key, { body, ct, status: 200, exp: Date.now() + ttl * 1000, size });
  MEMC_BYTES += size;
  while ((MEMC.size > MEMC_MAX_N || MEMC_BYTES > MEMC_MAX_BYTES) && MEMC.size) {
    const k0 = MEMC.keys().next().value, e0 = MEMC.get(k0);   // Map은 삽입순 — 가장 오래된 것부터
    MEMC.delete(k0); MEMC_BYTES -= e0.size;
  }
}
const edgeCache = () => (typeof caches !== 'undefined' && caches && caches.default) ? caches.default : null;
function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ''); }
/* 경로별 TTL(초). 0이면 캐시하지 않는다. */
function cacheTtl(u) {
  const p = u.pathname, sp = u.searchParams;
  if (sp.get('raw') || sp.get('diag')) return 0;                 // 진단은 늘 실시간
  if (p === '/summary') return 3600;                             // 애널·재무 — 하루 몇 번 바뀔 뿐
  if (p === '/fx') return 600;
  if (p === '/news') return 600;
  if (p === '/krxshrs' || p === '/krxetf') {
    /* 지난 날짜를 콕 집은 요청은 결과가 바뀌지 않는다 → 6시간.
     * 날짜 미지정(역탐색)·오늘 날짜는 KRX 게시 지연(§v6.3 실측 1~2일)으로 결과가 바뀔 수 있다 → 1시간. */
    const d = (sp.get('d') || '').replace(/[^0-9]/g, '');
    return (d.length === 8 && d < kstToday()) ? 21600 : 3600;
  }
  if (p === '/' || p === '') {
    const t = sp.get('url') || '';
    /* 1분봉·네이버 실시간은 15초, 나머지 차트(일·월봉)는 30초. 시세가 몇십 초 늦는 것은
     * 앱의 실시간 판정(체결시각 비교, §22-⑫)이 이미 감당하는 범위다. */
    return (/[?&]interval=1m\b/.test(t) || /^https:\/\/polling\.finance\.naver\.com\//.test(t)) ? 15 : 30;
  }
  return 0;
}
/* 캐시 키 — 같은 워커 호스트 아래 합성 URL. 쿼리는 정렬해 순서만 다른 요청을 합친다.
 * /krxshrs의 codes는 집합이므로 정렬해 합친다. Authorization·Origin은 넣지 않는다. */
function cacheKey(u) {
  const sp = [...u.searchParams.entries()].map(([k, v]) => {
    if (u.pathname === '/krxshrs' && k === 'codes')
      v = v.split(',').map(s => s.trim()).filter(Boolean).sort().join(',');
    return [k, v];
  }).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return u.origin + '/__qa_cache/v' + VER + (u.pathname || '/') + '?'
    + sp.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

/* ============ (v6.9) 상류 429 · 냉각 ============
 * 야후가 429를 주면 Retry-After를 앱까지 전달하고, 그 시간 동안 이 인스턴스는 야후 인증
 * 경로(크럼·quoteSummary)를 **다시 두드리지 않는다**. v6.8은 /summary 일괄조회 중 429가 나면
 * 종목마다 쿠키·크럼 왕복을 새로 시도해 차단을 연장했다. */
class UpErr extends Error {
  constructor(msg, status, retryAfter) { super(msg); this.status = status; this.retryAfter = retryAfter; }
}
function retryAfterSec(r) {
  const v = r && r.headers && r.headers.get && r.headers.get('Retry-After');
  let s = NaN;
  if (v != null && v !== '') {
    s = /^\d+$/.test(String(v).trim()) ? +v : Math.ceil((Date.parse(v) - Date.now()) / 1000);
  }
  if (!isFinite(s) || s <= 0) s = 60;               // 명시가 없으면 60초
  return Math.min(s, 900);                          // 15분 상한 — 비정상 값으로 영구 봉쇄되지 않게
}
let YF_COOL_UNTIL = 0;                              // ms — 이 시각 전엔 야후 인증 경로를 부르지 않는다
function yfCool(sec) { YF_COOL_UNTIL = Math.max(YF_COOL_UNTIL, Date.now() + sec * 1000); }
function yfCoolLeft() { return Math.max(0, Math.ceil((YF_COOL_UNTIL - Date.now()) / 1000)); }

let CK = null; // {cookie, crumb, ts} — 워커 인스턴스 메모리에 1시간 캐시

/* ============ (v6.5) 환율 해석 — 서버에서 끝낸다 ============
 * v6.4까지 환율은 **앱이 따로** 받아 브라우저 localStorage에 두었다. 그런데 그 환율을
 * 쓰는 데이터(fund)는 Firestore에 3일 캐시된다. 저장 위치도 수명도 다른 두 값이
 * 짝을 이뤄야만 PSR이 나오는 구조였고, 그래서 다음 경우에 PSR이 조용히 비었다:
 *   · 기기를 바꾸면 fund는 Firestore에서 딸려오는데 환율은 그 기기에 없다
 *   · fund가 3일 이내로 신선하면 재조회가 스킵돼 환율 요청 자체가 실행되지 않는다
 *   · 환율 요청이 한 번 실패하면 다음 기회는 3일 뒤다
 * 값을 쓰는 데이터와 **같은 응답에 실어 보내면** 이 짝은 깨질 수 없다.
 *
 * 야후 FX 심볼 규약은 하나가 아니다:
 *   ① 교차쌍 EURUSD=X   ② 역쌍 USDEUR=X   ③ USD기준 단축 EUR=X (= USD 1 → EUR)
 * ①②가 없고 ③만 있는 통화가 있다(TWD가 대표적). 세 경로를 순서대로 시도하고
 * 어느 경로로 잡혔는지 fxSrc로 함께 돌려준다 — 값만 보면 실패 원인을 못 찾는다. */
const FXC = new Map();       // 'EURUSD' -> {v, ts, src}
const FX_TTL_MS = 3600e3;

async function yfPx(sym) {
  const r = await upstreamFetch('https://query1.finance.yahoo.com/v8/finance/chart/'
    + encodeURIComponent(sym) + '?range=5d&interval=1d',
    { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!r.ok) return null;
  let j; try { j = await r.json(); } catch (e) { return null; }
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  const v = m && m.regularMarketPrice;
  return (v != null && isFinite(v) && v > 0) ? +v : null;
}
// USD 1단위 = ? ccy  (야후 단축 심볼의 정의)
async function usdTo(ccy) {
  if (ccy === 'USD') return 1;
  const a = await yfPx(ccy + '=X');
  if (a != null) return a;
  return await yfPx('USD' + ccy + '=X');
}
/* from 1단위 = ? to. 못 구하면 null — 1로 가정하지 않는다(틀린 값보다 빈 값이 낫다). */
async function fxRate(from, to) {
  if (!from || !to) return null;
  if (from === to) return { v: 1, src: 'same' };
  const key = from + to, c = FXC.get(key);
  if (c && Date.now() - c.ts < FX_TTL_MS) return { v: c.v, src: c.src };
  let v = await yfPx(key + '=X'), src = 'pair';
  if (v == null) {
    const inv = await yfPx(to + from + '=X');
    if (inv != null && inv > 0) { v = 1 / inv; src = 'inv'; }
  }
  if (v == null) {                                   // USD 삼각환산
    const a = await usdTo(from), b = await usdTo(to);
    if (a != null && a > 0 && b != null && b > 0) { v = b / a; src = 'usd'; }
  }
  if (v == null || !isFinite(v) || v <= 0) return null;
  FXC.set(key, { v, ts: Date.now(), src });
  return { v, src };
}

/* (v6.6) 종목코드 추출.
 * ★ 실측 2026-08-03 (basDd 20260731) — 주식도 ETF와 같았다:
 *     ISU_CD는 6자리 단축코드("095570"·"060310")이고 ISU_SRT_CD는 존재하지 않는다.
 *   그래서 isu6를 1순위로 둔다. v6.6 초판은 srt를 먼저 시도했는데, 존재하지 않는 필드를
 *   2,763행마다 한 번씩 찾는 헛수고였다(무료 플랜 CPU 예산에서 공짜가 아니다).
 * 사다리를 지우지는 않는다 — KRX가 형식을 바꾸면 조용히 0건이 되는 대신 isin/srt로
 *   잡히고 codeSrc가 'isu6'가 아닌 값으로 나와 즉시 드러난다(§22-⑯). */
function krxCode(chunk) {
  let m = /"ISU_CD"\s*:\s*"?(\d{6})"/.exec(chunk);
  if (m) return { code: m[1], src: 'isu6' };
  m = /"ISU_SRT_CD"\s*:\s*"?(\d{6})/.exec(chunk);
  if (m) return { code: m[1], src: 'srt' };
  m = /"ISU_CD"\s*:\s*"?[A-Z]{2}\d(\d{6})/.exec(chunk);      // KR7 005930 003
  if (m) return { code: m[1], src: 'isin' };
  return null;
}
/* (v6.6) 상장주식수 자체 검증 — **같은 응답 안에 항등식이 있다.**
 *   실측 4종목 전부 MKTCAP === LIST_SHRS × TDD_CLSPRC (오차 0).
 * 이 관계가 깨지면 필드가 밀렸거나 LIST_SHRS의 뜻이 바뀐 것이다. 값 하나만 보면
 * '주식수가 변했다'와 구별할 수 없는데, 그 오판은 원장을 통째로 틀리게 만든다.
 * 공짜로 얻을 수 있는 교차검증을 버리지 않는다. */
function krxShrsOk(shrs, close, mcap) {
  if (!(shrs > 0)) return { ok: false, why: 'LIST_SHRS 없음' };
  if (!(close > 0) || !(mcap > 0)) return { ok: true, why: '검증 불가(종가·시총 없음)', unverified: true };   // 검증 불가 ≠ 실패 — (v7.0) 표시는 한다
  const dev = Math.abs(mcap / (close * shrs) - 1);
  return dev <= 0.005 ? { ok: true, why: null }
                      : { ok: false, why: 'MKTCAP 불일치 ' + (dev * 100).toFixed(3) + '%' };
}

/* (v6.9) 크럼 형식. v6.8은 `includes('<')`(HTML 오류 페이지)만 걸렀다 — 429일 때 야후는
 * 200이 아닌 상태로 "Too Many Requests" **평문**을 주는데, 상태를 보지 않았으므로 그 문장이
 * 크럼으로 1시간 캐시될 수 있었다. 이후 모든 /summary가 401→재시도→또 429의 고리를 돈다.
 * 실제 크럼은 영숫자에 `.`·`/`가 섞인 11자 안팎(예 'aB3dE.fG/hI')이다. 공백·따옴표·꺾쇠가
 * 들어갈 일이 없으므로 그 셋만 막아도 오류 문장은 전부 걸린다 — 문자셋을 좁게 잡되
 * 길이는 넉넉히(8~64) 둔다. 야후가 문자셋을 넓히면 'yahoo crumb 형식 이상'으로 드러난다. */
const CRUMB_RE = /^[A-Za-z0-9._\/-]{8,64}$/;
async function getCrumb(force) {
  if (!force && CK && Date.now() - CK.ts < 3600e3) return CK;
  /* 강제 갱신 = 기존 크럼이 거부됐다는 뜻이다. 갱신이 실패하면 그 크럼을 계속 쓰지 않는다. */
  if (force) CK = null;
  const cool = yfCoolLeft();
  if (cool > 0) throw new UpErr('yahoo 429 냉각 중 — ' + cool + '초 뒤 재시도', 429, cool);
  const r1 = await upstreamFetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  if (r1.status === 429) { const s = retryAfterSec(r1); yfCool(s); throw new UpErr('yahoo cookie 429', 429, s); }
  const cookie = (r1.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new UpErr('yahoo cookie fail', 502);
  const r2 = await upstreamFetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie }
  });
  if (r2.status === 429) { const s = retryAfterSec(r2); yfCool(s); throw new UpErr('yahoo crumb 429', 429, s); }
  if (!r2.ok) throw new UpErr('yahoo crumb http ' + r2.status, 502);
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.includes('<')) throw new UpErr('yahoo crumb fail', 502);
  if (!CRUMB_RE.test(crumb)) throw new UpErr('yahoo crumb 형식 이상', 502);
  CK = { cookie, crumb, ts: Date.now() };   // 모든 검사를 통과한 뒤에만 캐시한다
  return CK;
}

// v3: 재무품질·성장·실적일·의견분포까지 한 번에 (모듈 추가)
const MODS = [
  'financialData',
  'price', // quote currency and snapshot price for share-count reconciliation
  'summaryDetail',            /* (v6.4) PSR/PER/PBR·시세통화. 이게 없어서 가치지표가 전부 수동이었다 */
  'upgradeDowngradeHistory',
  'defaultKeyStatistics',
  'calendarEvents',
  'recommendationTrend',
  'earningsTrend',
  'earningsHistory',         /* (v6.7) 발표 EPS vs 컨센 — 사후 판단 감사의 '숫자' 근거 */
  'cashflowStatementHistoryQuarterly'   /* (v6.7) CapEx·현금흐름 — 테크 밸류에이션 논쟁의 축 */
].join('%2C');
/* (v6.2) ETF용 모듈. 위 주식용 모듈은 ETF에 존재하지 않아 야후가 404를 낸다 —
 * 재무제표도 실적발표일도 애널 의견도 없으니 당연하다.
 * ETF에서 의미 있는 것은 보수율·순자산·배당수익률·카테고리·운용사다. */
const MODS_ETF = [
  'fundProfile',
  'defaultKeyStatistics',
  'summaryDetail'
].join('%2C');
async function fetchSummary(sym, retried, mods) {
  /* (v6.9) 냉각 중이면 크럼이 살아 있어도 quoteSummary를 부르지 않는다 */
  const cool = yfCoolLeft();
  if (cool > 0) throw new UpErr('yahoo 429 냉각 중 — ' + cool + '초 뒤 재시도', 429, cool);
  const ck = await getCrumb(!!retried);
  const res = await upstreamFetch(
    'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(sym)
    + '?modules=' + (mods || MODS) + '&crumb=' + encodeURIComponent(ck.crumb),
    { headers: { 'User-Agent': UA, 'Cookie': ck.cookie } }
  );
  /* (v6.9) 429는 재시도하지 않고 냉각을 건다 — 재시도는 차단을 연장할 뿐이다 */
  if (res.status === 429) { yfCool(retryAfterSec(res)); return res; }
  if ((res.status === 401 || res.status === 403) && !retried) return fetchSummary(sym, true, mods);
  return res;
}

/* (v6.9) CORS 헤더는 finalize()가 요청 Origin에 맞춰 붙인다(여기서 `*`를 박지 않는다) */
function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
/* (v6.9) 캐시 금지 표식 — 200이지만 부분 실패를 담은 응답. finalize()가 떼어낸다. */
function noCache(r) { r.headers.set('X-QA-NoCache', '1'); return r; }


// Reconcile explicit economic shares with the same response's quote market cap.
// 1% tolerance covers snapshot rounding/timing; failure means unavailable, never guessed.
export function revenueBasis(fd,ks,sd,price,fx){
 const n=x=>x&&x.raw!=null&&Number.isFinite(+x.raw)?+x.raw:null;
 const revenue=n(fd.totalRevenue),cap=n(price.marketCap),px=n(price.regularMarketPrice);
 const out={schema:1,status:'missing-input',totalRevenue:revenue,marketCap:cap,price:px,
  fcur:fd.financialCurrency||null,qcur:price.currency||null,fx:fx??null,
  shares:null,shareSource:null,revPSQuote:null,psrQuote:null,shareGap:null,
  source:'Yahoo quoteSummary',priceAt:price.regularMarketTime||null,collectedAt:Date.now()};
 if(!out.fcur||!out.qcur||sd.currency!==out.qcur||!(revenue>0&&cap>0&&px>0&&fx>0))return out;
 const choices=[['impliedSharesOutstanding',n(ks.impliedSharesOutstanding)],['sharesOutstanding',n(ks.sharesOutstanding)]];
 const match=choices.find(([,shares])=>shares>0&&Math.abs(px*shares/cap-1)<=0.01);
 if(!match){out.status='share-mismatch';return out;}
 out.status='reconciled';out.shareSource=match[0];out.shares=match[1];out.shareGap=Math.abs(px*match[1]/cap-1);
 out.revPSQuote=revenue*fx/match[1];out.psrQuote=cap/(revenue*fx);
 if(!Number.isFinite(out.revPSQuote)||!Number.isFinite(out.psrQuote)){out.status='invalid-result';out.revPSQuote=null;out.psrQuote=null;}
 return out;
}

export default {
  /* (v6.9) 진입부 — 순서가 곧 보안 규칙이다:
   *   OPTIONS(무인증) → /health(무인증) → 인증 → raw/diag 관문 → 캐시 조회 → 라우팅 → 캐시 저장.
   * 캐시 조회를 인증보다 앞에 두면 캐시 적중이 인증 우회로가 된다. */
  async fetch(request, env, ctx) {
    env = env || {};
    if (request.method === 'OPTIONS') {
      /* preflight에는 토큰이 실리지 않는다(브라우저 규약) — 인증을 요구하면 앱이 영영 못 부른다 */
      return finalize(new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400'
      } }), request, env);
    }
    /* (v7.0 · v5.4 래퍼에서 이어받음) GET만 · 요청 URL 길이 상한 */
    if (request.method !== 'GET') return finalize(json({ error: 'method not allowed' }, 405), request, env);
    if (request.url.length > 4096) return finalize(json({ error: 'request too long' }, 414), request, env);
    const u = new URL(request.url);
    /* 버전 확인용. 비밀·키 등록 여부·명단 같은 정보는 싣지 않는다 — 무인증 경로다. */
    if (u.pathname === '/health') return finalize(json({ ver: VER }), request, env);

    const mode = authMode(env);
    let auth;
    try { auth = await verifyAuth(request, env); }
    catch (e) { auth = { ok: false, reason: 'verify_error', status: 401 }; }
    let authHdr = auth.ok ? 'ok' : ('fail:' + auth.reason);
    if (!auth.ok) {
      if (mode !== 'report') return finalize(authFailResponse(auth), request, env, { 'X-QA-Auth': authHdr });
      /* report 모드: 통과시키되 기록한다. 대시보드 Logs에서 사유별로 셀 수 있게 남긴다(토큰은 남기지 않는다). */
      try { console.warn('[qa-auth report] ' + auth.reason + ' ' + u.pathname); } catch (_) {}
    }
    /* (v7.0) 선택적 Cloudflare 레이트리밋 바인딩 — 인증 **뒤**, 사용자(sub) 단위. 없으면 IP. */
    if (env.RATE_LIMITER) {
      try {
        const lim = await env.RATE_LIMITER.limit({ key: (auth.ok && auth.sub) || request.headers.get('CF-Connecting-IP') || 'unknown' });
        if (!lim.success) { const r = json({ error: 'rate limited' }, 429); r.headers.set('Retry-After', '60');
          return finalize(r, request, env, { 'X-QA-Auth': authHdr }); }
      } catch (_) { /* 바인딩 장애는 차단 사유가 아니다 */ }
    }
    /* raw/diag는 KRX 원문·Secret 형태를 보여 주는 진단 경로다 — report 모드에서도 인증 필수 */
    if (!auth.ok && (u.searchParams.get('raw') || u.searchParams.get('diag'))) {
      const a = { ok: false, reason: auth.reason, status: auth.status === 503 ? 503 : 401 };
      const r = authFailResponse(a);
      const b = { error: 'auth', reason: auth.reason, 안내: 'raw/diag 진단은 인증된 요청만 허용됩니다 — ' + (AUTH_MSG[auth.reason] || auth.reason) };
      return finalize(new Response(JSON.stringify(b), { status: r.status, headers: r.headers }),
                      request, env, { 'X-QA-Auth': authHdr });
    }

    const ttl = request.method === 'GET' ? cacheTtl(u) : 0;
    const key = ttl > 0 ? cacheKey(u) : null;
    if (key) {
      const m = memGet(key);
      if (m) return finalize(new Response(m.body, { status: 200, headers: { 'Content-Type': m.ct } }),
                             request, env, { 'X-QA-Auth': authHdr, 'X-QA-Cache': 'mem' });
      const ec = edgeCache();
      if (ec) {
        try {
          const hit = await ec.match(new Request(key));
          if (hit && hit.status === 200) {
            const body = await hit.text(), ct = hit.headers.get('Content-Type') || 'application/json; charset=utf-8';
            memPut(key, body, ct, ttl);   // 남은 수명을 모르므로 ttl로 다시 잰다(최대 2배 노후 — 허용 범위)
            return finalize(new Response(body, { status: 200, headers: { 'Content-Type': ct } }),
                            request, env, { 'X-QA-Auth': authHdr, 'X-QA-Cache': 'edge' });
          }
        } catch (_) { /* 캐시 장애는 조회 실패가 아니다 — 상류로 간다 */ }
      }
    }

    const resp = await route(request, env, u);
    if (key && resp.status === 200 && !resp.headers.get('X-QA-NoCache')) {
      const body = await resp.text();
      const ct = resp.headers.get('Content-Type') || 'application/json; charset=utf-8';
      memPut(key, body, ct, ttl);
      const ec = edgeCache();
      if (ec) {
        const p = ec.put(new Request(key), new Response(body, { status: 200, headers: {
          'Content-Type': ct, 'Cache-Control': 'public, max-age=' + ttl } })).catch(() => {});
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p); else await p;
      }
      return finalize(new Response(body, { status: 200, headers: resp.headers }), request, env,
                      { 'X-QA-Auth': authHdr, 'X-QA-Cache': 'miss' });
    }
    return finalize(resp, request, env, { 'X-QA-Auth': authHdr, 'X-QA-Cache': key ? 'miss' : 'bypass' });
  }
};

/* (v6.9) v6.8의 fetch 본문 그대로 — 인증·캐시·CORS는 위 진입부가 맡는다. */
async function route(request, env, u) {
    try {
      // 2) 애널리스트 요약
      if (u.pathname === '/summary') {
        const sym = (u.searchParams.get('sym') || '').trim();
        if (!/^[A-Za-z0-9.^=\-]{1,15}$/.test(sym)) return json({ error: 'bad sym' }, 400);
        const isEtf = (u.searchParams.get('t') === 'etf');   // (v6.2)
        const res = await fetchSummary(sym, false, isEtf ? MODS_ETF : MODS);
        if (!res.ok) {
          const body = await res.text();
          const out = new Response(body, {
            status: res.status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
          /* (v6.9) 야후 429의 Retry-After를 앱까지 전달한다 */
          if (res.status === 429) out.headers.set('Retry-After', String(retryAfterSec(res)));
          return out;
        }
        // 대형주는 원본이 수백 KB라 필요한 값만 축약해 반환
        const raw = await res.json();
        const r0 = raw && raw.quoteSummary && raw.quoteSummary.result && raw.quoteSummary.result[0];
        if(!r0)return json({error:'summary unavailable'},502);
        if (isEtf) {
          /* (v6.2) ETF 축약. 야후는 ETF에 대해 fundProfile·summaryDetail을 준다.
           * 값이 없으면 null로 둔다 — 추측해서 채우지 않는다. */
          const fp = (r0 && r0.fundProfile) || {};
          const ks = (r0 && r0.defaultKeyStatistics) || {};
          const sd = (r0 && r0.summaryDetail) || {};
          const g2 = x => (x && x.raw != null && isFinite(x.raw)) ? x.raw : null;
          const fee = (fp.feesExpensesInvestment || {});
          return json({
            sym, kind: 'etf',
            exp:    g2(fee.annualReportExpenseRatio) != null ? g2(fee.annualReportExpenseRatio) * 100 : null, // 보수율 %
            assets: g2(ks.totalAssets) != null ? g2(ks.totalAssets) : g2(sd.totalAssets),                     // 순자산
            yld:    g2(sd.yield) != null ? g2(sd.yield) * 100 : (g2(ks.yield) != null ? g2(ks.yield) * 100 : null), // 배당수익률 %
            nav:    g2(sd.navPrice),
            cat:    fp.categoryName || null,
            family: fp.family || null,
            beta3y: g2(ks.beta3Year),
            inception: g2(ks.fundInceptionDate)
          });
        }
        const fd = (r0 && r0.financialData) || {};
        const ks = (r0 && r0.defaultKeyStatistics) || {};
        const sd = (r0 && r0.summaryDetail) || {};    // (v6.4)
        const g = x => (x && x.raw != null && isFinite(x.raw)) ? x.raw : null;
        const pct = x => (x && x.raw != null && isFinite(x.raw)) ? x.raw * 100 : null; // 비율→%

        // 최근 애널리스트 액션 일자
        let lg = null;
        const hist = r0 && r0.upgradeDowngradeHistory && r0.upgradeDowngradeHistory.history;
        if (Array.isArray(hist)) {
          for (const e of hist) {
            if (e && isFinite(e.epochGradeDate) && (lg == null || e.epochGradeDate > lg)) lg = e.epochGradeDate;
          }
        }
        // 다음 실적 발표일 (epoch초) — calendarEvents.earnings.earningsDate[0]
        let earn = null;
        const ev = r0 && r0.calendarEvents && r0.calendarEvents.earnings;
        const ed = ev && ev.earningsDate;
        if (Array.isArray(ed) && ed.length) {
          const cand = ed.map(x => x && x.raw).filter(x => isFinite(x));
          if (cand.length) earn = Math.min(...cand); // 가장 가까운 예정일
        }
        // 의견 분포 (최신 항목) — recommendationTrend.trend[0] {strongBuy,buy,hold,sell,strongSell}
        let rt = null;
        const tr = r0 && r0.recommendationTrend && r0.recommendationTrend.trend;
        if (Array.isArray(tr) && tr.length) {
          const t0 = tr[0];
          rt = { sb: t0.strongBuy|0, b: t0.buy|0, h: t0.hold|0, s: t0.sell|0, ss: t0.strongSell|0 };
        }

        /* ============ (v6.7) 사후 판단 감사용 이벤트 채널 ============
         * 목적: "이 등급이 매겨진 뒤 무슨 일이 있었나"를 **숫자로** 남긴다.
         * 뉴스 헤드라인이 아니라 이것들을 쓰는 이유는 감성 판정이 필요 없기 때문이다 —
         * 서프라이즈는 부호가 있고, 등급 변경은 방향이 있고, 개정 건수는 증감이 있다.
         * 사후 서사(주가가 빠졌으니 악재가 있었을 것)를 끼워 넣을 자리가 없다. */

        // ① 실적 서프라이즈 — earningsHistory.history[] 최근 4분기
        let surp = null;
        {
          const eh = r0 && r0.earningsHistory && r0.earningsHistory.history;
          if (Array.isArray(eh) && eh.length) {
            const rows = eh.map(e => {
              const d = g(e && e.quarter), act = g(e && e.epsActual), est = g(e && e.epsEstimate);
              // surprisePercent는 야후가 소수(0.05=5%)로 준다. 없으면 직접 계산한다.
              let p = g(e && e.surprisePercent);
              if (p != null) p = p * 100;
              else if (act != null && est != null && Math.abs(est) > 1e-9) p = (act - est) / Math.abs(est) * 100;
              return (d != null) ? { d, act, est, pct: (p != null && isFinite(p)) ? +p.toFixed(2) : null } : null;
            }).filter(Boolean).sort((a, b) => b.d - a.d);
            if (rows.length) surp = rows.slice(0, 4);
          }
        }

        // ② 애널리스트 등급 변경 — 90일 상향/하향 건수 + 최신 3건
        let ugd = null;
        if (Array.isArray(hist) && hist.length) {
          const now = Math.floor(Date.now() / 1000), cut = now - 90 * 86400;
          const norm = a => {
            const t = String(a || '').toLowerCase();
            if (t === 'up') return 'up';
            if (t === 'down') return 'down';
            if (t === 'init') return 'init';
            return 'main';                       // maintains / reiterates 등
          };
          const rows = hist.filter(e => e && isFinite(e.epochGradeDate))
                           .sort((a, b) => b.epochGradeDate - a.epochGradeDate);
          let up90 = 0, dn90 = 0, ini90 = 0;
          for (const e of rows) {
            if (e.epochGradeDate < cut) break;   // 정렬돼 있으므로 끊는다
            const a = norm(e.action);
            if (a === 'up') up90++; else if (a === 'down') dn90++; else if (a === 'init') ini90++;
          }
          ugd = {
            up90, dn90, ini90,
            last: rows.slice(0, 3).map(e => ({
              d: e.epochGradeDate, firm: String(e.firm || '').slice(0, 40),
              from: String(e.fromGrade || '').slice(0, 24), to: String(e.toGrade || '').slice(0, 24),
              act: norm(e.action)
            }))
          };
        }

        // ③ 의견 분포 추이 — trend[]는 0m·-1m·-2m·-3m 순. 이동을 봐야 '악화/개선'이 보인다
        let rtH = null;
        if (Array.isArray(tr) && tr.length) {
          rtH = tr.slice(0, 4).map(t => ({
            p: String(t.period || ''), sb: t.strongBuy|0, b: t.buy|0, h: t.hold|0, s: t.sell|0, ss: t.strongSell|0
          }));
        }

        /* (v6.8) ★ earningsTrend는 아래 세 곳(est · rev · 성장추정)이 공유한다.
         * v6.7은 이 선언이 **세 번째 사용처 뒤**에 있어, 첫 사용에서
         * `ReferenceError: Cannot access 'et' before initialization`(TDZ)이 났다.
         * 그 결과 /summary의 **주식 경로 전체가 500**을 냈다 — ETF 경로(t=etf)는
         * 이 코드에 닿지 않아 멀쩡했고, 그래서 증상이 '이벤트 채널 0'으로만 보였다.
         * `node --check`는 파싱만 하므로 TDZ를 구조적으로 잡지 못한다(§22-㉗).
         * 선언은 **모든 사용처보다 위**에 둔다. */
        const et = r0 && r0.earningsTrend && r0.earningsTrend.trend;

        /* ④-0 컨센 **추정 수준** — 가이던스 해석의 대리변수.
         * 개정 '건수'(④)는 몇 명이 손댔는지만 말하고 얼마나 움직였는지를 말하지 않는다.
         * 수준을 시계열로 남기면 "발표 뒤 내년 EPS 컨센이 얼마나 내려갔는가"를 잴 수 있고,
         * 그것이 곧 시장이 가이던스를 어떻게 받아들였는지다. 발표 자체보다 이쪽이 크게 움직인다. */
        let est = null;
        if (Array.isArray(et)) {
          const pk = p => et.find(x => x && x.period === p);
          const q1 = pk('+1q'), y1 = pk('+1y'), y0 = pk('0y');
          const lvl = (o, key) => {
            const b = o && o[key] && o[key].avg;
            return (b && b.raw != null && isFinite(b.raw)) ? b.raw : null;
          };
          est = {
            eq1: lvl(q1, 'earningsEstimate'), rq1: lvl(q1, 'revenueEstimate'),
            ey1: lvl(y1, 'earningsEstimate'), ry1: lvl(y1, 'revenueEstimate'),
            ey0: lvl(y0, 'earningsEstimate')
          };
          if (est.eq1 == null && est.ey1 == null && est.ey0 == null) est = null;
        }

        /* ④-1 CapEx · 잉여현금흐름 — ★ 부호를 고정하지 않는 채널.
         * CapEx 급증을 '악재'로 못 박으면 AI 인프라 투자 국면에서 통째로 틀리고,
         * '호재'로 못 박으면 과잉투자 국면에서 통째로 틀린다. 해석은 시장이 하고
         * 우리는 **사건이 있었다는 사실만** 기록한다. 앱이 양향성 채널로 다룬다. */
        let capex = null;
        {
          const cf = r0 && r0.cashflowStatementHistoryQuarterly &&
                     r0.cashflowStatementHistoryQuarterly.cashflowStatements;
          if (Array.isArray(cf) && cf.length) {
            const rows = cf.map(c => {
              const d = g(c && c.endDate), v = g(c && c.capitalExpenditures);
              return (d != null) ? { d, v } : null;
            }).filter(Boolean).sort((a, b) => b.d - a.d).slice(0, 5);
            if (rows.length) capex = { q: rows, fcf: g(fd.freeCashflow), ocf: g(fd.operatingCashflow) };
          }
          if (!capex && (g(fd.freeCashflow) != null || g(fd.operatingCashflow) != null))
            capex = { q: null, fcf: g(fd.freeCashflow), ocf: g(fd.operatingCashflow) };
        }

        // ④ 컨센 EPS 추정 개정 건수 — earningsTrend[].epsRevisions
        let rev = null;
        if (Array.isArray(et)) {
          const cand = et.find(x => x && x.epsRevisions &&
            (x.epsRevisions.upLast30days || x.epsRevisions.downLast30days ||
             x.epsRevisions.upLast7days  || x.epsRevisions.downLast90days));
          const er = cand && cand.epsRevisions;
          if (er) rev = {
            p: String(cand.period || ''),
            u7:  g(er.upLast7days), u30: g(er.upLast30days),
            d30: g(er.downLast30days), d90: g(er.downLast90days)
          };
        }

        // 선행/후행 EPS, 주당매출, 성장 추정 — earningsTrend / defaultKeyStatistics / financialData
        const epsTtm = g(ks.trailingEps);
        let epsFwd = g(ks.forwardEps);
        /* (v7.0) 선행 EPS 출처. 'ks'=상장 통화·상장 증권 단위, 'trend'=컨센 추정(재무제표 통화·원주). */
        let epsFwdSrc = (epsFwd != null) ? 'ks' : null;
        let epsGrowthEst = null;   // 애널 예상 연 EPS 성장률(%)
        let revGrowthEst = null;   // 애널 예상 연 매출 성장률(%)
        if (Array.isArray(et)) {
          // period: '+1y'(내년) 우선, 없으면 '0y'(올해)
          const pick = p => et.find(x => x && x.period === p);
          const y1 = pick('+1y') || pick('0y');
          if (y1) {
            if (epsFwd == null && y1.earningsEstimate && y1.earningsEstimate.avg && isFinite(y1.earningsEstimate.avg.raw)) {
              epsFwd = y1.earningsEstimate.avg.raw; epsFwdSrc = 'trend'; }
            if (y1.growth && isFinite(y1.growth.raw)) epsGrowthEst = y1.growth.raw * 100;
            if (y1.revenueEstimate && y1.revenueEstimate.growth && isFinite(y1.revenueEstimate.growth.raw))
              revGrowthEst = y1.revenueEstimate.growth.raw * 100;
          }
        }
        // 주당매출: financialData.revenuePerShare 우선
        const revPS = g(fd.revenuePerShare);

        /* (v6.5) 환율을 이 응답 안에서 확정한다. 앱은 이 값을 fund와 함께 Firestore에
         * 저장하므로, 어느 기기에서 열든 PSR 계산에 필요한 것이 모두 한 자리에 있다. */
        const _fcur = (typeof fd.financialCurrency === 'string' && fd.financialCurrency) || null;
        const _qcur = (typeof sd.currency === 'string' && sd.currency) || null;
        let fx = null, fxSrc = null;
        if (_fcur && _qcur) {
          const fr = await fxRate(_fcur.toUpperCase(), _qcur.toUpperCase());
          if (fr) { fx = fr.v; fxSrc = fr.src; }
        }

        const _out = json({
          sym,
          n: g(fd.numberOfAnalystOpinions),
          tgt: g(fd.targetMeanPrice),
          tgtHi: g(fd.targetHighPrice),
          tgtLo: g(fd.targetLowPrice),
          rec: g(fd.recommendationMean),
          lg,
          // 재무 품질 (financialData 대부분 비율 → %로 변환)
          roe: pct(fd.returnOnEquity),
          margin: pct(fd.operatingMargins),
          de: g(fd.debtToEquity),
          deRatio: g(fd.debtToEquity)!=null ? g(fd.debtToEquity)/100 : null,
          revG: pct(fd.revenueGrowth),
          epsG: pct(fd.earningsGrowth),
          // 밸류에이션 입력 (v4 적정가 엔진용)
          epsTtm, epsFwd, revPS,
          revenueBasis: revenueBasis(fd,ks,sd,(r0&&r0.price)||{},fx),
          workerBuild: '5.5.0',
          epsFwdSrc,            // (v7.0) 끝에 추가 — 구버전 앱은 무시한다
          epsGrowthEst, revGrowthEst,
          earn,
          rt,
          /* (v6.7) 사후 판단 감사용 이벤트 채널. 앱 v4.35가 읽는다.
           * 구버전 앱은 이 키를 참조하지 않으므로 무시된다 — 어느 쪽도 조용히 틀리지 않는다. */
          surp, ugd, rtH, rev, est, capex,
          /* (v6.4) ★ 통화 태그를 반드시 함께 보낸다.
           * 야후 financialData/summaryDetail의 '금액' 계열은 **재무제표 통화**로 온다
           * (ASML=EUR · TSM=TWD). 시세는 상장 통화(USD)다. 숫자만 보내면 받는 쪽에서
           * 단위를 알 수 없어 조용히 틀린다 — revPS·psrY·pbrY가 정확히 그 경우다.
           * fcur=재무제표 통화 · qcur=시세 통화. 같으면 환산 불필요. */
          fcur: _fcur,
          qcur: _qcur,
          /* (v6.5) fcur 1단위 = qcur fx. fcur===qcur이면 1(src 'same').
           * 못 구하면 null — 앱이 그 종목 PSR을 비워 둔다. fxSrc: pair|inv|usd|same */
          fx, fxSrc,
          // 야후가 계산해 둔 멀티플 (스냅샷 · fcur 기준). 앱이 현재가로 재계산할 때의 교차검증용.
          psrY: g(sd.priceToSalesTrailing12Months),
          pbrY: g(ks.priceToBook),
          perT: g(sd.trailingPE),
          perF: g(sd.forwardPE),
          mcap: g(sd.marketCap)
        });
        /* (v6.9) 통화쌍이 있는데 환율을 못 구한 응답은 1시간 캐시하지 않는다 —
         * 환율 조회의 일시 실패가 1시간 동안 'PSR 없음'으로 굳는 것을 막는다(§22-⑮). */
        return (_fcur && _qcur && fx == null) ? noCache(_out) : _out;
      }
      /* (v6.5) 환율 단독 조회 — /fx?from=EUR&to=USD
       * 앱이 캐시에만 있고 재조회가 스킵된 종목의 환율을 뒤늦게 메울 때 쓴다.
       * /summary와 같은 사다리를 타므로 두 경로의 결과가 갈리지 않는다. */
      if (u.pathname === '/fx') {
        const cc = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
        const from = cc(u.searchParams.get('from')), to = cc(u.searchParams.get('to'));
        if (from.length !== 3 || to.length !== 3) return json({ error: 'bad ccy', from, to }, 400);
        const fr = await fxRate(from, to);
        return fr ? json({ from, to, v: fr.v, src: fr.src })
                  : json({ error: 'fx not found', from, to,
                           안내: '야후에 ' + from + to + '=X · ' + to + from + '=X · USD 삼각환산이 모두 없습니다' }, 502);
      }
      /* (v6.1) Secret 진단 — /krxetf?diag=1
       * 401의 원인 중 '복사하다 공백·줄바꿈이 섞임'만 코드로 가릴 수 있다.
       * 워커 URL은 공개이므로 키 문자열은 앞자리도 돌려주지 않는다. 길이와 형태만. */
      if (u.pathname === '/krxetf' && u.searchParams.get('diag')) {
        const k = (env && env.KRX_AUTH_KEY) || '';
        return json({
          secret등록: !!k,
          길이: k.length,
          앞뒤공백: k !== k.trim(),
          줄바꿈포함: /[\r\n]/.test(k),
          공백포함: /\s/.test(k),
          영숫자만: /^[A-Za-z0-9]+$/.test(k),
          안내: '길이 32 · 앞뒤공백 false · 영숫자만 true 이면 Secret은 정상입니다. '
              + '그런데도 401이면 서비스별 이용신청(openapi.krx.co.kr > 서비스 이용 > '
              + '증권상품 > ETF 일별매매정보)이 안 된 것입니다.'
        });
      }
      /* (v6.6) KRX 상장주식수 관측 — /krxshrs?codes=005930,007680&d=YYYYMMDD
       * 반환: { basDd, items:[{code,name,mkt,shrs,close}] }
       * 요청한 코드만 골라 돌려준다. 전종목(약 2,700행 × 2시장)을 그대로 흘리면
       * 앱이 쓰지도 않을 payload가 수 MB가 된다.
       * CPU: 무료 플랜 한도 때문에 JSON.parse를 쓰지 않는다. 행은 '{'로 갈라지므로
       * 청크마다 코드 1회 매칭 → 관심 코드일 때만 나머지 필드를 뽑는다(§v6.3과 같은 방침). */
      /* (v7.1) ★ DART 1차 출처 — **탐침만. 파서는 아직 쓰지 않는다.**
       *
       * 왜 필요한가(실측): 국내 11종목은 야후가 후행 재무를 주지 않는다 — 후행 EPS 0/11 ·
       * PBR 0/11(2026-10-28). 그래서 SK하이닉스·삼성전자는 장부가 축이 막혀 무성장 가치가
       * 아예 없고, 전체 60종목 중 PBR 결측이 12건이다. KRX Open API의 일별매매정보는
       * 15필드 전부 시세·시총·상장주식수라 PER·PBR·EPS·BPS가 없다(2026-10-27 실측).
       * 남은 1차 출처는 DART다.
       *
       * 왜 파서가 아니라 탐침인가: DART 개발가이드가 robots로 막혀 있어 **응답 필드명을
       * 문서로 확인할 수 없었다.** 추측으로 파서를 쓰면 조용히 틀린 값을 만든다 — KRX 때와
       * 같은 절차를 쓴다. 먼저 탐침으로 **실제 응답의 필드 목록을 눈으로 확인**하고,
       * 그 다음에 좁은 엔드포인트와 파서를 쓴다. 그때 이 경로는 지운다.
       *
       * 안전: 호스트와 경로 접두사를 고정하고(opendart.fss.or.kr/api/), 인증키는 **서버에서만**
       * 붙인다 — 호출자가 crtfc_key를 넣어도 무시하고 덮어쓴다. 응답은 upstreamFetch의
       * 크기·시간 상한을 그대로 받는다. 이 경로도 다른 경로와 같이 인증·레이트리밋 뒤에 있다. */
      if (u.pathname === '/dart') {
        const key = env && env.DART_API_KEY;
        if (!key) return json({ error: 'DART_API_KEY secret이 설정되지 않았습니다',
          받는법: 'opendart.fss.or.kr 에서 인증키를 발급한 뒤 워커 시크릿 DART_API_KEY로 등록하세요' }, 500);
        const api = String(u.searchParams.get('api') || '').replace(/[^A-Za-z0-9._-]/g, '');
        const pick = String(u.searchParams.get('pick') || '').split(',')
          .map(x => x.replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean).slice(0, 8);
        if (!api) return json({ error: "api 파라미터가 필요합니다 (예: api=fnlttSinglAcnt.json)" }, 400);
        const qs = new URLSearchParams();
        for (const [k2, v2] of u.searchParams) {
          if (k2 === 'api' || k2 === 'crtfc_key' || k2 === 'pick' || k2 === 'follow') continue;  // 키는 호출자가 못 정한다
          if (String(v2).length > 200) return json({ error: 'parameter too long: ' + k2 }, 400);
          qs.set(k2, v2);
        }
        qs.set('crtfc_key', String(key).trim());
        const url = 'https://opendart.fss.or.kr/api/' + api + '?' + qs.toString();
        /* (v7.2) ★ 첫 실측에서 **경로와 무관하게 전부 302 · 본문 0바이트**였다 — 일부러 넣은
         * 가짜 경로까지 같았다. 즉 요청이 API 로직에 닿지 못한다. 워커 fetch는 기본적으로
         * User-Agent를 보내지 않는데, UA 없는 요청을 돌려보내는 서버가 흔하다.
         * 그래서 ① 평범한 UA·Accept를 붙이고 ② 어디로 돌려보내는지(Location)를 그대로 적는다.
         * 추측하지 않기 위해 **헤더를 보여주는 것**이 먼저다 — 지금 탐침은 그걸 못 했다. */
        const rr = await upstreamFetch(url, { headers: {
          'User-Agent': 'QA-Stock-Board/1.0 (+worker)',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'ko,en;q=0.8'
        }, redirect: (u.searchParams.get('follow') === '1') ? 'follow' : 'manual' });
        const txt = await rr.text();
        const hdr = {};
        for (const k3 of ['location', 'content-type', 'content-length', 'set-cookie', 'server']) {
          const v3 = rr.headers.get(k3); if (v3) hdr[k3] = String(v3).slice(0, 300);
        }
        /* 탐침이므로 **구조만** 돌려준다. 전 종목 재무를 그대로 흘리지 않는다. */
        let j = null, perr = null;
        try { j = JSON.parse(txt); } catch (e) { perr = String(e); }
        const list = (j && Array.isArray(j.list)) ? j.list : null;
        return json({ api, status: rr.status, 응답헤더: hdr, 본문바이트: txt.length, parse오류: perr,
          status코드: j ? (j.status || null) : null, 메시지: j ? (j.message || null) : null,
          최상위키: j ? Object.keys(j) : null,
          행수: list ? list.length : null,
          필드수: (list && list.length) ? Object.keys(list[0]).length : null,
          필드목록: (list && list.length) ? Object.keys(list[0]) : null,
          첫행: (list && list.length) ? list[0] : null,
          둘째행: (list && list.length > 1) ? list[1] : null,
          /* (v7.4) pick=a,b,c 를 주면 **그 필드만** 전 행에 대해 돌려준다.
           * 주요계정은 30행인데 첫 두 행만 보여서는 '어떤 계정이 있는가'를 알 수 없다 —
           * 자본총계·당기순이익이 어느 이름으로 오는지, 지배주주지분이 따로 있는지가
           * 파서의 전제다. 그렇다고 전 행을 통째로 흘리지 않는다: 필드 8개 · 행 200개 상한. */
          행목록: (list && pick.length)
            ? list.slice(0, 200).map(r2 => { const o = {}; for (const k4 of pick) if (r2[k4] != null) o[k4] = r2[k4]; return o; })
            : undefined,
          본문앞부분: list ? undefined : txt.slice(0, 300) });
      }
      if (u.pathname === '/krxshrs') {
        const key = env && env.KRX_AUTH_KEY;
        if (!key) return json({ error: 'KRX_AUTH_KEY secret이 설정되지 않았습니다' }, 500);
        const raw = !!u.searchParams.get('raw');
        const want = new Set(String(u.searchParams.get('codes') || '')
          .split(',').map(s => s.replace(/[^0-9]/g, '')).filter(s => s.length === 6));
        if (!raw && !want.size) return json({ error: 'codes 파라미터가 필요합니다 (쉼표로 구분된 6자리 코드)' }, 400);
        if (want.size > 120) return json({ error: 'codes가 너무 많습니다 (최대 120)' }, 400);

        const asked = (u.searchParams.get('d') || '').replace(/[^0-9]/g, '');
        const TRADED = /"ACC_TRDVOL"\s*:\s*"?[1-9]/;
        const grab = async (dd) => {
          const out = [], srcSeen = new Set(), diag = [], mkts = [], badShrs = [];
          let anyTraded = false, basDd = null, scanned = 0;
          for (const [mkt, path] of KRX_STK_PATHS) {
            const url = krxBase(env) + path;             // (v6.9) 스킴은 env KRX_SCHEME
            const rr = await upstreamFetch(url + '?basDd=' + dd, { headers: { 'AUTH_KEY': String(key).trim() } });
            const txt = await rr.text();
            /* ★ (v6.6) 시장 하나가 막혔다고 다른 시장의 결과를 버리지 않는다.
             * 유가증권·코스닥은 **이용신청이 서비스별로 따로**라 한쪽만 승인된 상태가 정상적으로
             * 존재한다. 초판은 첫 실패에서 즉시 return해 이미 받아 온 유가증권 데이터를
             * 통째로 날렸다 — 실측 한 번에 확인할 수 있었던 필드 목록을 못 보게 만들었다.
             * KRX가 200에 에러 body를 실어 보내는 경우도 함께 막는다(HTTP 코드만 믿지 않는다). */
            const bodyErr = /"respCode"\s*:\s*"?(?!00)[0-9]{3}/.test(txt.slice(0, 200));
            if (!rr.ok || bodyErr) {
              mkts.push({ 시장: mkt, ok: false, status: rr.ok ? 200 : rr.status,
                          body: txt.slice(0, 200), url });
              continue;
            }
            if (TRADED.test(txt)) anyTraded = true;
            /* (v6.6) 실측 모드 — 필드명을 **눈으로 확인**하기 위한 경로.
             * ETF는 §v6.3에서 이 과정을 거쳐 필드 19개·거래일 판정·게시 지연을 확정했다.
             * 주식은 아직 안 했다. 키 목록 + 첫 두 행만 돌려준다(전종목은 흘리지 않는다).
             * 이때만 JSON.parse를 쓴다 — 진단은 한 번 도는 경로이고 정확도가 우선이다. */
            if (raw) {
              let j = null, perr = null;
              try { j = JSON.parse(txt); } catch (e) { perr = String(e); }
              const rows = (j && j.OutBlock_1) || [];
              diag.push({
                시장: mkt, url, 행수: rows.length, parse오류: perr,
                필드수: rows.length ? Object.keys(rows[0]).length : 0,
                필드목록: rows.length ? Object.keys(rows[0]) : [],
                첫행: rows[0] || null, 둘째행: rows[1] || null,
                거래일: TRADED.test(txt),
                body앞부분: rows.length ? undefined : txt.slice(0, 300),
                비영업일: rows.length ? undefined : '행 0건 — 주식은 ETF와 달리 빈 배열을 준다(실측 2026-08-01 토)'
              });
              mkts.push({ 시장: mkt, ok: true, 행수: rows.length });
              continue;
            }
            /* (v6.6) 실측 2026-08-03: 유가증권 943행 + 코스닥 1,820행 = 2,763행(약 770KB).
             * ★ 초판은 여기서 '보유 종목만 indexOf로 직접 찾는' 최적화를 넣었다가 되돌렸다.
             *   측정 결과 그게 더 느렸다 — indexOf는 매번 770KB를 처음부터 훑으므로
             *   40종목이면 30MB를 스캔한다. 교차점은 약 25종목이었다:
             *     종목수   3      10     20     40     80
             *     전수스캔 0.87   0.84   0.86   0.88   0.87 ms   ← 종목 수와 무관, 평탄
             *     직행탐색 0.01   0.14   0.56   2.16   9.29 ms
             *   전수 스캔은 2시장 합쳐 1.7ms로 무료 플랜 10ms 예산 안에 넉넉하다.
             *   임계값 상수를 만들어 분기시킬 이득(0.9ms)이 그 상수가 썩을 위험보다 작다(§20).
             *   같은 최적화를 다시 시도하지 않도록 숫자를 남긴다. */
            const chunks = txt.split('{');
            scanned += chunks.length;
            let hit = 0;
            for (const chunk of chunks) {
              const kc = krxCode(chunk);
              if (!kc) continue;
              srcSeen.add(kc.src);
              if (!want.has(kc.code)) continue;
              const pick = (f) => { const x = new RegExp('"' + f + '"\\s*:\\s*"?([^",}]*)').exec(chunk); return x ? x[1].trim() : ''; };
              const num = (f) => { const s = pick(f).replace(/,/g, ''); const n = +s; return (s !== '' && isFinite(n)) ? n : null; };
              if (!basDd) { const b = pick('BAS_DD'); if (b) basDd = b; }
              const shrs = num('LIST_SHRS'), close = num('TDD_CLSPRC'), mcap = num('MKTCAP');
              const v = krxShrsOk(shrs, close, mcap);
              out.push({ code: kc.code, name: pick('ISU_NM') || null, mkt,
                         shrs, close, mcap, ok: v.ok, warn: v.why });
              if (!v.ok) badShrs.push(kc.code + ': ' + v.why);
              hit++;
            }
            mkts.push({ 시장: mkt, ok: true, 행: chunks.length - 1, 적중: hit });
          }
          return { rows: out, traded: anyTraded, basDd, diag, mkts, badShrs,
                   codeSrc: [...srcSeen], scanned,
                   allFail: mkts.length > 0 && mkts.every(m => !m.ok) };
        };

        let d = asked, res = null; const tried = [];
        /* (v6.6) 실측 모드는 거래일 역탐색을 하지 않는다 — 진단의 목적은 '그 날짜가 무엇을
         * 돌려주는가'를 있는 그대로 보는 것이고, 비영업일 응답 자체가 확인 대상이다. */
        if (d.length === 8 || raw) {
          if (!d) d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
          res = await grab(d); tried.push(d);
        } else {
          const t = new Date(Date.now() + 9 * 3600e3);              // KST 달력일
          for (let i = 0; i < KRX_LOOKBACK; i++) {
            const w = t.getUTCDay();
            if (w !== 0 && w !== 6) {
              const dd = t.toISOString().slice(0, 10).replace(/-/g, '');
              const rr = await grab(dd); tried.push(dd);
              if (rr.allFail) { d = dd; res = rr; break; }   // 전 시장 실패는 즉시 보고 (탐색으로 덮지 않는다)
              if (rr.traded) { d = dd; res = rr; break; }
            }
            t.setUTCDate(t.getUTCDate() - 1);
          }
          if (!res) return json({ error: 'krx 거래일 없음', 조회시도: tried, lookback: KRX_LOOKBACK }, 502);
        }
        const bad = (res.mkts || []).filter(m => !m.ok);
        const 신청안내 = ['openapi.krx.co.kr > 서비스 이용 > 주식 에서 다음을 **각각** 이용신청하세요',
          ...bad.map(m => '· ' + m.시장 + ' 일별매매정보 (' + (m.시장 === 'KOSPI' ? '유가증권' : '코스닥') + ')'),
          'ETF 신청만으로는 주식 경로가 열리지 않습니다 · 승인까지 수 시간 걸립니다'];
        /* 전 시장 실패일 때만 오류다. 한쪽만 막힌 것은 **부분 성공**이고, 성공분을 버리면
         * 실측 한 번에 볼 수 있었던 것을 못 보게 된다(§22-⑪: 처방이 다르면 갈라서 보고한다). */
        if (res.allFail) {
          /* KRX가 200에 에러 body를 실어 보내는 경우가 있다. 그대로 200으로 되돌리면
           * 앱의 `if(!res.ok)`를 통과해 items 없는 성공으로 읽히고 '변동 없음'이 된다.
           * 실패는 반드시 2xx가 아닌 코드로 나가야 한다. */
          const st = (bad[0] && bad[0].status) || 502;
          return json({
            error: 'krx ' + st, basDd: d, 시장별: res.mkts,
            다음행동: (bad[0] && /401|403/.test(String(st + (bad[0].body || ''))))
              ? 신청안내 : ['응답 body를 확인하세요']
          }, (st >= 200 && st < 300) ? 502 : st);
        }
        if (raw) return json({ 요청일: d, 조회시도: tried, 거래일: !!res.traded,
          시장별: res.mkts, 진단: res.diag,
          부분성공: bad.length ? true : undefined,
          경고: bad.length ? (bad.map(m => m.시장).join('·') + ' 조회 실패 — 나머지 시장 결과만 담겨 있습니다') : undefined,
          다음행동: bad.length ? 신청안내 : undefined,
          확인할것: [
            '① ISU_CD가 6자리 단축코드인가, 12자리 표준코드(KR7...)인가 — codeSrc가 여기서 갈린다',
            '② ISU_SRT_CD가 존재하는가 (ETF에는 없었다)',
            '③ LIST_SHRS가 존재하는가 · 값이 상장주식수인가',
            '④ TDD_CLSPRC 이름이 ETF와 같은가',
            '⑤ 비영업일(주말·공휴일)에도 행이 오는가 · 가격이 빈 문자열인가',
            '⑥ 유가증권/코스닥 행수가 각각 얼마인가 (payload·CPU 예산의 근거)'
          ] });
        /* ★ 한 건도 못 골랐는데 200을 주면 앱이 '변동 없음'으로 읽는다. 그건 오답이 아니라
         * **틀린 정답**이다. 코드 매칭이 아예 안 됐는지(scanned는 많은데 codeSrc가 빈 경우)와
         * 해당 종목이 그날 목록에 없었는지를 갈라서 알린다(§22-⑪: 처방이 다르다). */
        if (!res.rows.length && !res.codeSrc.length) return json({
          error: 'krx 코드 필드를 인식하지 못했습니다', basDd: res.basDd || d, 조회시도: tried,
          훑은청크: res.scanned,
          다음행동: ['/krxshrs?raw=1 로 필드명을 확인하세요',
                     'ISU_CD·ISU_SRT_CD 중 어느 것이 6자리인지에 따라 krxCode()를 고쳐야 합니다']
        }, 502);
        /* 요청일과 데이터의 기준일은 다른 양이다(§22-⑫) — 행이 들고 있는 BAS_DD를 돌려준다 */
        /* (v6.9) 한쪽 시장만 성공한 부분성공은 캐시하지 않는다 — 이용신청 승인 직후
         * 나머지 시장이 열려도 캐시가 수 시간 동안 가리게 된다. */
        const _ks = json({ basDd: res.basDd || d, 요청일: d, 조회시도: tried,
                      거래일: !!res.traded, codeSrc: res.codeSrc, 시장별: res.mkts,
                      부분성공: bad.length ? true : undefined,
                      경고: bad.length ? (bad.map(m => m.시장).join('·') + ' 조회 실패 — 해당 시장 종목은 점검되지 않았습니다') : undefined,
                      다음행동: bad.length ? 신청안내 : undefined,
                      n: res.rows.length, items: res.rows,
                      /* 항등식이 깨진 종목은 값을 지우지 않고 **표시해서** 보낸다.
                       * 앱이 ok:false를 걸러 내므로 잘못된 배율이 원장에 닿지 않는다. */
                      검증실패: res.badShrs && res.badShrs.length ? res.badShrs : undefined });
        return bad.length ? noCache(_ks) : _ks;
      }
      // (v6) KRX ETF 전종목 일별매매정보
      if (u.pathname === '/krxetf') {
        const key = env && env.KRX_AUTH_KEY;
        if (!key) return json({ error: 'KRX_AUTH_KEY secret이 설정되지 않았습니다',
          hint: 'Cloudflare > Workers > qa-proxy > Settings > Variables and Secrets > Add (Type: Secret)' }, 500);
        /* (v6.3) 실측 2026-07-31 — 필드 19개·거래일 판정·게시 지연이 전부 확인됐다.
         *  ① 비영업일에도 KRX는 행을 준다. 일 07/26 1150행 · 제헌절 07/17 1146행.
         *     단 가격 계열이 전부 빈 문자열이고 ACC_TRDVOL 합이 정확히 0이다.
         *     → "비어 있지 않은 날"이 아니라 "거래량이 있는 날"이 거래일 판정이다.
         *  ② 게시는 지연된다. 07/31 호출 시 07/31·07/30이 0행, 07/29가 최신분이었다.
         *  ③ 그래서 주말·공휴일·게시지연이 한 문제로 합쳐진다 — 공휴일 표를 박지 않고
         *     오늘부터 뒤로 훑어 첫 거래일을 찾는다(§20 상수 부패 회피).
         * 탐색 비용: 무료 플랜 CPU 한도 때문에 매 후보를 JSON.parse 하면 안 된다.
         * 거래일 판정은 정규식 1패스로 끝내고 파싱은 확정된 날짜에 단 1회만 한다.
         * 거래일이면 첫 행에서 매칭돼 즉시 종료된다. */
        const asked = (u.searchParams.get('d') || '').replace(/[^0-9]/g, '');
        const TRADED = /"ACC_TRDVOL"\s*:\s*"?[1-9]/;
        const hit = async (dd) => {
          const rr = await upstreamFetch(krxBase(env) + KRX_ETF_PATH + '?basDd=' + dd, { headers: { 'AUTH_KEY': String(key).trim() } });
          return { ok: rr.ok, status: rr.status, txt: await rr.text() };
        };
        let d = asked, res = null, tried = [];
        if (d.length === 8) {
          // 명시 지정은 그 날짜 그대로 — 진단 능력을 유지한다(빈 날짜/휴장일 확인용).
          res = await hit(d); tried.push(d);
        } else {
          const t = new Date(Date.now() + 9 * 3600e3);   // KST 달력일
          for (let i = 0; i < KRX_LOOKBACK; i++) {
            const w = t.getUTCDay();
            if (w !== 0 && w !== 6) {                    // 주말은 요청 없이 건너뛴다
              const dd = t.toISOString().slice(0, 10).replace(/-/g, '');
              const rr = await hit(dd); tried.push(dd);
              if (!rr.ok) { d = dd; res = rr; break; }   // HTTP 오류는 즉시 보고 (탐색으로 덮지 않는다)
              if (TRADED.test(rr.txt)) { d = dd; res = rr; break; }
            }
            t.setUTCDate(t.getUTCDate() - 1);
          }
          if (!res) return json({
            error: 'krx 거래일 없음', 조회시도: tried, lookback: KRX_LOOKBACK,
            다음행동: ['연휴가 KRX_LOOKBACK보다 길거나 게시가 그만큼 밀린 경우입니다',
                       '/krxetf?d=YYYYMMDD 로 특정 날짜를 직접 확인해 보세요']
          }, 502);
        }
        const r = { ok: res.ok, status: res.status };
        const txt = res.txt;
        if (!r.ok) return json({
          error: 'krx ' + r.status, basDd: d, body: txt.slice(0, 400),
          다음행동: r.status === 401
            ? ['① openapi.krx.co.kr > 서비스 이용 > 증권상품 > ETF 일별매매정보 > API 이용신청 (인증키 발급과 별개 단계)',
               '② 마이페이지 > API 인증키 발급내역에서 상태가 승인인지 확인 (신청 후 수 시간 소요)',
               '③ /krxetf?diag=1 로 Secret 형태 확인']
            : ['응답 body를 확인하세요']
        }, r.status);
        let j; try { j = JSON.parse(txt); } catch (e) { return json({ error: 'krx parse fail', body: txt.slice(0, 400) }, 502); }
        if (u.searchParams.get('raw')) return json({ 요청일: d, 조회시도: tried, raw: j });   // 진단용
        const rows = j.OutBlock_1 || [];
        /* (v6.3) 폴백 제거. 실측 필드 19개:
         *   BAS_DD ISU_CD ISU_NM TDD_CLSPRC CMPPREVDD_PRC FLUC_RT NAV TDD_OPNPRC TDD_HGPRC
         *   TDD_LWPRC ACC_TRDVOL ACC_TRDVAL MKTCAP INVSTASST_NETASST_TOTAMT LIST_SHRS
         *   IDX_IND_NM OBJ_STKPRC_IDX CMPPREVDD_IDX FLUC_RT_IDX
         * v6.2의 2순위 후보 중 NAV→INVSTASST_NETASST_TOTAMT(주당↔총액)와
         * IDX_IND_NM→OBJ_STKPRC_IDX(지수명↔지수종가)는 둘 다 실재하는 '다른 양'이었다.
         * 비영업일에는 가격 계열이 빈 문자열이라 폴백 발동 조건과 정확히 겹친다 — 삭제한다.
         * ISU_CD는 6자리 단축코드로 확인됐다(451060). ISU_SRT_CD는 존재하지 않는다. */
        const num = v => { if (v == null || v === '') return null; const n = +String(v).replace(/,/g, ''); return isFinite(n) ? n : null; };
        const str = v => (v == null || v === '') ? null : String(v);
        const out = (Array.isArray(rows) ? rows : []).map(o => ({
          code: str(o.ISU_CD),
          name: str(o.ISU_NM),
          idx:  str(o.IDX_IND_NM),
          close: num(o.TDD_CLSPRC),
          chg:   num(o.FLUC_RT),
          nav:   num(o.NAV),
          netAsset: num(o.INVSTASST_NETASST_TOTAMT),
          mktcap: num(o.MKTCAP),
          vol:   num(o.ACC_TRDVOL),
          val:   num(o.ACC_TRDVAL),
          shrs:  num(o.LIST_SHRS)
        })).filter(x => x.code);
        /* (v6.3) §22-⑫ — '언제 요청했는가'와 '언제의 데이터인가'는 다른 양이다.
         * basDd는 요청일이 아니라 행이 실제로 들고 있는 BAS_DD를 돌려준다. */
        const basSet = [...new Set((Array.isArray(rows) ? rows : []).map(o => o.BAS_DD).filter(Boolean))];
        return json({
          basDd: basSet.length === 1 ? basSet[0] : (basSet[0] || d),
          요청일: d, 조회시도: tried,
          basDd이상: basSet.length > 1 ? basSet : undefined,
          거래일: TRADED.test(txt),
          n: out.length, items: out
        });
      }
      // 3) 뉴스 헤드라인 — 구글뉴스 RSS를 파싱해 축약 JSON 반환
      if (u.pathname === '/news') {
        const q = (u.searchParams.get('q') || '').trim();
        const hl = (u.searchParams.get('hl') || 'en').trim(); // en | ko
        if (!q || q.length > 80) return json({ error: 'bad q' }, 400);
        /* (v6.9) hl은 RSS URL에 **인코딩 없이** 들어간다 — v6.8은 아무 문자열이나 받아
         * `&`로 파라미터를 끼워 넣을 수 있었다. 앱이 쓰는 두 값만 허용한다. */
        if (hl !== 'en' && hl !== 'ko') return json({ error: 'bad hl', hl: hl.slice(0, 20), 허용: ['en', 'ko'] }, 400);
        const gl = hl === 'ko' ? 'KR' : 'US';
        const ceid = hl === 'ko' ? 'KR:ko' : 'US:en';
        const rss = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q)
          + '&hl=' + hl + '&gl=' + gl + '&ceid=' + ceid;
        const r = await upstreamFetch(rss, { headers: { 'User-Agent': UA } });
        const xml = await r.text();
        const items = [];
        const re = /<item>([\s\S]*?)<\/item>/g;
        let mm;
        const pick = (block, tag) => {
          const m1 = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>'));
          if (!m1) return '';
          return m1[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        };
        while ((mm = re.exec(xml)) && items.length < 8) {
          const b = mm[1];
          let title = pick(b, 'title');
          // 구글뉴스 제목 끝의 " - 매체명" 분리
          let src = '';
          const dash = title.lastIndexOf(' - ');
          if (dash > 0) { src = title.slice(dash + 3); title = title.slice(0, dash); }
          const link = pick(b, 'link');
          const pub = pick(b, 'pubDate');
          const ts = pub ? Math.floor(Date.parse(pub) / 1000) : null;
          title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                       .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
          items.push({ t: title, u: link, s: src, ts: isFinite(ts) ? ts : null });
        }
        /* (v6.9) 상류 실패·0건도 v6.8과 같이 200 {q, items}로 돌려준다(앱 호환).
         * 단 캐시하지 않는다 — 일시 실패가 10분간 '뉴스 없음'으로 굳지 않게. */
        const _nr = json({ q, items });
        return (!r.ok || !items.length) ? noCache(_nr) : _nr;
      }
      // 1) 시세 중계 패스스루
      /* (v6.9) v6.8은 문자열을 잘라 호스트를 뽑았다: `http://` 허용, `https://user@evil/`의
       * 호스트가 'user@evil'로 읽히는 등 파서와 fetch가 **다른 URL을 보는** 틈이 있었다.
       * 이제 URL 파서 하나로 읽고 그 결과로만 판정·요청한다.
       *   · https만 · 포트 없는 호스트 정확 일치 · userinfo 거부
       *   · redirect:'manual' — 허용 호스트가 3xx로 다른 호스트에 넘기면 따라가지 않는다
       *     (따라가면 허용목록이 첫 홉에만 적용된다). */
      const target = u.searchParams.get('url') || '';
      let tu;
      try { tu = new URL(target); } catch (e) { return json({ error: 'bad url: ' + target.slice(0, 100) }, 400); }
      if (tu.protocol !== 'https:') return json({ error: 'https only: ' + tu.protocol }, 400);
      if (tu.username || tu.password) return json({ error: 'credentials in url not allowed' }, 400);
      const host = tu.host;                               // 포트가 있으면 'h:443' → 아래에서 불일치
      if (!ALLOW.includes(host)) return json({ error: 'host not allowed: ' + host }, 400);
      const res = await upstreamFetch(tu.toString(), {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' }, redirect: 'manual' });
      if (res.status >= 300 && res.status < 400) {
        let loc = res.headers.get('Location') || '';
        try { loc = new URL(loc, tu).host; } catch (_) { loc = ''; }
        return json({ error: 'upstream redirect ' + res.status, to: loc || null }, 502);
      }
      const body = await res.text();
      const out = new Response(body, {
        status: res.status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
      if (res.status === 429) out.headers.set('Retry-After', String(retryAfterSec(res)));
      return out;
    } catch (err) {
      /* (v6.9) 상류 429(크럼 냉각 포함)는 500으로 뭉개지 않고 429 + Retry-After로 돌려준다 —
       * 앱이 '워커 고장'과 '잠시 뒤 재시도'를 구별할 수 있어야 한다(§22-㉓). */
      if (err instanceof UpErr) {
        const r = json({ error: String(err) }, err.status || 502);
        if (err.status === 429) r.headers.set('Retry-After', String(err.retryAfter || 60));
        return r;
      }
      /* (v7.0) 내부 오류 원문은 응답에 싣지 않는다 — 로그에만 남긴다. */
      console.error('[qa-worker]', err && (err.stack || err));
      return json({ error: 'internal error' }, 500);
    }
}

/* (v7.0) 상류 응답은 **본문까지** 제한한다 — 8초 타임아웃과 8MB 상한. v5.4 주석은 'bounded'였지만
 * 실제로는 r.text()가 크기 제한 없이 읽었다(50MB 본문이 그대로 전달됨). 상한을 넘으면 읽기를
 * 끊고 502로 알린다. redirect 기본값은 'manual'(허용 호스트가 다른 호스트로 넘기지 못하게). */
const UP_MAX_BYTES = 8 * 1024 * 1024;
/* 반환값은 Response가 아니라 **이미 다 읽은 본문**을 든 가벼운 객체다(ok·status·headers·text·json).
 * 호출부는 전부 이 다섯 가지만 쓴다. 본문을 한 번만, 상한 안에서만 읽는다. */
async function upstreamFetch(url, options = {}) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal, redirect: options.redirect || 'manual' });
    let txt = '';
    if (![204, 205, 304].includes(r.status)) {
      if (r.body && typeof r.body.getReader === 'function') {
        const reader = r.body.getReader(), dec = new TextDecoder(); let n = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          n += value.byteLength;
          if (n > UP_MAX_BYTES) { try { ctrl.abort(); } catch (_) {} throw new UpErr('upstream body too large', 502); }
          txt += dec.decode(value, { stream: true });
        }
        txt += dec.decode();
      } else {
        txt = await r.text();
        if (txt.length > UP_MAX_BYTES) throw new UpErr('upstream body too large', 502);
      }
    }
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: r.headers,
             text: async () => txt, json: async () => JSON.parse(txt) };
  } finally { clearTimeout(timer); }
}
