<!-- 출처: opethianist-stack/policy-harvest 브랜치 claude/github-repo-permissions-d04cc8 (eb00b06) docs/handoff-policy-fit.md, 2026-09-26 받아옴 -->

# Policy Fit 인계: 산하기관 입찰·사업공고·공지 게시판

policy-harvest는 정책문서(보도자료·업무계획·경영목표·사업계획)만 수집한다. 아래 공고성 게시판은 Policy Fit에서 공고 소스로 검토한다.

## 게시판 목록

| 기관 | 종류 | 주소 |
|---|---|---|
| NIPA | 공지사항 | https://www.nipa.kr/home/2-1 |
| NIPA | 사업공고 | https://www.nipa.kr/home/2-2 |
| NIPA | 입찰공고 | https://www.nipa.kr/home/2-3 |
| NIA | 입찰공고 | https://www.nia.or.kr/site/nia_kor/ex/bbs/List.do?cbIdx=78336 |
| NIA | 공지사항 | https://www.nia.or.kr/site/nia_kor/ex/bbs/List.do?cbIdx=99835 |
| KERIS | 입찰공고 | https://www.keris.or.kr/main/tender/view/selectTenderList.do?mi=1076 |
| KERIS | 공지사항 | https://www.keris.or.kr/main/na/ntt/selectNttList.do?mi=1051&bbsId=1088 |
| KERIS | 발주계획 | 나라장터 발주계획 화면(수요기관코드 `B550629`) |
| KOSAC | 사업공고 | https://www.kosac.re.kr/menus/274/bns |
| KOSAC | 입찰공고 | https://www.kosac.re.kr/menus/275/boards/403/posts |
| KOSAC | 공지사항 | https://www.kosac.re.kr/menus/270/boards/386/posts |
| KEDI | 입찰공고 | https://www.kedi.re.kr/khome/mobile2/announce/listBidAnnounceForm.do |
| KEDI | 공지사항 | https://www.kedi.re.kr/khome/mobile2/announce/listNoticeAnnounceForm.do |

KOSAC은 한국과학창의재단의 현재 약칭이다(2025년 KOFAC에서 변경, 도메인 `kosac.re.kr`).

## 접속·구조 조사 결과 (2026-09-26, GitHub Actions 미국 러너)

- 모든 게시판이 해외 IP에서 200으로 응답한다. 목록은 서버가 HTML로 그려서 내려준다
- NIPA·KOSAC: 상세 페이지가 일반 링크(`/home/2-1/16839`, `/menus/…/posts/…`)
- NIA·KERIS: 상세 페이지를 `javascript:` 함수로 연다. 함수 인자에서 글 번호를 읽어 상세 주소를 만들어야 한다
- KEDI: 목록 페이지에서 글 목록이 확인되지 않았다. 상세 주소 형식은 `selectAnnounceForm.do?board_sq_no={1 공지|2 입찰}&article_sq_no={글번호}`
- robots.txt: 위 경로를 막는 기관은 없다. NIA는 Googlebot에만 `/site/nia_kor/ex/bbs/`를 막았다. KERIS robots.txt는 요청이 끊겨 확인 불가
- KERIS 공지사항에는 선도교사 양성연수(인공지능, 교실혁명 등) 같은 사업 모집이 함께 올라온다
- KERIS 발주계획은 나라장터 공고라 기존 나라장터 API로 받으면 된다

상세 기록: policy-harvest `docs/research.md`, 조사 스크립트 `probe/probe_sites.py`.

## Policy Fit 세션에 줄 요청문

```
산하기관 공고 게시판을 공고 소스로 추가할지 검토해줘.
대상: NIPA·NIA·KERIS·KOSAC(한국과학창의재단, 구 KOFAC)·KEDI의 입찰공고·사업공고·공지사항 게시판.
게시판 주소와 접속·구조 조사 결과는 opethianist-stack/policy-harvest 레포의 docs/handoff-policy-fit.md에 있어.
- 나라장터 API로 이미 잡히는 입찰공고와 겹치는지 먼저 확인해줘(기관 게시판에만 있는 공고가 얼마나 되는지)
- KERIS 공지사항의 연수 사업 모집처럼 나라장터에 안 올라오는 사업 공지를 어떻게 잡을지 정해줘
- CLAUDE.md의 정책문서 수집 프로젝트 소개에서 KOFAC→KOSAC, KICE 제외, 수집 범위(정책문서만)를 고쳐줘
```


## 중복 조사 결과 (2026-09-26, Policy Fit)

`scripts/probe_board_overlap.mjs`를 GitHub Actions(`.github/workflows/probe-boards.yml`, 수동 실행)로 돌렸다. 최근 60일(2026-07-28 ~ 09-26) 게시판 글과 같은 기간 나라장터 입찰공고(용역·물품, 공고기관 또는 수요기관이 그 기관)를 제목으로 대조했다(글자쌍 겹침 0.6 이상이면 일치).

| 기관 | 게시판 | 기간 내 글 | 나라장터와 일치 | 게시판에만 |
|---|---|---|---|---|
| NIPA | 입찰 | 19 | 18 | 1 (누리꿈스퀘어 운영자금 차입 금융기관 선정) |
| NIPA | 사업공고 | 11 | 0 | 11 (기업 지원 모집 위주. 한-베트남 AI·디지털 포럼 운영 대행 **용역 입찰**이 게시판에만) |
| NIPA | 공지 | 24 | 0 | 24 (행사·표창·결과 안내) |
| NIA | 입찰 | 40 | 37 | 3 (모두 사전규격 공개 → 나라장터 사전규격 API로 잡힘) |
| NIA | 공지 | 12 | 0 | 12 (교육생·평가단 모집, 행사) |
| KERIS | 입찰 | 10 | 10 | 0 |
| KERIS | 공지 | 9 | 0 | 9 (공모전·콘퍼런스 안내) |
| KOSAC | 입찰 | 21 | 19 | 2 (AI·SW 기술 기반 과학 시뮬레이션 콘텐츠 개발, 상생결제 공모전) |
| KOSAC | 사업공고 | 11 | 0 | 11 (**운영기관·수행기관 공모**: 모두의 AI 챌린지 기획·운영, 클릭온 AI 시즌2, 초등 방과후 공급기관, KASA 우주항공 교육·문화 운영기관, 과학영재교육원 성과확산) |
| KOSAC | 공지 | 15 | 0 | 15 (선정 결과·경연 안내) |
| KEDI | 입찰·공지 | — | — | 목록을 읽지 못함(나라장터에는 60일 10건) |

- **입찰 게시판은 나라장터와 거의 겹친다**: 5개 기관 합계 90건 중 84건 일치(93%). 남은 6건 중 3건은 사전규격(이미 잡힘), 1건은 금융기관 선정, 1건은 공모전. 게시판에만 있는 실제 용역 입찰은 KOSAC 1건(과학 시뮬레이션 콘텐츠 개발)
- **나라장터에 없는 사업은 "사업공고" 게시판에 모인다**: KOSAC 사업공고 11건은 전부 게시판에만 있고 대부분 운영기관·수행기관 공모다(교육 운영사가 노릴 사업). 공고명으로 나라장터를 다시 찾아도 0건(모두의 AI 챌린지·클릭온·우주항공 교육·과학 시뮬레이션·베트남 포럼·누리꿈스퀘어). NIPA 사업공고는 기업 지원 모집이 많고 용역 입찰 1건이 섞여 있다
- **공지 게시판은 잡음이 많다**: 행사·표창·선정 결과가 대부분이고 사업 기회는 드물다
- 제목 대조 한계: 공지·사업공고에서 0.6~0.8로 "일치"가 난 몇 건(예: "ICT 비즈니스 파트너십(중동) 모집" ↔ "파트너십 운영 용역")은 실제로는 다른 글이다. 입찰 게시판의 일치는 대부분 1.00(같은 제목)이라 영향이 작다
