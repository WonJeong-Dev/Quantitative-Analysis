/**
 * Quant Stock Board 개인 프록시 — Google Apps Script (무료, 하루 2만 요청)
 *
 * 배포 방법 (약 2분):
 *  1. script.google.com → 새 프로젝트 → 이 코드 전체 붙여넣기
 *  2. [배포] → 새 배포 → 유형: 웹 앱
 *     - 실행 계정: 나  /  액세스 권한: 모든 사용자
 *  3. 발급된 URL 복사 (https://script.google.com/macros/s/…/exec)
 *  4. 대시보드 [설정] → 커스텀 CORS 프록시 칸에 아래 형식으로 입력:
 *     https://script.google.com/macros/s/여기에ID/exec?url={url}
 *
 * 야후 파이낸스·네이버 실시간 시세를 서버 측에서 대신 받아 CORS 없이 전달합니다.
 * 공개 프록시의 속도 제한·차단 문제를 피할 수 있는 가장 간단한 무료 방법입니다.
 */
const ALLOW = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'polling.finance.naver.com'];

function doGet(e) {
  try {
    const url = (e && e.parameter && e.parameter.url) || '';
    const host = url.replace(/^https?:\/\//, '').split('/')[0];
    if (!ALLOW.includes(host)) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'host not allowed: ' + host }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: false,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    return ContentService.createTextOutput(res.getContentText())
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
