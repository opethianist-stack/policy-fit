# Policy Fit — 작업 핸드오프

레포 루트의 `CLAUDE.md`. Codespace의 Claude Code가 세션 시작 시 자동으로 읽는다.
최종 갱신: 2026-09-21 (기준 커밋 `f27c12d`)

---

## 1. 무엇을 만들고 있나

KMA 사내 AI 스프린트(바이브코딩 트랙)의 팀 과제. **입찰 공고번호 하나를 입력하면 제안서의 "사업 이해도·추진 배경" 절을 쓰는 데 필요한 정책 근거를 모아주는 도구.**

해결하려는 문제: B2G 제안서를 쓸 때 발주처가 어느 부처 산하인지, 그 부처의 어떤 정책 과제에서 이 사업이 나왔는지를 매번 손으로 조사한다. 건당 3~5시간. 이걸 30분으로 줄이는 게 목표.

**팀**

| 담당 | 역할 |
|---|---|
| 송무석 | 도메인 설계, 전체 조율 |
| 문은혜 | 데이터·파싱 |
| 문선영 | 출력·시트 |

---

## 2. 8단계 처리 흐름 (확정)

1. **공고번호 입력** — 나라장터 입찰공고정보서비스로 공고 조회·분석
2. **발주처 계보 자동 매핑** — 공공기관 정보 조회로 발주처 → 산하·유관기관 → 주무부처
3. **지식베이스 정책 근거 검색** — 구글드라이브 정책문서 코퍼스에서 연관 정책 과제 검색
4. **근거 카드 생성** — 원문 발췌 · 문서명·발행연도·페이지 · 연결 논리 · 원문 링크
5. **검토 화면 확정** — 담당자가 원문을 대조하고 채택 여부를 확정
6. **초안 생성** — "사업 이해도·추진 배경" 초안. 출처 미확보 문장은 출력 단계에서 차단
7. **문서 산출** — docx · hwpx로 4~5페이지 이내
8. **장표 구도 추천** — AI미래교육본부 PPT 템플릿 기반 1안·2안 (직접 제작은 범위 밖)

**범위 경계** — 제안서 본문 전체 자동 작성은 하지 않는다. 정책 근거 제시와 그 근거에 기반한 배경 절까지다. 장표도 구도 추천까지이고 실제 제작은 하지 않는다.

---

## 3. 현재 구현 상태

`policy-fit` Next.js 앱 (App Router, JS, TypeScript 아님)

| 경로 | 파일 | 상태 |
|---|---|---|
| `/` | `app/page.js` | 과제 개요 + 8단계 흐름. 정적 |
| `/prototype` | `app/prototype/page.js` → `public/prototype.html` (iframe) | 사용자 화면 5종(홈·정책 근거 검색·근거 카드 챗봇·문서 산출·구도 추천). 바닐라 HTML/JS. 공고번호 입력·채택/제외·포맷 선택은 동작하지만 **데이터는 전부 샘플**이다. 홈의 연결 상태 점만 실데이터(`/api/health`) |
| `/api-test` | `app/api-test/page.js` | 오픈API 연결 테스트. 프리셋 8개(포털 4 + 알리오플러스 4). **실제로 동작함.** 어드민용이라 상단 탭에는 없고 주소로만 들어간다 |
| `/api/health` | `app/api/health/route.js` | 나라장터·공공기관 정보 API를 1건씩 실제 호출해 `{g2b, inst}` 의 ok/사유를 반환. 포털은 인증 실패에도 HTTP 200을 주므로 본문 결과코드까지 확인한다. 결과는 1분 캐시 |
| `/api/proxy` | `app/api/proxy/route.js` | 서버사이드 프록시. 실동작. `GET`은 키 5종의 등록 여부만 반환 |
| `/flow` | 없음 | **미구현.** README 구성표에는 올라가 있으나 `app/flow`도 Nav 탭도 없다 |

상단 탭은 `app/Nav.js`의 `TABS` 배열(개요 · 프로토타입).

**지금 실제로 돌아가는 건 API 프록시·테스터·연결 상태 확인뿐이고, 8단계 파이프라인은 아직 화면 목업 단계다.**

**화면 원칙** — 사용자 화면에는 작업에 쓰이는 것만 둔다. 과제 소개 문구, 성과 수치, 내부 구조(어떤 API·저장소를 쓰는지) 표시는 넣지 않는다.

---

## 4. 아키텍처 결정과 그 이유

**① 서버사이드 프록시가 필수다 (선택이 아님)**

- `apis.data.go.kr`은 CORS 헤더를 내려주지 않는다 → 브라우저 직접 호출 차단
- `openapi.alioplus.go.kr`은 **HTTPS를 지원하지 않는다** → HTTPS 페이지에서 직접 호출 시 mixed content 차단
- 인증키를 브라우저로 내보내지 않으려면 어차피 서버를 거쳐야 한다

**② 프록시는 허용 호스트를 고정한다**

`app/api/proxy/route.js`의 `ALLOWED_HOSTS`에 `apis.data.go.kr` · `api.odcloud.kr` · `openapi.alioplus.go.kr` 세 개만 있다. 이걸 빼면 안 된다. 프록시는 요청받은 주소에 서버의 인증키를 붙여 호출하므로, 주소를 제한하지 않으면 외부에서 자기 서버 주소를 넣어 키를 그대로 받아갈 수 있다. 응답의 `requestUrl`에서 키를 마스킹하는 것만으로는 막히지 않는다.

**③ 인증키 정규화**

공공데이터포털은 인코딩 키와 디코딩 키 두 벌을 준다. 인코딩 키(`%2B` 등 포함)를 그대로 다시 인코딩하면 인증에 실패한다. `resolveKey()`가 한 번 디코딩해서 정규화한 뒤 `URLSearchParams`가 다시 인코딩한다. 알리오플러스 키도 같은 경로를 탄다.

**④ 키는 `keySource` 이름으로 고른다**

요청 본문의 `keySource`가 어느 환경변수를 쓸지 결정한다. `route.js`의 `KEY_SOURCES`와 `api-test/page.js`의 `KEY_SOURCES`가 1:1로 맞아야 한다. 한쪽만 고치면 테스터에서 키 선택이 어긋난다.

| keySource | 환경변수 |
|---|---|
| `data` (기본값) | `DATA_GO_KR_KEY` |
| `alio-apba` | `ALIO_APBA_KEY` |
| `alio-biz` | `ALIO_BIZ_KEY` |
| `alio-facility` | `ALIO_FACILITY_KEY` |
| `alio-event` | `ALIO_EVENT_KEY` |

**⑤ 정책문서 코퍼스는 수동 구축이다**

2026-09-07 방향 재설정. 교육부 등 부처의 정책문서는 오픈API로 제공되지 않는다. 그래서 담당자가 파일을 직접 모아 **구글드라이브에 적재하는 지식베이스 방식**으로 간다. 화면명도 "근거검색"에서 **"정책 근거 검색"**으로 확정했다.

현재 확보분: 정책문서 15건(26개 파일), `[KMA-교육]/정책문서` 폴더. 일부는 스캔 PDF라 파싱에 OCR이 필요하다.

---

## 5. 오픈API 현황

**인증 체계가 둘로 갈린다. 이걸 헷갈리면 계속 인증 실패한다.**

| | 공공데이터포털 | 알리오플러스 |
|---|---|---|
| 호스트 | `https://apis.data.go.kr` | `http://openapi.alioplus.go.kr` (SSL 미지원, 80포트, IP `116.67.78.151`) |
| 방식 | GET · 쿼리스트링 | POST · `application/x-www-form-urlencoded` |
| 인증 파라미터 | `serviceKey` / `ServiceKey` | `X-API-AUTH-KEY` — 헤더가 아니라 **폼 바디 필드** |
| 키 발급처 | data.go.kr 마이페이지 | alioplus.go.kr 소셜 로그인 → Open API → API 발급 |
| 키 개수 | 일반 인증키 1개로 4종 전부 | **API 4종마다 따로 발급** |

**개별 API**

| 소관 | API | 엔드포인트 | 상태 |
|---|---|---|---|
| 조달청 | 나라장터 입찰공고정보 | `/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch` | 활용신청 완료. 베이스에 `/ad/` 세그먼트가 들어간다. 업무구분(물품·용역·공사·외자)마다 오퍼레이션이 다르다 |
| 과기정통부 | 주요정책 | `/1721000/msitmainpolicyinfo/mainPolicyList` | 활용신청 완료. **포털에 명세가 공개된 유일한 건** |
| 재정경제부 | 공공기관 정보 조회 | `/1051000/public_inst/list` · `/brnch` | 활용신청 완료. `/list` 응답에 **`sprvsnInstNm`(주관부처명) · `sprvsnInstCd`(주관부처코드)** 가 있다 |
| 재정경제부 | 공공기관 사업정보 | `/1051000/biz/list` | 활용신청 완료. 기관코드(`instCd`)·사업명(`bizNm`)으로 조회 |
| 기획재정부 | 알리오플러스 기관 | `/api/apba` | 키 등록됨 |
| 기획재정부 | 알리오플러스 사업 | `/api/business` | 키 등록됨 |
| 기획재정부 | 알리오플러스 시설 | `/api/facility` | 키 등록됨. 과제와 직접 관련 없음 |
| 기획재정부 | 알리오플러스 행사 | `/api/event` | 키 등록됨. 과제와 직접 관련 없음 |

**알리오플러스 요청·응답 요약 (가이드 1.6 기준)**

- 공통 필수: `X-API-AUTH-KEY`, `pageSize`(숫자). 페이지 번호 파라미터는 가이드에 없다
- `/api/apba` 요청: `schApbaGb`(본점 `APBA` / 지점 `AFLT`), `schApbaCate`(기관유형 코드), `schSiNa`, `schSggNa`, `schCont`(기관명 키워드)
- `/api/apba` 응답: `apbaNa, title, apbaGb, apbaTypeNa, adr, tel, callTel, fax, email, estaDt, siteUrl, bsnMstList[mstBsnNa, mstBsnDsc, tagNa], oprSiteList[siteNa, siteUrl]`
- `/api/business` 요청: `schFstCateCd / schScdCateCd / schTrdCateCd`(사업분야 대·중·소), `schLifeCycle`, `schSvcCate`, `schBsnNa`(키워드)
- `/api/business` 응답: `apbaNa, bsnNa, bsnDsc, lifeCycleNa, bsnPerNa, bsnDt, bsnStDt, bsnEndDt, guideTar, guideMth, guideDsc, siteUrl, svcCateNa`
- 기관유형 코드(`schApbaCate`): 01 SOC · 02 금융 · 03 에너지 · 04 고용보건복지 · 05 문화예술외교법무 · 06 농림수산환경 · 07 산업진흥정보화 · **08 연구교육** · 99 기타
- 사업분야 코드 중 교육 관련: `B03` 교육연구 → `B0301` 교육(사회교육·청소년교육·학교) · `B0302` 교육지원(교육연구·인력개발 등) · `B0303` 연구개발
- 가이드의 java 예제는 `"&schApbaGb ="`, `"&schApbaCate ="`처럼 파라미터명 뒤에 공백이 들어가 있다. 그대로 옮기면 필터가 적용되지 않는다
- 문의: 알리오운영팀 044-215-7584

**포털 공공기관 API 명세 (2026-09-21 포털 Swagger 확인)**

- 공통: `serviceKey`(필수), `pageNo`(기본 1), `numOfRows`(기본 10), `resultType`(기본 json). 응답 골격은 `resultCode, resultMsg, totalCount, result[].item`
- `public_inst/list` 요청: `instNm`(기관명, 문자열 포함), `instCd`(기관코드, 행정표준기관코드 가능), `instClsf`(기관분류), `instType`(기관유형), `ctpvNm`, `sggNm`
- `public_inst/list` 응답: `instCd, instNm, pbadmsStdInstCd, instClsf, instClsfNm, instType, instTypeNm, sprvsnInstCd, sprvsnInstNm, dsgnYn, laygInstYn, fndnYmd, frgnYn, ctpvNm, sggNm, roadNmAddr, lotnoAddr, daddr, rprsTelno, rprsFxno, rprsEml, custCntrTelno, siteUrl`
- `public_inst/brnch` 요청: `instCd`(필수). 응답: `brnchNm, brnchSn, instCd, instNm, pbadmsStdInstCd`, 주소·연락처 필드
- `biz/list` 요청: `instCd, bizNm, bizClsf, instClsf, instType, lifecyclLst, srvcClsf`
- `biz/list` 응답: `bizSn, bizNm, bizExpln, bizClsf, bizClsfNm, instCd, instNm, pbadmsStdInstCd, bizPeriodSe, bizPeriodSeNm, bizPeriodExpln, bgngYmd, endYmd, lifecyclLst, lifecyclNmLst, srvcClsf, srvcClsfNm, utztnTrgtExpln, utztnMthdExpln, utztnInqInfo, siteUrl`
- `instClsf` · `instType` · `bizClsf` 등의 코드값은 포털 상세페이지의 코드정의서 첨부파일에 있다

**계보 매핑 데이터 소스** — `public_inst/list`의 `sprvsnInstNm`이 "이 기관이 어느 부처 산하인가"를 준다. 알리오플러스 `/api/apba`에는 이 필드가 없으므로 계보 매핑은 포털 API가 1차 소스, 알리오플러스는 기관 주요사업(`bsnMstList`) 보강용이다.

남은 공백: 이 API는 알리오 공시 대상 공공기관만 담는다. 시도교육청·교육지원청·지자체·중앙부처 직속기관이 발주처인 공고는 여기서 안 나오므로 별도 매핑이 필요하다. 또 나라장터 공고의 발주기관명·수요기관 코드와 `instNm`/`pbadmsStdInstCd`를 어떻게 맞출지가 미정이다.

---

## 6. 환경·배포

```
Codespace ──(git push)──▶ GitHub(정본) ──(자동)──▶ Vercel
```

| | |
|---|---|
| 레포 | `github.com/opethianist-stack/policy-fit` (main) |
| Vercel 프로젝트 | `policy-fit` → `policy-fit-azure.vercel.app` |
| 작업 환경 | GitHub Codespaces |

**환경변수 (Vercel → Settings → Environment Variables)**

| 이름 | 상태 |
|---|---|
| `DATA_GO_KR_KEY` | 등록됨 |
| `ALIO_APBA_KEY` · `ALIO_BIZ_KEY` · `ALIO_FACILITY_KEY` · `ALIO_EVENT_KEY` | 등록됨 (2026-09-20) |

등록 여부는 배포본의 `GET /api/proxy` 응답(`configured`)으로 확인할 수 있다. 변수 이름 템플릿은 `.env.example`.

**알아둘 것**

- `policy-fit.vercel.app` 도메인은 다른 사람이 선점해서 Vercel이 `policy-fit-azure`를 배정했다. 이름과 주소가 안 맞아 보이는 게 정상이다
- **Vercel SSO 보호가 켜져 있다** (`all_except_custom_domains`). `policy-fit-azure.vercel.app`은 Vercel 로그인 없이 안 열린다. 멘토·팀원에게 보여주려면 Settings → Deployment Protection에서 조정해야 한다
- **`policy-fit-api` 프로젝트가 따로 남아 있다.** 2026-09-14 첫 시도본(API 테스터만)이고 방치 상태. 삭제 검토 대상. 지우기 전에 거기 등록된 환경변수가 있는지 확인할 것
- 알리오플러스는 80포트 HTTP만 받는다. Vercel 서버에서 이 호스트로 실제 호출이 나가는지는 `/api-test` 알리오 프리셋으로 확인한다

---

## 7. 작업 규칙

**① OneDrive의 `[KMA-교육]/policy-fit-src` 폴더는 편집하지 않는다**

git이 붙어있지 않은 옛 스냅샷이다. 거기서 고치면 GitHub은 영영 모른다. 읽기만 하고, 사실상 지워도 된다. 나중에 로컬 git이 생기면 그 폴더를 git으로 만들지 말고 **새 폴더에 `git clone`** 할 것.

**② 인증키는 파일에 적지 않는다**

Vercel 환경변수에만 둔다. 로컬·Codespace 실행이 필요하면 `.env.local`에 적되 그 파일은 커밋하지 않는다. `.gitignore`가 `.env` / `.env.*`를 전부 막고 `.env.example`만 예외로 둔다. 키가 담긴 `공공데이터포털_API_현황.xlsx`도 gitignore에 이름이 올라가 있다. 이 레포는 public이다.

**③ 파일을 고치기 전에 원격 변경분을 먼저 받는다**

`git pull`. 여러 곳에서 편집할 수 있는 구조라 이걸 빠뜨리면 남의 작업을 덮는다.

**④ 산출물에 메타 서술을 넣지 않는다**

"이 보고서는 OOO 프로젝트의 일환으로 작성되었음" 류의 문장. 워드·PPT뿐 아니라 다이어그램·아티팩트 등 모든 산출물에 적용. 구조적 라벨(제목/헤더)만 유지한다.

**⑤ 회사 PC 제약**

- Cloudoc 때문에 브라우저 자동 다운로드가 안 된다. 다운로드가 필요하면 링크 목록을 주고 직접 받는 방식으로
- 보안 정책상 `Program Files` 쓰기가 막혀 Git 설치가 실패한다(관리자 권한으로도 동일). 그래서 Codespaces를 쓴다. 정식 설치는 IT팀에 요청 중

---

## 8. 다음 과제

**우선순위 순**

1. **계보 매핑 실호출 검증** — `/api-test`의 공공기관 정보 조회 프리셋으로 실제 발주처 몇 곳(KERIS, 한국과학창의재단, 한국언론진흥재단 등)을 조회해 `sprvsnInstNm` 값을 확인한다
2. **나라장터 공고 → 기관 매칭 규칙** — 공고의 발주기관·수요기관 필드와 `public_inst`의 `instNm`/`pbadmsStdInstCd`를 잇는 방식 결정. 교육청·지자체 등 API 밖 발주처의 처리 방식 포함
3. **교육부 보도자료 아카이빙** — 링크 취합 → 구글 스프레드시트 목록화 → 첨부파일 구글드라이브 저장
4. **지식베이스 스토리지 구성** — 구글드라이브를 코퍼스 저장소로 확정하고 적재 규칙 정하기
5. **HWP/스캔 PDF 파싱** — 정책문서 중 스캔 PDF는 OCR이 필요하다. 방식 미정
6. **`/flow` 탭** — 업무 플로우 다이어그램 페이지. 배포 용량 제약 때문에 뺐던 것이라 지금은 넣어도 된다. 넣기 전까지는 README 구성표의 `/flow` 행이 실제와 다르다

**미해결 질문**

- 공시 대상 공공기관이 아닌 발주처(교육청·지자체·부처 직속)의 계보를 무엇으로 채울 것인가
- 근거 카드의 "연결 논리"를 어떤 방식으로 생성할 것인가 — 규칙 기반인지 LLM인지, 후자면 출처 미확보 문장 차단을 어떻게 보장할 것인가

---

## 9. 참고 파일 위치

| 자료 | 위치 |
|---|---|
| 과제기획서 최신본 | `[KMA-교육]/4. 과제기획서_Policy Fit_수정중_0908.hwpx` |
| 정책문서 코퍼스 | `[KMA-교육]/정책문서/` (15건 26개 파일) |
| 공공데이터포털 API 현황 | `공공데이터포털_API_현황.xlsx` — **인증키가 평문으로 들어있다. 커밋 금지** |
| 알리오플러스 API 가이드 | `알리오 플러스 API 가이드 1.6.pdf` (레포 밖 보관) |
| 디자인 토큰 | `[KMA-교육]/DESIGN.md` — 프로토타입이 이 팔레트를 쓴다 (violet `#7353EA`, ink `#191F28`, hairline `#E9EBF0`) |
