import { fail } from 'k6';
import http from 'k6/http';
import { authorizationHeaders, requestLogin, resolveAccessToken } from '../lib/auth.js';
import { apiUrl, config, requireEnv } from '../lib/config.js';
import {
    expectAccessToken,
    expectCondition,
    expectCursorPage,
    expectJson,
    expectPage,
    expectStatus,
} from '../lib/checks.js';

const endpoint = config.baseline.endpoint;

export const options = {
    scenarios: {
        endpoint_baseline: {
            executor: 'constant-arrival-rate',
            rate: config.baseline.rate,
            timeUnit: '1s',
            duration: config.baseline.duration,
            preAllocatedVUs: config.baseline.preAllocatedVUs,
            maxVUs: config.baseline.maxVUs,
            gracefulStop: '30s',
        },
    },
    thresholds: {
        checks: [`rate>${config.thresholds.checkRate}`],
        http_req_failed: [`rate<${config.thresholds.errorRate}`],
        http_req_duration: [`p(95)<${config.thresholds.p95Ms}`],
        dropped_iterations: ['count==0'],
    },
};

const supportedEndpoints = new Set([
    'login-user',
    'login-admin',
    'equipment-list',
    'equipment-detail',
    'equipment-availability',
    'equipment-estimate',
    'my-equipment',
    'payment-history',
    'notifications',
    'notification-unread-count',
    'rental-borrowed',
    'rental-borrowed-overdue',
    'rental-lent',
    'rental-lent-overdue',
    'rental-returns',
    'rental-return-comparison',
    'rental-detail',
    'reports-me',
    'report-detail',
    'admin-users',
    'admin-equipment',
    'admin-reports',
    'admin-actions',
    'admin-payments',
    'admin-payment-detail',
    'payment-ready',
]);

const userReadEndpoints = new Set([
    'my-equipment',
    'payment-history',
    'notifications',
    'notification-unread-count',
    'rental-borrowed',
    'rental-borrowed-overdue',
    'rental-lent',
    'rental-lent-overdue',
    'rental-returns',
    'rental-return-comparison',
    'rental-detail',
    'reports-me',
    'report-detail',
]);

const adminReadEndpoints = new Set([
    'admin-users',
    'admin-equipment',
    'admin-reports',
    'admin-actions',
    'admin-payments',
    'admin-payment-detail',
]);

function requireId(name, value) {
    if (value === null) {
        throw new Error(`${name} environment variable is required for endpoint ${endpoint}.`);
    }

    return value;
}

function readParams(accessToken, name) {
    return {
        headers: authorizationHeaders(accessToken),
        tags: { name },
        timeout: config.requestTimeout,
    };
}

export function setup() {
    if (!supportedEndpoints.has(endpoint)) {
        fail(
            `Unsupported BASELINE_ENDPOINT=${endpoint}. Supported values: ${Array.from(supportedEndpoints).join(', ')}`,
        );
    }

    if (endpoint === 'login-user') {
        requireEnv('USER_EMAIL', config.credentials.user.email);
        requireEnv('USER_PASSWORD', config.credentials.user.password);
        return {};
    }

    if (endpoint === 'login-admin') {
        requireEnv('ADMIN_EMAIL', config.credentials.admin.email);
        requireEnv('ADMIN_PASSWORD', config.credentials.admin.password);
        return {};
    }

    if (
        endpoint === 'equipment-detail'
        || endpoint === 'equipment-availability'
        || endpoint === 'equipment-estimate'
    ) {
        requireId('EQUIPMENT_ID', config.ids.equipmentId);
        return {};
    }

    if (endpoint === 'rental-detail' || endpoint === 'rental-return-comparison') {
        requireId('RENTAL_ID', config.ids.rentalId);
    }

    if (endpoint === 'report-detail') {
        requireId('REPORT_ID', config.ids.reportId);
    }

    if (endpoint === 'admin-payment-detail') {
        requireId('PAYMENT_ID', config.ids.paymentId);
    }

    if (userReadEndpoints.has(endpoint)) {
        return { userToken: resolveAccessToken(config.credentials.user, 'user') };
    }

    if (adminReadEndpoints.has(endpoint)) {
        return { adminToken: resolveAccessToken(config.credentials.admin, 'admin') };
    }

    if (endpoint === 'payment-ready') {
        if (!config.baseline.allowMutating) {
            fail('payment-ready changes database state. Run it only with ALLOW_MUTATING=true.');
        }
        requireId('RENTAL_ID', config.ids.rentalId);
        return { userToken: resolveAccessToken(config.credentials.user, 'user') };
    }

    return {};
}

function runLogin(credentials, label) {
    const response = requestLogin(credentials, label);
    expectAccessToken(response, `${label} login`);
}

function runEquipmentList() {
    const response = http.get(
        apiUrl('/api/v1/devices', {
            page: config.paging.page,
            size: config.paging.size,
        }),
        {
            headers: { Accept: 'application/json' },
            tags: { name: 'GET /api/v1/devices' },
            timeout: config.requestTimeout,
        },
    );
    expectStatus(response, 200, 'equipment list');
    expectPage(response, 'equipment list');
}

function runEquipmentDetail() {
    const response = http.get(
        apiUrl(`/api/v1/devices/${config.ids.equipmentId}`),
        {
            headers: { Accept: 'application/json' },
            tags: { name: 'GET /api/v1/devices/{equipmentId}' },
            timeout: config.requestTimeout,
        },
    );
    expectStatus(response, 200, 'equipment detail');
    const body = expectJson(response, 'equipment detail');
    expectCondition(
        body?.id === config.ids.equipmentId,
        'equipment detail: requested id matches response',
    );
}

function futureDate(offsetDays) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
}

function runEquipmentAvailability() {
    const response = http.get(
        apiUrl(`/api/v1/devices/${config.ids.equipmentId}/availability`, {
            startDate: futureDate(30),
            endDate: futureDate(33),
        }),
        {
            headers: { Accept: 'application/json' },
            tags: { name: 'GET /api/v1/devices/{equipmentId}/availability' },
            timeout: config.requestTimeout,
        },
    );
    expectStatus(response, 200, 'equipment availability');
    const body = expectJson(response, 'equipment availability');
    expectCondition(
        body?.equipmentId === config.ids.equipmentId
            && typeof body?.available === 'boolean',
        'equipment availability: equipment and availability are valid',
    );
}

function runEquipmentEstimate() {
    const response = http.get(
        apiUrl(`/api/v1/devices/${config.ids.equipmentId}/estimate`, {
            startDate: futureDate(30),
            endDate: futureDate(33),
        }),
        {
            headers: { Accept: 'application/json' },
            tags: { name: 'GET /api/v1/devices/{equipmentId}/estimate' },
            timeout: config.requestTimeout,
        },
    );
    expectStatus(response, 200, 'equipment estimate');
    const body = expectJson(response, 'equipment estimate');
    expectCondition(
        body?.equipmentId === config.ids.equipmentId
            && Number(body?.rentalDays) > 0
            && Number(body?.totalPrice) > 0,
        'equipment estimate: equipment, rental days, and price are valid',
    );
}

function runUserPage(path, name, accessToken, query = {}) {
    const response = http.get(
        apiUrl(path, {
            ...query,
            page: config.paging.page,
            size: config.paging.size,
        }),
        readParams(accessToken, name),
    );
    expectStatus(response, 200, name);
    expectPage(response, name);
}

function runUnreadCount(accessToken) {
    const response = http.get(
        apiUrl('/api/v1/notifications/unread-count'),
        readParams(accessToken, 'GET /api/v1/notifications/unread-count'),
    );
    expectStatus(response, 200, 'notification unread count');
    const body = expectJson(response, 'notification unread count');
    expectCondition(
        Number.isInteger(body?.unreadCount) && body.unreadCount >= 0,
        'notification unread count: value is a non-negative integer',
    );
}

function runRentalPage(path, name, accessToken) {
    const response = http.get(
        apiUrl(path, {
            page: config.paging.page,
            size: config.paging.size,
        }),
        readParams(accessToken, name),
    );
    expectStatus(response, 200, name);
    expectPage(response, name);
}

function runAdminCursorPage(path, name, accessToken) {
    const response = http.get(
        apiUrl(path, {
            cursor: __ENV.ADMIN_CURSOR || null,
            size: config.paging.size,
        }),
        readParams(accessToken, name),
    );
    expectStatus(response, 200, name);
    expectCursorPage(response, name);
}

function runRentalDetail(accessToken) {
    const response = http.get(
        apiUrl(`/api/v1/rentals/${config.ids.rentalId}`),
        readParams(accessToken, 'GET /api/v1/rentals/{rentalId}'),
    );
    expectStatus(response, 200, 'rental detail');
    const body = expectJson(response, 'rental detail');
    expectCondition(
        body?.rentalId === config.ids.rentalId,
        'rental detail: requested id matches response',
    );
}

function runReturnComparison(accessToken) {
    const response = http.get(
        apiUrl(`/api/v1/rentals/${config.ids.rentalId}/return-comparison`),
        readParams(accessToken, 'GET /api/v1/rentals/{rentalId}/return-comparison'),
    );
    expectStatus(response, 200, 'rental return comparison');
    const body = expectJson(response, 'rental return comparison');
    expectCondition(
        body?.rentalId === config.ids.rentalId,
        'rental return comparison: requested id matches response',
    );
}

function runReportDetail(accessToken) {
    const response = http.get(
        apiUrl(`/api/v1/reports/${config.ids.reportId}`),
        readParams(accessToken, 'GET /api/v1/reports/{reportId}'),
    );
    expectStatus(response, 200, 'report detail');
    const body = expectJson(response, 'report detail');
    expectCondition(
        body?.reportId === config.ids.reportId,
        'report detail: requested id matches response',
    );
}

function runAdminPayments(accessToken) {
    runAdminCursorPage(
        '/api/v1/admin/payments',
        'GET /api/v1/admin/payments',
        accessToken,
    );
}

function runAdminPaymentDetail(accessToken) {
    const response = http.get(
        apiUrl(`/api/v1/admin/payments/${config.ids.paymentId}`),
        readParams(accessToken, 'GET /api/v1/admin/payments/{paymentId}'),
    );
    expectStatus(response, 200, 'admin payment detail');
    const body = expectJson(response, 'admin payment detail');
    expectCondition(
        body?.payment?.paymentId === config.ids.paymentId,
        'admin payment detail: requested id matches response',
    );
}

function runPaymentReady(accessToken) {
    const response = http.post(
        apiUrl(`/api/v1/rentals/${config.ids.rentalId}/payment/ready`),
        null,
        {
            headers: authorizationHeaders(accessToken),
            tags: { name: 'POST /api/v1/rentals/{rentalId}/payment/ready' },
            timeout: config.requestTimeout,
        },
    );
    expectStatus(response, 200, 'payment ready');
    const body = expectJson(response, 'payment ready');
    expectCondition(
        body?.rentalId === config.ids.rentalId &&
            typeof body?.orderId === 'string' &&
            body.orderId.length > 0,
        'payment ready: rentalId and orderId are valid',
    );
}

export default function (data) {
    switch (endpoint) {
        case 'login-user':
            runLogin(config.credentials.user, 'user');
            break;
        case 'login-admin':
            runLogin(config.credentials.admin, 'admin');
            break;
        case 'equipment-list':
            runEquipmentList();
            break;
        case 'equipment-detail':
            runEquipmentDetail();
            break;
        case 'equipment-availability':
            runEquipmentAvailability();
            break;
        case 'equipment-estimate':
            runEquipmentEstimate();
            break;
        case 'my-equipment':
            runUserPage(
                '/api/v1/users/me/devices',
                'GET /api/v1/users/me/devices',
                data.userToken,
            );
            break;
        case 'payment-history':
            runUserPage(
                '/api/v1/users/me/payments',
                'GET /api/v1/users/me/payments',
                data.userToken,
            );
            break;
        case 'notifications':
            runUserPage(
                '/api/v1/notifications',
                'GET /api/v1/notifications',
                data.userToken,
                { unreadOnly: false },
            );
            break;
        case 'notification-unread-count':
            runUnreadCount(data.userToken);
            break;
        case 'rental-borrowed':
            runRentalPage(
                '/api/v1/rentals/borrowed',
                'GET /api/v1/rentals/borrowed',
                data.userToken,
            );
            break;
        case 'rental-borrowed-overdue':
            runRentalPage(
                '/api/v1/rentals/borrowed/overdue',
                'GET /api/v1/rentals/borrowed/overdue',
                data.userToken,
            );
            break;
        case 'rental-lent':
            runRentalPage(
                '/api/v1/rentals/lent',
                'GET /api/v1/rentals/lent',
                data.userToken,
            );
            break;
        case 'rental-lent-overdue':
            runRentalPage(
                '/api/v1/rentals/lent/overdue',
                'GET /api/v1/rentals/lent/overdue',
                data.userToken,
            );
            break;
        case 'rental-returns':
            runRentalPage(
                '/api/v1/rentals/returns',
                'GET /api/v1/rentals/returns',
                data.userToken,
            );
            break;
        case 'rental-return-comparison':
            runReturnComparison(data.userToken);
            break;
        case 'rental-detail':
            runRentalDetail(data.userToken);
            break;
        case 'reports-me':
            runRentalPage(
                '/api/v1/reports/me',
                'GET /api/v1/reports/me',
                data.userToken,
            );
            break;
        case 'report-detail':
            runReportDetail(data.userToken);
            break;
        case 'admin-users':
            runAdminCursorPage(
                '/api/v1/admin/users',
                'GET /api/v1/admin/users',
                data.adminToken,
            );
            break;
        case 'admin-equipment':
            runAdminCursorPage(
                '/api/v1/admin/equipment',
                'GET /api/v1/admin/equipment',
                data.adminToken,
            );
            break;
        case 'admin-reports':
            runAdminCursorPage(
                '/api/v1/admin/reports',
                'GET /api/v1/admin/reports',
                data.adminToken,
            );
            break;
        case 'admin-actions':
            runAdminCursorPage(
                '/api/v1/admin/actions',
                'GET /api/v1/admin/actions',
                data.adminToken,
            );
            break;
        case 'admin-payments':
            runAdminPayments(data.adminToken);
            break;
        case 'admin-payment-detail':
            runAdminPaymentDetail(data.adminToken);
            break;
        case 'payment-ready':
            runPaymentReady(data.userToken);
            break;
        default:
            fail(`No handler exists for BASELINE_ENDPOINT=${endpoint}.`);
    }
}
