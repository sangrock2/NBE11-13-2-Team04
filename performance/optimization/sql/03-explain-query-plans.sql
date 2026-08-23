-- 대표 조회의 실행 계획을 같은 조건으로 비교합니다.
-- SELECT에는 EXPLAIN ANALYZE를, 데이터가 바뀔 수 있는 UPDATE에는 EXPLAIN만 사용합니다.
USE iter_perf;

SELECT DATABASE() AS target_database, VERSION() AS mysql_version;

-- 1. 공개 장비 최신순
EXPLAIN ANALYZE
SELECT e.id, e.created_at, e.daily_price
FROM equipment e
WHERE e.status = 'ACTIVE'
ORDER BY e.created_at DESC, e.id DESC
LIMIT 20;

-- 2. 공개 장비 기간 검색
EXPLAIN ANALYZE
SELECT e.id, e.created_at, e.daily_price
FROM equipment e
WHERE e.status = 'ACTIVE'
  AND e.available_from <= '2026-09-01'
  AND e.available_to >= '2026-09-03'
  AND NOT EXISTS (
      SELECT 1
      FROM rental r
      WHERE r.equipment_id = e.id
        AND r.status NOT IN ('CANCELED', 'REJECTED', 'COMPLETED')
        AND r.start_date <= '2026-09-03'
        AND r.end_date >= '2026-09-01'
  )
ORDER BY e.created_at DESC, e.id DESC
LIMIT 20;

-- 3. 빌린 장비 이력과 count
EXPLAIN ANALYZE
SELECT r.*
FROM rental r
WHERE r.renter_id = 2
ORDER BY r.created_at DESC, r.id DESC
LIMIT 20;

EXPLAIN ANALYZE
SELECT COUNT(r.id)
FROM rental r
WHERE r.renter_id = 2;

-- 4. 빌려준 장비 이력과 count
EXPLAIN ANALYZE
SELECT r.*
FROM rental r
JOIN equipment e ON e.id = r.equipment_id
WHERE e.owner_id = 3
ORDER BY r.created_at DESC, r.id DESC
LIMIT 20;

EXPLAIN ANALYZE
SELECT COUNT(r.id)
FROM rental r
JOIN equipment e ON e.id = r.equipment_id
WHERE e.owner_id = 3;

-- 5. 대여 기간 충돌: 첫 ID만 조회
EXPLAIN ANALYZE
SELECT r.id
FROM rental r
WHERE r.equipment_id = 250
  AND r.status NOT IN ('CANCELED', 'REJECTED', 'COMPLETED')
  AND r.start_date <= '2026-08-18'
  AND r.end_date >= '2026-08-11'
LIMIT 1;

-- 6. 내 신고 목록과 처리 중인 동일 대상 신고
EXPLAIN ANALYZE
SELECT r.*
FROM report r
WHERE r.reporter_id = 33
ORDER BY r.created_at DESC, r.id DESC
LIMIT 20;

EXPLAIN ANALYZE
SELECT r.id
FROM report r
WHERE r.reporter_id = 2
  AND r.target_type = 'EQUIPMENT'
  AND r.target_id = 3
  AND r.status IN ('RECEIVED', 'UNDER_REVIEW')
LIMIT 1;

-- 7. 전체/미읽음 알림 목록과 미읽음 count
EXPLAIN ANALYZE
SELECT n.*
FROM notification n
WHERE n.receiver_id = 21
ORDER BY n.created_at DESC, n.id DESC
LIMIT 20;

EXPLAIN ANALYZE
SELECT n.*
FROM notification n
WHERE n.receiver_id = 21
  AND n.is_read = FALSE
ORDER BY n.created_at DESC, n.id DESC
LIMIT 20;

EXPLAIN ANALYZE
SELECT COUNT(n.id)
FROM notification n
WHERE n.receiver_id = 21
  AND n.is_read = FALSE;

-- 8. 관리자 회원 커서 목록: 첫 페이지와 다음 페이지
EXPLAIN ANALYZE
SELECT u.*
FROM users u
WHERE u.status = 'ACTIVE'
ORDER BY u.created_at DESC, u.id DESC
LIMIT 21;

SELECT u.created_at, u.id
INTO @user_cursor_created_at, @user_cursor_id
FROM users u
WHERE u.status = 'ACTIVE'
ORDER BY u.created_at DESC, u.id DESC
LIMIT 19, 1;

EXPLAIN ANALYZE
SELECT u.*
FROM users u
WHERE u.status = 'ACTIVE'
  AND (
      u.created_at < @user_cursor_created_at
      OR (u.created_at = @user_cursor_created_at AND u.id < @user_cursor_id)
  )
ORDER BY u.created_at DESC, u.id DESC
LIMIT 21;

-- 9. 관리자 장비 커서 목록
SELECT e.created_at, e.id
INTO @equipment_cursor_created_at, @equipment_cursor_id
FROM equipment e
WHERE e.status = 'ACTIVE'
ORDER BY e.created_at DESC, e.id DESC
LIMIT 19, 1;

EXPLAIN ANALYZE
SELECT e.*
FROM equipment e
WHERE e.status = 'ACTIVE'
  AND (
      e.created_at < @equipment_cursor_created_at
      OR (e.created_at = @equipment_cursor_created_at AND e.id < @equipment_cursor_id)
  )
ORDER BY e.created_at DESC, e.id DESC
LIMIT 21;

-- 10. 관리자 신고 커서 목록
SELECT r.created_at, r.id
INTO @report_cursor_created_at, @report_cursor_id
FROM report r
WHERE r.status = 'RECEIVED'
  AND r.target_type = 'EQUIPMENT'
ORDER BY r.created_at DESC, r.id DESC
LIMIT 19, 1;

EXPLAIN ANALYZE
SELECT r.*
FROM report r
WHERE r.status = 'RECEIVED'
  AND r.target_type = 'EQUIPMENT'
  AND (
      r.created_at < @report_cursor_created_at
      OR (r.created_at = @report_cursor_created_at AND r.id < @report_cursor_id)
  )
ORDER BY r.created_at DESC, r.id DESC
LIMIT 21;

-- 11. 관리자 결제 커서 목록
SELECT p.created_at, p.id
INTO @payment_cursor_created_at, @payment_cursor_id
FROM payment p
WHERE p.status = 'PAID'
ORDER BY p.created_at DESC, p.id DESC
LIMIT 19, 1;

EXPLAIN ANALYZE
SELECT p.id,
       p.rental_id,
       p.order_id,
       r.renter_id,
       u.email,
       u.name,
       u.nick_name,
       r.product_name_snapshot,
       p.amount,
       p.status,
       r.status,
       p.paid_at,
       p.refunded_at,
       p.created_at
FROM payment p
JOIN rental r ON p.rental_id = r.id
JOIN users u ON r.renter_id = u.id
WHERE p.status = 'PAID'
  AND (
      p.created_at < @payment_cursor_created_at
      OR (p.created_at = @payment_cursor_created_at AND p.id < @payment_cursor_id)
  )
ORDER BY p.created_at DESC, p.id DESC
LIMIT 21;

-- 12. 관리자 처리 이력 커서 목록
SELECT a.created_at, a.id
INTO @action_cursor_created_at, @action_cursor_id
FROM admin_action a
WHERE a.target_type = 'USER'
ORDER BY a.created_at DESC, a.id DESC
LIMIT 19, 1;

EXPLAIN ANALYZE
SELECT a.*
FROM admin_action a
WHERE a.target_type = 'USER'
  AND (
      a.created_at < @action_cursor_created_at
      OR (a.created_at = @action_cursor_created_at AND a.id < @action_cursor_id)
  )
ORDER BY a.created_at DESC, a.id DESC
LIMIT 21;

-- 13. 미결제 만료 갱신은 실행하지 않고 예상 계획만 확인합니다.
EXPLAIN
UPDATE rental r
SET r.status = 'CANCELED'
WHERE r.status = 'PENDING'
  AND r.created_at < '2026-08-23 00:00:00';
