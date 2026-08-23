-- 쿼리 최적화 전후 비교용 인덱스입니다.
-- 안전을 위해 성능 테스트 DB(iter_perf)에서만 실행됩니다.
USE iter_perf;

DELIMITER //

DROP PROCEDURE IF EXISTS apply_query_optimization_indexes//
CREATE PROCEDURE apply_query_optimization_indexes()
BEGIN
    IF DATABASE() <> 'iter_perf' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Query optimization indexes can only be applied to iter_perf.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'users'
          AND index_name = 'idx_users_created_id'
    ) THEN
        CREATE INDEX idx_users_created_id
            ON users (created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'users'
          AND index_name = 'idx_users_status_created_id'
    ) THEN
        CREATE INDEX idx_users_status_created_id
            ON users (status, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'equipment'
          AND index_name = 'idx_equipment_created_id'
    ) THEN
        CREATE INDEX idx_equipment_created_id
            ON equipment (created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'equipment'
          AND index_name = 'idx_equipment_status_created_id'
    ) THEN
        CREATE INDEX idx_equipment_status_created_id
            ON equipment (status, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'equipment'
          AND index_name = 'idx_equipment_owner_created_id'
    ) THEN
        CREATE INDEX idx_equipment_owner_created_id
            ON equipment (owner_id, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'rental'
          AND index_name = 'idx_rental_renter_created_id'
    ) THEN
        CREATE INDEX idx_rental_renter_created_id
            ON rental (renter_id, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'rental'
          AND index_name = 'idx_rental_equipment_created_id'
    ) THEN
        CREATE INDEX idx_rental_equipment_created_id
            ON rental (equipment_id, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'rental'
          AND index_name = 'idx_rental_equipment_period'
    ) THEN
        CREATE INDEX idx_rental_equipment_period
            ON rental (equipment_id, start_date, end_date, id, status);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'rental'
          AND index_name = 'idx_rental_status_created'
    ) THEN
        CREATE INDEX idx_rental_status_created
            ON rental (status, created_at);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'payment'
          AND index_name = 'idx_payment_created_id'
    ) THEN
        CREATE INDEX idx_payment_created_id
            ON payment (created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'payment'
          AND index_name = 'idx_payment_status_created_id'
    ) THEN
        CREATE INDEX idx_payment_status_created_id
            ON payment (status, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'report'
          AND index_name = 'idx_report_created_id'
    ) THEN
        CREATE INDEX idx_report_created_id
            ON report (created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'report'
          AND index_name = 'idx_report_status_target_created_id'
    ) THEN
        CREATE INDEX idx_report_status_target_created_id
            ON report (status, target_type, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'report'
          AND index_name = 'idx_report_reporter_created_id'
    ) THEN
        CREATE INDEX idx_report_reporter_created_id
            ON report (reporter_id, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'report'
          AND index_name = 'idx_report_active_target'
    ) THEN
        CREATE INDEX idx_report_active_target
            ON report (reporter_id, target_type, target_id, status);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'notification'
          AND index_name = 'idx_notification_receiver_created_id'
    ) THEN
        CREATE INDEX idx_notification_receiver_created_id
            ON notification (receiver_id, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'notification'
          AND index_name = 'idx_notification_receiver_read_created_id'
    ) THEN
        CREATE INDEX idx_notification_receiver_read_created_id
            ON notification (receiver_id, is_read, created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'admin_action'
          AND index_name = 'idx_admin_action_created_id'
    ) THEN
        CREATE INDEX idx_admin_action_created_id
            ON admin_action (created_at DESC, id DESC);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'admin_action'
          AND index_name = 'idx_admin_action_target_created_id'
    ) THEN
        CREATE INDEX idx_admin_action_target_created_id
            ON admin_action (
                target_type,
                target_id,
                action,
                created_at DESC,
                id DESC
            );
    END IF;
END//

DELIMITER ;

CALL apply_query_optimization_indexes();
DROP PROCEDURE apply_query_optimization_indexes;

SHOW INDEX FROM users;
SHOW INDEX FROM equipment;
SHOW INDEX FROM rental;
SHOW INDEX FROM payment;
SHOW INDEX FROM report;
SHOW INDEX FROM notification;
SHOW INDEX FROM admin_action;
