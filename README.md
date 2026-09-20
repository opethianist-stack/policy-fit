# Policy Fit

KMA AI 스프린트 과제. 공고번호를 입력하면 발주처 소속 계보를 매핑하고, 구글드라이브 지식베이스에서
출처가 확인된 정책 근거만 추려 사업 이해도 문서와 장표 구도 추천까지 잇는 도구.

## 구성

| 경로 | 내용 |
|---|---|
| `/` | 과제 개요와 8단계 처리 흐름 |
| `/prototype` | 화면 프로토타입 5종 (홈 · 정책 근거 검색 · 근거 카드 챗봇 · 문서 산출 · 구도 추천) |
| `/api-test` | 공공데이터포털 오픈API 연결 테스트 |
| `/flow` | 업무 플로우 다이어그램 |
| `/api/proxy` | 오픈API 서버사이드 프록시 |

## 환경변수

| 이름 | 설명 |
|---|---|
| `DATA_GO_KR_KEY` | 공공데이터포털(data.go.kr) 일반 인증키. 이 키 하나로 포털 계열 4종을 모두 호출한다. Decoding/Encoding 어느 쪽을 넣어도 프록시에서 정규화한다. |
| `ALIO_APBA_KEY` | 알리오플러스 **기관정보** 인증키. |
| `ALIO_BIZ_KEY` | 알리오플러스 **사업정보** 인증키. |
| `ALIO_FACILITY_KEY` | 알리오플러스 **시설정보** 인증키. |
| `ALIO_EVENT_KEY` | 알리오플러스 **행사정보** 인증키. |

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
| 과학기술정보통신부 | 주요정책 | `https://apis.data.go.kr/1721000/msitmainpolicyinfo` | `DATA_GO_KR_KEY` |
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
