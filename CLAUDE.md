# Policy Fit — 작업 핸드오프

레포 루트의 `CLAUDE.md`. Codespace의 Claude Code가 세션 시작 시 자동으로 읽는다.
최종 갱신: 2026-09-21 (STEP 3-4 제안요청서 입력 반영, 직전 커밋 `308a8e0`)

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
4. **근거 카드 생성** — 원문 발췌 · 문서명·발행연도·페이지 · 역할(정책 기조·기술·환경·현장 수요·발주기관 계획) · 원문 링크
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
| `/prototype` | `app/prototype/page.js` → `public/prototype.html` (iframe) | 사용자 화면 5종(홈·정책 근거 검색·근거 카드 검토·문서 산출·구도 추천). 바닐라 HTML/JS. **다섯 화면 모두 실데이터**(아래 API)로 동작한다 |
| `/api-test` | `app/api-test/page.js` | 오픈API 연결 테스트. 프리셋 8개(포털 4 + 알리오플러스 4). **실제로 동작함.** 어드민용이라 상단 탭에는 없고 주소로만 들어간다 |
| `/api/health` | `app/api/health/route.js` | 나라장터·공공기관 정보 API를 1건씩 실제 호출해 `{g2b, inst}` 의 ok/사유를 반환. 포털은 인증 실패에도 HTTP 200을 주므로 본문 결과코드까지 확인한다. 결과는 1분 캐시 |
| `/api/notice?no=` | `app/api/notice/route.js` | 입찰공고번호 → 공고 요약(공고명·수요기관·예산·마감·첨부파일 URL). 업무구분을 몰라 용역→물품→공사→외자 순으로 조회하고, 정정공고는 최신 차수를 쓴다 |
| `/api/lineage?name=` | `app/api/lineage/route.js` | 수요기관명 → 계보. ① 중앙부처 본부 ② 규칙(교육지원청·교육청·학교·대학, `data/org-rules.json`) ③ 공공기관 정보 API의 주관부처 순 |
| `/api/evidence?title=&orgs=&ministry=&terms=&scope=` | `app/api/evidence/route.js` → `lib/search.js` | 색인에서 쪽 단위 검색 후 발췌문 반환. 결과마다 역할 기본값(`role`)을 붙인다(`lib/roles.js`). 외부 호출·LLM 없음 |
| `/api/page?doc=&page=&quote=` | `app/api/page/route.js` | 색인의 한 쪽 원문 전체 + 발췌문 위치(`hit`) + 앞뒤 쪽 번호. 검토 화면의 원문 쪽 보기가 쓴다 |
| `/api/rfp` | `app/api/rfp/route.js` → `lib/extract.js`, `lib/rfp.js` | 제안요청서 → 본문 텍스트 + 검색어 + 사업명·발주기관 추정. `GET ?url=&name=&title=`은 나라장터 첨부파일을 서버가 받아 읽고, `POST ?name=&title=`(본문=파일 바이트)은 올린 파일을 읽는다. 파일은 저장하지 않는다 |
| `/api/draft` (POST) | `app/api/draft/route.js` → `lib/draft.js` | 채택 카드(역할·문서 문장) + 헤드라인 + 수렴점 → 논증 블록 문서 모델(JSON)과 구도 추천. 화면 미리보기가 이걸 그린다 |
| `/api/export` (POST) | `app/api/export/route.js` | 같은 문서 모델로 docx 생성(`docx` 패키지). hwpx는 미구현 |
| `/api/proxy` | `app/api/proxy/route.js` | 서버사이드 프록시. 실동작. `GET`은 키 5종의 등록 여부만 반환 |
| `/flow` | 없음 | **미구현.** README 구성표에는 올라가 있으나 `app/flow`도 Nav 탭도 없다 |

상단 탭은 `app/Nav.js`의 `TABS` 배열(개요 · 프로토타입).

**8단계가 전부 실데이터로 이어진다. 남은 건 ⑦의 hwpx 산출과 품질 개선이다.**

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

**⑥ 근거 검색은 색인 파일 하나로 한다**

`scripts/build_index.py`가 정책문서 폴더를 읽어 `data/corpus-index.json`(문서 메타 + 쪽 단위 본문)을 만든다. 앱은 이 파일만 읽는다. 요청마다 드라이브에서 PDF를 여는 방식은 서버리스 제한 시간에 걸려서 쓰지 않는다.

- 문서를 추가·교체하면 `python3 scripts/build_index.py <정책문서 폴더>` 를 다시 돌리고 색인을 커밋한다 (`pip install pymupdf olefile`)
- 파일명 규칙 `번호_분류_기관_문서명[_구분]_연도.확장자` 에서 기관·연도를 읽는다. 규칙을 어기면 검색 범위(계보 문서) 판정이 틀어진다
- PDF는 쪽 번호가 정확하다. HWPX·HWP는 저장된 줄 배치 정보로 쪽을 추정하고 `pageEstimated: true`로 표시한다(PDF 쌍이 있는 문서로 대조했을 때 ±1쪽). 같은 이름의 PDF가 있으면 HWP 쪽은 색인하지 않는다
- 스캔 PDF는 텍스트가 없어 색인되지 않는다. 현재 `14-1`, `14-2`(전문대교협) 두 건이 해당한다
- 색인의 기관 표기(KERIS, 과기정통부 등)와 API의 정식 명칭은 `data/org-rules.json`의 `aliases`로 맞춘다. 새 기관 문서를 넣으면 여기도 추가한다
- `data/corpus-links.json`에 `{"문서번호": "URL"}`을 넣으면 화면의 "원문 열기"가 켜진다. 지금은 비어 있다

**⑦ 검색·발췌 방식 (`lib/search.js`)**

공고명을 띄어쓰기 단위로 자르고 계약 용어(용역·위탁 등)를 뺀 뒤, 용어 사전(`org-rules.json`의 `lexicon`)에 있는 말이 공고명에 들어 있으면 검색어에 더한다. 검색 범위는 기본이 발주처·상위기관·주관부처 문서 + 범부처 문서이고 화면에서 전체로 넓힐 수 있다. 점수는 검색어 희소성 × 출현 빈도에 여러 검색어가 함께 나오는 쪽을 우대한다. 목차 쪽은 감점, 한 문서는 최대 3쪽까지만 낸다.

발췌문은 색인 본문에서 잘라낸 원문이고, 반환 직전에 공백을 무시한 원문 포함 여부를 다시 대조해 불일치면 버린다. LLM은 아직 붙이지 않았다(2026-09-21 사용자 결정: STEP 3에서는 안 붙임).

**검토 화면(B안, 2026-09-21 확정)** — 화면명은 "근거 카드 검토"(기획서 ⑤의 표현. "챗봇"은 목업에서 온 이름이고 0908 기획서에는 없다). 왼쪽은 **원문 쪽 보기**: `/api/page`로 그 쪽 원문 전체를 보여 주고 발췌 부분을 하이라이트한다. 앞뒤 쪽으로 넘길 수 있고, 원문에서 글자를 드래그해 "선택한 부분으로 발췌"를 누르면 카드의 발췌문과 쪽 번호가 그 선택으로 바뀐다(HWP 쪽 추정 ±1쪽 보정도 이걸로 한다). 선택은 원문에서 온 글자라 산출 단계 대조를 그대로 통과한다. 오른쪽은 채택/제외 + **역할 칩 4개**. LLM 챗봇(A안)은 나중에 이 화면 위에 얹는다.

**⑦-2 제안요청서 입력 (STEP 3-4)**

검색 재료가 공고명뿐이면 "시설 임차용역" 같은 공고에서 결과가 빈약하다. 제안요청서 본문에서 검색어를 더 뽑는다.

- **두 입구**: ① 공고 조회 후 첨부파일 이름이 `제안요청서|과업지시서|과업내용`이면 자동으로 `/api/rfp?url=`을 부른다(pdf > hwpx > hwp 순으로 고름). 실패하면 공고 카드 아래 "제안요청서" 줄에 사유와 "파일 올리기"가 나온다 ② 홈의 "공고번호 없이 제안요청서로 시작" — 파일 + 사업명 + 발주기관(파일 첫머리에서 추정해 미리 채움)으로 시작. 이때 공고 객체는 `{ no:'', manual:true }`이고 산출 문서의 사업 개요 표는 사업명·발주기관만 남는다
- **본문 추출**(`lib/extract.js`): pdf(`unpdf`), hwpx·docx(`fflate`로 압축 해제 후 XML 글자), hwp 5.0(`cfb`로 열고 BodyText 섹션을 zlib 해제, PARA_TEXT 레코드). 배포용·암호 hwp, 스캔 pdf는 읽지 못한다고 알린다. 파일 종류는 확장자보다 앞 바이트로 판정
- **검색어 뽑기**(`lib/rfp.js` `termsFromRfp`): 어절 → 조사 떼기(`stripJosa`, `lib/search.js`) → 입찰·계약·평가 서식 용어 제외 → "사업 목적·추진 배경·과업 내용" 제목 뒤 40줄은 가중치 2, "입찰참가자격·평가기준·보안" 뒤 60줄은 0.3 → **정책문서 색인에 실제로 나오는 말만**(쪽 빈도 25% 미만) → 제안요청서 빈도 × 색인 희소성 상위 8개. 공고명 검색어와 겹치는 말은 뺀다. 화면에서는 테두리만 있는 칩으로 구분되고 지울 수 있다. 다른 파일을 올리면 이전 파일의 검색어는 빠진다
- `stripJosa`는 공고명 검색어에도 적용된다("진단을" → "진단"). 명사 끝과 겹치기 쉬운 한 글자(이·가·도·로·등 …)는 떼지 않는다
- **보안**: `?url=`은 `www.g2b.go.kr`/`g2b.go.kr`만 받는다(리다이렉트 최종 주소도 확인). 아무 주소나 받으면 서버가 임의 주소를 부르는 통로가 된다. 20MB 상한, 20초 제한. HTML이 오면(로그인·오류 페이지) 실패로 처리
- **크기 한도**: Vercel 함수 요청 본문 한도(4.5MB) 때문에 화면에서 4MB 넘는 파일은 올리지 않고 안내한다. 첨부 자동 수집은 서버가 받으므로 이 한도와 무관
- 응답의 `text`(최대 8만 자)는 화면 메모리(`S.rfp.text`)에만 둔다. LLM을 붙이면 여기서 쓴다
- **미확인**: Vercel 서버에서 나라장터 첨부 URL을 실제로 받을 수 있는지(세션 쿠키·리퍼러 요구 여부). 배포 후 실제 공고로 확인할 것

**⑧ 문서 산출과 구도 추천 (`lib/draft.js`, `lib/roles.js`)** — STEP 3-1에서 근거 목록 → 논증 블록 구조로 바꿨다

실제 제안서의 "사업 이해도/추진 배경" 절(사용자 제공 3건: KERIS 교실혁명, KICE AI 보조교사, 서울 AI디지털배움터)을 따라간다. 근거는 나열하지 않고 헤드라인 + 개조식 불릿 + 괄호 출처로 들어간다.

```
사업 이해도 · 추진 배경 / <사업명>
1. 사업 추진 배경
 가. (정책 기조) <헤드라인>            ← 역할 블록. 역할 순서 = 논증 순서
   - <문서 문장> (「문서명」, 기관 정식명, 연도, p.N)
   - “<발췌문 그대로>” (…)             ← 문서 문장을 안 쓰면 원문을 따옴표로
 나. (기술·환경) … 다. (현장 수요) … 라. (발주기관 계획) …
2. 추진 배경 종합                        ← 역할이 2개 이상일 때만
 구분 | 내용(=헤드라인) | 근거  + 마지막 줄 수렴점(사업 추진의 필요성)
참고. 사업 개요 및 발주처 계보           ← API 값. 붙여 넣을 때 빼기 쉽게 맨 뒤
```

- **역할**(`lib/roles.js`의 `ROLES`, 화면 `prototype.html`의 `ROLES`와 같게 유지): `policy` 정책 기조 · `tech` 기술·환경 · `demand` 현장 수요 · `agency` 발주기관 계획. 기본값은 규칙(`defaultRole`): 발주기관 계보 문서 → `agency`, 발췌문에 수치 → `demand`, 나머지 → `policy`. `tech`는 담당자만 고른다
- 문서에 들어가는 문장은 네 종류뿐이다: ① 색인 원문과 대조를 통과한 발췌문 ② 담당자가 쓴 헤드라인·문서 문장·수렴점 ③ API 값으로 채운 정형 문장 ④ 색인 메타데이터로 만든 출처 표기. 산출 직전에 발췌문을 색인과 다시 대조하고, 실패한 카드는 문서에 넣지 않고 `blocked`로 돌려준다(출처 미확보 문장 차단)
- **숫자 대조**(`missingNumbers`): 담당자 문장 속 두 자리 이상 숫자가 그 카드의 원문 쪽에 글자 그대로 없으면 `factWarnings`로 알린다(경고만, 차단 안 함). LLM을 붙이면 같은 함수를 LLM 문장의 **차단** 기준으로 쓴다
- 쪽 번호가 추정인 카드는 docx에 p.N만 찍고, 화면에서만 "쪽 확인" 표시
- HWP에서 글머리 기호가 사용자 정의 영역 글자로 추출되는 경우가 있어 문서 출력에서는 지운다(대조는 원문 그대로)
- 입력: `{ notice, lineage, cards:[{…, role, text}], headlines:{역할:문장}, conclusion }`. STEP 2의 `logic` 필드는 `text`로 읽는다
- 산출 화면은 왼쪽 작성칸(역할 블록별 헤드라인, 카드별 문서 문장 — 위에 발췌문을 회색으로, 맨 아래 수렴점) / 오른쪽 미리보기. 입력 350ms 뒤 `/api/draft`를 다시 불러 미리보기·경고를 갱신한다
- 산출물에는 도구 이름이나 생성 경위 같은 메타 서술을 넣지 않는다

구도 추천은 규칙이다. 수치가 들어간 근거가 2건 이상이면 "수치 강조형"(안 2)을 추천하고, 아니면 안 1을 추천한다. 안 1은 역할이 2개 이상이면 **수렴형**(역할별 상단 칸 + 하단 수렴점), 하나뿐이면 계보 흐름형. AI미래교육본부 PPT 템플릿 실물은 아직 반영하지 못했다(화면의 "템플릿 기반" 표시는 실물 반영 전까지 사실과 다르다).

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

1. **제안요청서 검색어 품질 점검** — 실제 제안요청서 여러 건으로 `termsFromRfp` 결과를 보고 제외어·가중치를 고친다. 첨부 자동 수집이 배포 서버에서 되는지 확인
2. **실사용 점검** — 실제 공고 몇 건으로 끝까지 돌려보고 검색 품질·발췌문 끊김·문서 구성을 고친다. 논증 블록 문서를 실제 제안서에 붙여 넣어 보고 역할 기본값 규칙이 맞는지 본다
3. **원문 링크** — 정책문서를 구글드라이브에 올리고 `data/corpus-links.json`을 채운다
4. **교육부 보도자료 아카이빙** — 링크 취합 → 구글 스프레드시트 목록화 → 첨부파일 구글드라이브 저장
5. **지식베이스 스토리지 구성** — 구글드라이브를 코퍼스 저장소로 확정하고 적재 규칙 정하기
6. **스캔 PDF OCR** — `14-1`, `14-2` 두 건. HWP·HWPX 본문 추출은 해결됨
7. **hwpx 산출**, **PPT 템플릿 실물 반영**(구도 추천의 칸 구성)
8. **LLM 적용 지점** — 발췌문 → 개조식 문서 문장 재서술, 헤드라인 초안, 제안요청서에서 검색어 추출, 검토 화면 대화(A안). 차단 규칙: 문장마다 카드 id 필수 + `missingNumbers`로 숫자 대조 → 불일치 차단 + 화면에서 AI 문장 구분 표시. 발췌·검증은 규칙 기반 유지. 붙일 때 환경변수 이름을 `.env.example`과 이 문서에 추가
9. **`/flow` 탭** — 업무 플로우 다이어그램 페이지. 배포 용량 제약 때문에 뺐던 것이라 지금은 넣어도 된다. 넣기 전까지는 README 구성표의 `/flow` 행이 실제와 다르다

**확인된 사실 (2026-09-21 실호출)**

- 공고번호 조회는 `getBidPblancListInfoServc` + `inqryDiv=2` + `bidNtceNo`. 공고번호 형식은 `R26BK01699546`. 응답 한 건에 113개 필드, 첨부는 `ntceSpecFileNm1~10` / `ntceSpecDocUrl1~10`. hwp와 pdf가 함께 올라오는 경우가 많다
- `public_inst/list` 응답은 `result[]`가 평평한 객체 배열이고 `resultCode`는 숫자 200. KERIS → 교육부, 한국과학창의재단 → 과학기술정보통신부로 확인. 대학·교육청은 0건

**미해결 질문**

- 지자체·부처 소속기관처럼 규칙에도 API에도 안 걸리는 발주처의 계보를 무엇으로 채울 것인가 (지금은 "상위 기관을 찾지 못했습니다"로 표시하고 전체 문서 검색으로 넘긴다)
- LLM을 언제, 어느 API로 붙일 것인가 (2026-09-21 기준 보류). 기획서 "AI 활용 방안"(임베딩 의미 검색, 생성 단계 그라운딩)은 LLM을 전제로 적혀 있다

---

## 9. 참고 파일 위치

| 자료 | 위치 |
|---|---|
| 과제기획서 최신본 | `[KMA-교육]/4. 과제기획서_Policy Fit_수정중_0908.hwpx` |
| 정책문서 코퍼스 | `[KMA-교육]/정책문서/` (15건 26개 파일) |
| 공공데이터포털 API 현황 | `공공데이터포털_API_현황.xlsx` — **인증키가 평문으로 들어있다. 커밋 금지** |
| 알리오플러스 API 가이드 | `알리오 플러스 API 가이드 1.6.pdf` (레포 밖 보관) |
| 디자인 토큰 | `[KMA-교육]/DESIGN.md` — 프로토타입이 이 팔레트를 쓴다 (violet `#7353EA`, ink `#191F28`, hairline `#E9EBF0`) |
