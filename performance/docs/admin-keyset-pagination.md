# 관리자 목록 커서 페이지네이션

## 적용 API

| 기능 | API |
|---|---|
| 회원 | `GET /api/v1/admin/users` |
| 장비 | `GET /api/v1/admin/equipment` |
| 신고 | `GET /api/v1/admin/reports` |
| 결제 | `GET /api/v1/admin/payments` |
| 처리 이력 | `GET /api/v1/admin/actions` |

상세 조회와 상태 변경 API, 일반 사용자 목록 API는 변경하지 않았다.

## 요청과 응답

첫 요청은 `cursor`를 생략한다.

```http
GET /api/v1/admin/users?status=ACTIVE&size=20
```

다음 요청은 응답의 `nextCursor`와 기존 검색 조건을 그대로 전달한다.

```http
GET /api/v1/admin/users?status=ACTIVE&size=20&cursor={nextCursor}
```

- `cursor`: 선택, 최대 200자
- `size`: 기본 20, 최소 1, 최대 100

```json
{
  "content": [],
  "nextCursor": "MjAyNi0wOC0yMFQxMjozNDo1Nnw…",
  "hasNext": true,
  "size": 20
}
```

마지막 페이지는 `hasNext=false`, `nextCursor=null`이다. `page`, `totalElements`, `totalPages`는 반환하지 않는다.

## 동작 방식

- 고정 정렬: `createdAt DESC, id DESC`
- 커서 값: 마지막 행의 `createdAt`, `id`
- 인코딩: URL-safe Base64
- 조회량: `size + 1`
- 전체 count 쿼리: 없음

다음 페이지 조건:

```sql
created_at < :cursorCreatedAt
OR (created_at = :cursorCreatedAt AND id < :cursorId)
```

`id` 보조 정렬로 생성 시각이 같은 행도 중복 없이 이어서 조회한다. 잘못된 커서는 `400 Bad Request`를 반환한다.

## 제한사항

- 임의 페이지 번호 이동과 전체 페이지 수 표시는 지원하지 않는다.
- 다음 요청에서도 동일한 검색 조건을 사용해야 한다.
- 커서는 인증 정보가 아니며 Spring Security 권한 검사는 그대로 적용된다.
- 조회 중 데이터의 상태나 검색 필드가 바뀌면 결과가 나타나거나 사라질 수 있다. 커서 조회는 DB 스냅샷을 제공하지 않는다.

## 인덱스와 측정

필터 및 `created_at, id` 정렬에 맞춘 인덱스를 엔티티 `@Table(indexes = ...)`에 선언했다. 기존 DB가 `ddl-auto=validate`라면 자동 생성되지 않으므로 DB 마이그레이션이 필요하다.

성능 DB 적용·확인 파일:

- `performance/optimization/sql/01-add-query-indexes.sql`
- `performance/optimization/sql/03-explain-query-plans.sql`

관리자 목록의 다음 페이지를 단독 측정할 때:

```powershell
$env:ADMIN_CURSOR = "<nextCursor>"
$env:BASELINE_ENDPOINT = "admin-payments"
k6 run performance/scenarios/endpoint-baseline.js
```
