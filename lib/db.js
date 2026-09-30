import pg from 'pg';

// 계정별 최근 검색·저장된 작업(STEP57). Vercel에 연결한 Neon Postgres의 DATABASE_URL(연결 풀 주소)을 쓴다.
// 주소가 없으면(로컬 시험 등) dbReady()가 false이고, 화면은 브라우저 저장만 쓴다.
// 받는 정보·보관 방식을 바꾸면 /privacy를 먼저 고친다.
const URL_ = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let pool = null, ready = null;

export function dbReady() { return !!URL_; }

function getPool() {
  if (!pool) pool = new pg.Pool({ connectionString: URL_, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 });
  return pool;
}

// 표는 처음 부를 때 만든다(인스턴스마다 한 번)
async function init() {
  if (!ready) {
    ready = getPool().query(`
      CREATE TABLE IF NOT EXISTS pf_recent (
        email text PRIMARY KEY,
        list jsonb NOT NULL DEFAULT '[]',
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS pf_work (
        email text NOT NULL,
        key text NOT NULL,
        at bigint NOT NULL,
        step text,
        sel int,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (email, key)
      );`).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export async function query(sql, params) {
  await init();
  return getPool().query(sql, params);
}
