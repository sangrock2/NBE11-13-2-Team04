-- 01-add-query-indexes.sql로 추가한 성능 테스트용 인덱스만 제거합니다.
-- 데이터는 변경하지 않으며, iter_perf에서만 실행됩니다.
USE iter_perf;

DELIMITER //

DROP PROCEDURE IF EXISTS drop_query_optimization_indexes//
CREATE PROCEDURE drop_query_optimization_indexes()
BEGIN
    IF DATABASE() <> 'iter_perf' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Query optimization indexes can only be removed from iter_perf.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'users'
          AND index_name = 'idx_users_created_id'
    ) THEN
        DROP INDEX idx_users_created_id ON users;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'users'
          AND index_name = 'idx_users_status_created_id'
    ) THEN
        DROP INDEX idx_users_status_created_id ON users;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'equipment'
          AND index_name = 'idx_equipment_created_id'
    ) THEN
        DROP INDEX idx_equipment_created_id ON equipment;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'equipment'
          AND index_name = 'idx_equipment_status_created_id'
    ) THEN
        DROP INDEX idx_equipment_status_created_id ON equipment;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'equipment'
          AND index_name = 'idx_equipment_owner_created_id'
    ) THEN
        DROP INDEX idx_equipment_owner_created_id ON equipment;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'rental'
          AND index_name = 'idx_rental_renter_created_id'
    ) THEN
        DROP INDEX idx_rental_renter_created_id ON rental;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'rental'
          AND index_name = 'idx_rental_equipment_created_id'
    ) THEN
        DROP INDEX idx_rental_equipment_created_id ON rental;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'rental'
          AND index_name = 'idx_rental_equipment_period'
    ) THEN
        DROP INDEX idx_rental_equipment_period ON rental;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'rental'
          AND index_name = 'idx_rental_status_created'
    ) THEN
        DROP INDEX idx_rental_status_created ON rental;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'payment'
          AND index_name = 'idx_payment_created_id'
    ) THEN
        DROP INDEX idx_payment_created_id ON payment;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'payment'
          AND index_name = 'idx_payment_status_created_id'
    ) THEN
        DROP INDEX idx_payment_status_created_id ON payment;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'report'
          AND index_name = 'idx_report_created_id'
    ) THEN
        DROP INDEX idx_report_created_id ON report;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'report'
          AND index_name = 'idx_report_status_target_created_id'
    ) THEN
        DROP INDEX idx_report_status_target_created_id ON report;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'report'
          AND index_name = 'idx_report_reporter_created_id'
    ) THEN
        DROP INDEX idx_report_reporter_created_id ON report;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'report'
          AND index_name = 'idx_report_active_target'
    ) THEN
        DROP INDEX idx_report_active_target ON report;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'notification'
          AND index_name = 'idx_notification_receiver_created_id'
    ) THEN
        DROP INDEX idx_notification_receiver_created_id ON notification;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'notification'
          AND index_name = 'idx_notification_receiver_read_created_id'
    ) THEN
        DROP INDEX idx_notification_receiver_read_created_id ON notification;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'admin_action'
          AND index_name = 'idx_admin_action_created_id'
    ) THEN
        DROP INDEX idx_admin_action_created_id ON admin_action;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'admin_action'
          AND index_name = 'idx_admin_action_target_created_id'
    ) THEN
        DROP INDEX idx_admin_action_target_created_id ON admin_action;
    END IF;
END//

DELIMITER ;

CALL drop_query_optimization_indexes();
DROP PROCEDURE drop_query_optimization_indexes;
