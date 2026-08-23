# Iter 부하테스트 실행 안내

성능 개선 전후의 API 처리량, 응답시간, 자원 사용량과 동시성 정합성을 같은 조건에서 비교하기 위한 k6 테스트 환경이다.

## 구성

```text
performance/
├── config/        # 복사해서 사용하는 로컬 환경변수 예제
├── docs/          # 테스트 계획과 최종 보고서
├── lib/           # k6 공통 설정·인증·검증 코드
├── monitoring/    # Prometheus·Grafana 구성
├── optimization/  # 인덱스 적용·롤백·EXPLAIN SQL
├── results/       # k6 원본 JSON, Git 제외
├── scenarios/     # k6 실행 시나리오
├── scripts/       # 환경 점검과 Smoke 실행 도우미
└── seed/          # 테스트 데이터 생성·검증 SQL
```

## 1. 준비 사항

- JDK 21
- MySQL 8 이상
- k6
- Docker Desktop
- 성능 테스트 전용 DB `iter_perf`

실제 비밀번호, JWT, 토큰, DB dump는 저장소에 커밋하지 않는다.

공개된 성능 테스트 계정의 원문 비밀번호는 `PerfTest123!`이다. 로컬 `iter_perf` 데이터에만 사용하며 실제 서비스 계정에는 재사용하지 않는다.

## 2. 로컬 설정

예제 환경변수 파일과 테스트 계정 해시를 로컬 전용 경로로 복사한다.

```powershell
Copy-Item performance/config/perf-env.example.ps1 performance/config/perf-env.local.ps1

New-Item -ItemType Directory -Force performance/seed/local
Copy-Item performance/seed/credentials.example.sql performance/seed/local/credentials.sql
```

`performance/config/perf-env.local.ps1`에서 `PERF_DB_USERNAME`, `PERF_DB_PASSWORD`를 자신의 MySQL 계정으로 변경한 후 현재 PowerShell에 적용한다.

```powershell
. .\performance\config\perf-env.local.ps1
.\performance\scripts\check-environment.ps1
```

`perf-env.local.ps1`, `credentials.sql`은 Git에서 제외된다.

## 3. 성능 DB와 테스트 데이터 생성

처음 사용하는 빈 DB라면 `iter_perf`를 생성하고 애플리케이션을 `update` 모드로 한 번 기동하여 현재 엔티티 기준 스키마를 준비한다.

```sql
CREATE DATABASE IF NOT EXISTS iter_perf
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;
```

```powershell
$env:PERF_DDL_AUTO = "update"
.\gradlew.bat bootRun
```

서버가 정상적으로 시작되면 종료하고 이후 측정에서는 기본값 `validate`를 사용한다.

```powershell
Remove-Item Env:PERF_DDL_AUTO -ErrorAction SilentlyContinue
```

애플리케이션을 중지한 상태에서 MySQL에 접속하고 프로젝트 루트 기준으로 실행한다.

```sql
USE iter_perf;
SOURCE performance/seed/sql/run-users-equipment.sql;
SOURCE performance/seed/sql/run-rentals-evidence.sql;
SOURCE performance/seed/sql/run-payments-reports-actions.sql;
```

각 runner는 초기화, 데이터 생성, 검증을 순서대로 실행한다. 상세 준비 과정과 fixture ID는 `seed/README.md`에서 확인한다.

쿼리 최적화 적용 후 결과를 측정할 때만 인덱스 스크립트를 추가 실행한다.

```sql
SOURCE performance/optimization/sql/01-add-query-indexes.sql;
```

## 4. 애플리케이션 실행

새 PowerShell을 열었다면 로컬 설정을 다시 적용한다.

```powershell
. .\performance\config\perf-env.local.ps1
.\gradlew.bat bootRun
```

준비 상태를 확인한다.

```powershell
curl.exe http://localhost:8080/v3/api-docs
curl.exe http://localhost:9091/actuator/prometheus
```

## 5. 모니터링 실행

```powershell
docker compose -f performance/monitoring/compose.yml up -d
docker compose -f performance/monitoring/compose.yml ps
```

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`
- 대시보드: `Iter Performance/Iter Performance Overview`

k6 지표 전송 설정:

```powershell
$env:K6_PROMETHEUS_RW_SERVER_URL = "http://localhost:9090/api/v1/write"
$env:K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM = "true"
```

세부 내용은 `monitoring/README.md`에서 확인한다.

## 6. k6 공통 환경변수

기본 계정과 fixture ID는 `perf-env.example.ps1`에 준비되어 있다. 새 PowerShell에서는 `perf-env.local.ps1`을 다시 적용한다.

여러 사용자 계정을 사용한다면 `USER_EMAILS`, `USER_PASSWORDS`, `RENTAL_IDS`, `REPORT_IDS`의 순서를 동일하게 맞춘다. 거래와 신고 ID는 해당 순서 사용자의 소유 또는 조회 가능 데이터여야 한다.

## 7. 시나리오 실행

| 파일 | 목적 |
|---|---|
| `smoke.js` | 주요 API 기본 동작 확인 |
| `auth-session.js` | 로그인·CSRF·재발급·로그아웃 |
| `endpoint-baseline.js` | 단일 API 고정 RPS 측정 |
| `mixed-load.js` | 실제 비율의 사용자·관리자 혼합 조회 |
| `stress.js` | 단계별 RPS 상승 및 처리 한계 확인 |
| `spike.js` | 순간 부하와 회복 확인 |
| `soak.js` | 장시간 안정성 확인 |
| `concurrency.js` | 동일 자원 동시 요청 정합성 확인 |

기본 실행:

```powershell
.\performance\scripts\run-smoke.ps1
```

Prometheus 전송과 결과 JSON 저장을 포함한 실행:

```powershell
$runId = "mixed-before-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

k6 run `
  -o experimental-prometheus-rw `
  --tag testid=$runId `
  --summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)" `
  --summary-export "performance/results/$runId.json" `
  performance/scenarios/mixed-load.js

Write-Host "실행 ID: $runId"
```

Grafana 상단의 `Test ID`에서 같은 실행 ID를 선택한다.

## 8. 동시성 테스트 주의사항

동시성 테스트는 DB 상태를 변경하므로 격리된 `iter_perf`에서만 실행한다.

```powershell
$env:ALLOW_DESTRUCTIVE_WRITES = "true"
$env:CONCURRENCY_CASE = "report-duplicate"
$env:CONCURRENCY_VUS = "50"

k6 run performance/scenarios/concurrency.js
```

지원 값:

```text
report-duplicate
rental-create-overlap
return-confirmation
rental-approval
admin-user-status
admin-equipment-status
admin-report-status
```

각 실행 전 DB snapshot을 복원하거나 해당 fixture를 초기 상태로 되돌린다.

## 9. 재측정 원칙

- 동일 커밋과 DB snapshot을 사용한다.
- JVM, HikariCP, MySQL, PC 전원 설정을 동일하게 유지한다.
- 개선 항목은 한 번에 하나만 변경한다.
- 대표 실행에는 고유한 `testid`를 사용한다.
- 오류율, Dropped iteration, p95·p99, CPU, Heap, Hikari active·pending을 함께 비교한다.
- Stress와 Soak에는 재로그인이 가능한 계정 정보를 제공한다.

## 문서

- 테스트 설계: `docs/test-plan.md`
- 최종 결과와 개선 제안: `docs/final-report.md`
- seed 상세: `seed/README.md`
- 모니터링 상세: `monitoring/README.md`
- 쿼리·인덱스 최적화 결과: `docs/query-optimization-report.md`
- 관리자 목록 커서 페이지네이션: `docs/admin-keyset-pagination.md`
