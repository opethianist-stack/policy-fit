# Policy Fit

KMA AI 스프린트 과제. 공고번호를 입력하면 발주처 소속 계보를 매핑하고, 구글드라이브 지식베이스에서
출처가 확인된 정책 근거만 추려 사업 이해도 문서와 장표 구도 추천까지 잇는 도구.

## 구성

| 경로 | 내용 |
|---|---|
| `/` | 과제 개요와 8단계 처리 흐름 |
| `/prototype` | 사용자 화면 (홈 · 정책 근거 검색 · 정책 근거 선택 · 문서 산출 · 구도 추천) |
| `/api-test` | 오픈API 연결 테스트 (상단 탭 "API 연결 테스트") |
| `/api/notice` | 입찰공고번호 → 공고 요약 |
| `/api/lineage` | 수요기관명 → 발주처 계보 |
| `/api/evidence` | 정책문서 색인 검색 → 근거 발췌 |
| `/api/page` | 색인의 한 쪽 원문 + 발췌 위치 |
| `/api/rfp` | 제안요청서(첨부 URL 또는 업로드) → 본문·검색어 |
| `/api/prespec` | 나라장터 사전규격(용역) 중 규격명·기관이 맞는 건, 또는 사전규격등록번호(`?no=`) 한 건 |
| `/api/bids` | 용역 입찰공고 중 공고명이 키워드와 맞는 건 |
| `/api/msit` | 과기정통부 게시판 4종(주요정책·사업공고·보도자료·보도설명) 중 제목이 검색어와 맞는 게시물 |
| `/api/draft` | 선택한 정책 근거 → 논증 블록 문서 모델 · 장표 구도 추천 |
| `/api/ai` | LLM 보조(검색어 추천·역할 분류·관련도 정렬·문서 초안·장표 문구). 검증을 통과한 칸만 반환 |
| `/api/export` | 문서 모델 → docx |
| `/api/health` | 나라장터·공공기관 정보 API 연결 상태 확인 |
| `/api/proxy` | 오픈API 서버사이드 프록시 |

## 정책문서 색인

근거 검색은 `data/corpus-index.json` 하나만 읽는다. 색인은 GitHub Actions(`.github/workflows/sync-corpus.yml`)가
매일 03:00(KST) 구글드라이브 정책문서 폴더에서 파일을 받아 다시 만들고, 바뀐 게 있으면 커밋한다.
드라이브 폴더에 파일을 넣으면 다음 날 반영되고, 급하면 Actions에서 "정책문서 색인 갱신"을 직접 실행한다.

로컬에서 직접 만들 때:

```
pip install pymupdf olefile
python3 scripts/build_index.py <정책문서 폴더>
```

파일명은 `번호_분류_기관_문서명[_구분]_연도.확장자` 규칙을 따른다. 스캔 PDF는 색인되지 않는다.

## 환경변수

| 이름 | 설명 |
|---|---|
| `DATA_GO_KR_KEY` | 공공데이터포털(data.go.kr) 일반 인증키. 이 키 하나로 포털 계열 API를 모두 호출한다. Decoding/Encoding 어느 쪽을 넣어도 프록시에서 정규화한다. |
| `ALIO_APBA_KEY` | 알리오플러스 **기관정보** 인증키. |
| `ALIO_BIZ_KEY` | 알리오플러스 **사업정보** 인증키. |
| `ALIO_FACILITY_KEY` | 알리오플러스 **시설정보** 인증키. |
| `ALIO_EVENT_KEY` | 알리오플러스 **행사정보** 인증키. |
| `ANTHROPIC_API_KEY` | Claude API 키. `/api/ai`가 쓴다. 없으면 AI 버튼만 "키 미설정"으로 안내하고 나머지는 그대로 동작한다. |
| `ANTHROPIC_MODEL` | 선택. 비우면 `claude-haiku-4-5-20251001`. |

알리오플러스(alioplus.go.kr)는 포털과 발급처가 다르고, **API 4종마다 인증키를 따로 발급**한다.
프록시는 요청 본문의 `keySource`(`data` · `alio-apba` · `alio-biz` · `alio-facility` · `alio-event`)로
어느 키를 쓸지 고르며, 이 이름은 `app/api/proxy/route.js` 의 `KEY_SOURCES` 와
`app/api-test/page.js` 의 `KEY_SOURCES` 가 1:1로 맞춰져 있다.

변수 이름만 담은 템플릿은 `.env.example` 에 있다.
로컬 실행은 `.env.local` 로 복사해 값을 채우고, 배포는 Vercel → Settings → Environment Variables 에 등록한 뒤 재배포한다.
인증키가 담긴 파일(`.env*`, 포털에서 내려받은 인증키 xlsx)은 `.gitignore` 로 제외되어 있다.

## 프록시가 필요한 이유

`apis.data.go.kr` 은 CORS 헤더를 내려주지 않아 브라우저에서 직접 호출하면 차단된다.
`openapi.alioplus.go.kr` 은 HTTPS를 지원하지 않아 HTTPS 페이지에서 직접 호출하면 mixed content로 차단된다.
`/api/proxy` 가 서버에서 대신 호출하며, 그 과정에서 인증키가 브라우저로 나가지 않는다.

프록시는 요청받은 주소에 서버의 인증키를 붙이므로, 임의의 주소로 키가 흘러나가지 않도록
`apis.data.go.kr` · `api.odcloud.kr` · `openapi.alioplus.go.kr` 세 호스트만 허용한다.
응답에 실리는 `requestUrl` 에서도 인증키 값은 마스킹된다.

## 연결 대상 오픈API

| 소관기관 | API | End Point | 키 |
|---|---|---|---|
| 조달청 | 나라장터 입찰공고정보서비스 | `https://apis.data.go.kr/1230000/ad/BidPublicInfoService` | `DATA_GO_KR_KEY` |
| 조달청 | 나라장터 사전규격정보서비스 | `https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService` | `DATA_GO_KR_KEY` |
| 과학기술정보통신부 | 주요정책 | `https://apis.data.go.kr/1721000/msitmainpolicyinfo` | `DATA_GO_KR_KEY` |
| 과학기술정보통신부 | 사업공고 | `https://apis.data.go.kr/1721000/msitannouncementinfo` | `DATA_GO_KR_KEY` |
| 과학기술정보통신부 | 보도자료 | `https://apis.data.go.kr/1721000/msitpressreleaseinfo` | `DATA_GO_KR_KEY` |
| 과학기술정보통신부 | 보도설명 | `https://apis.data.go.kr/1721000/msitpressexplaininfo` | `DATA_GO_KR_KEY` |
| 재정경제부 | 공공기관 정보 조회 서비스 | `https://apis.data.go.kr/1051000/public_inst` | `DATA_GO_KR_KEY` |
| 재정경제부 | 공공기관 사업정보 조회서비스 | `https://apis.data.go.kr/1051000/biz` | `DATA_GO_KR_KEY` |
| 기획재정부 | 알리오플러스 기관정보 | `http://openapi.alioplus.go.kr/api/apba` | `ALIO_APBA_KEY` |
| 기획재정부 | 알리오플러스 사업정보 | `http://openapi.alioplus.go.kr/api/business` | `ALIO_BIZ_KEY` |
| 기획재정부 | 알리오플러스 시설정보 | `http://openapi.alioplus.go.kr/api/facility` | `ALIO_FACILITY_KEY` |
| 기획재정부 | 알리오플러스 행사정보 | `http://openapi.alioplus.go.kr/api/event` | `ALIO_EVENT_KEY` |

알리오플러스 4종은 모두 `POST` + `application/x-www-form-urlencoded` 이고,
인증 파라미터명은 `X-API-AUTH-KEY` 인데 헤더가 아니라 **폼 바디 필드**로 전달한다.

`1051000` 계열은 포털에 베이스 주소까지만 공시되어 오퍼레이션 경로를 별도로 확인해야 한다.


<!-- git 연동 확인 -->
