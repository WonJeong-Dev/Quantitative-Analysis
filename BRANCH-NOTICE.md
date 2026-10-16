# source 브랜치 — QA Stock Board 소스 백업

이 브랜치는 **소스 백업 전용**입니다. GitHub Pages는 `main`만 서빙하므로 사이트에는 영향이 없습니다.

- 배포 산출물(`dist/`)은 `main`에 있습니다. 이 브랜치에는 없습니다.
- `python "INNO Deploy/inno_deploy.py" push qa_src` 로 갱신합니다(E:\\Develop 에서 실행).
- 빌드: `node scripts/build.cjs` · 검증: `node scripts/verify.cjs`

## ⚠ 복구 시 반드시 할 것

실제 이메일 주소가 트리 **전체**에서 `ALLOWED_EMAIL_1@example.com` 식 자리표시자로
치환돼 있습니다(이 저장소가 공개이기 때문입니다). 서로 다른 주소는 서로 다른 번호를 받으므로
구별은 보존됩니다. 영향 받는 파일: `backend/firestore.rules`, `tests/firestore-emulator.cjs`.
Firebase 콘솔에 붙여 넣기 전에 **실제 허용 이메일로 되돌리십시오.** 그대로 게시하면
아무도 보드에 들어갈 수 없습니다.

실제 명단은 로컬 `E:\\Develop\\Quantitative Analysis\\backend\\firestore.rules` 에만 있습니다.
