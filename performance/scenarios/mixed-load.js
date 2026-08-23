import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

import { apiUrl, config, requireEnv } from '../lib/config.js';
import { authorizationHeaders, login, resolveAccessToken } from '../lib/auth.js';
import { expectCursorPage, expectPage, expectStatus } from '../lib/checks.js';

const allowDestructiveWrites = String(__ENV.ALLOW_DESTRUCTIVE_WRITES || '').toLowerCase() === 'true';
const writePercent = Math.max(0, Math.min(100, Number(__ENV.WRITE_PERCENT || 5)));
const includeLoginTraffic = String(__ENV.INCLUDE_LOGIN_TRAFFIC || 'true').toLowerCase() === 'true';
const tokenRenewSeconds = Math.max(
    0,
    Number(__ENV.TOKEN_RENEW_SECONDS || __ENV.TOKEN_RELOGIN_SECONDS || 600),
);

const startRate = Number(__ENV.START_RATE || config.baseline.startRate || 5);
const targetRate = Number(__ENV.TARGET_RATE || config.baseline.targetRate || 20);
const preAllocatedVUs = Number(__ENV.PRE_ALLOCATED_VUS || config.baseline.preAllocatedVUs || 30);
const maxVUs = Number(__ENV.MAX_VUS || config.baseline.maxVUs || 100);
const pageSize = Number(__ENV.PAGE_SIZE || config.paging.size || 20);

export const expectedConflicts = new Counter('expected_conflicts');
export const successfulMutations = new Counter('successful_mutations');
export const unexpectedResponses = new Counter('unexpected_responses');
export const skippedOperations = new Counter('skipped_operations');

let vuAuth = null;
let userTokenIssuedAt = 0;
let adminTokenIssuedAt = 0;

export const options = {
    scenarios: {
        mixed_load: {
            executor: 'ramping-arrival-rate',
            startRate,
            timeUnit: '1s',
            preAllocatedVUs,
            maxVUs,
            stages: [
                { target: targetRate, duration: __ENV.RAMP_UP_DURATION || '2m' },
                { target: targetRate, duration: __ENV.HOLD_DURATION || '10m' },
                { target: 0, duration: __ENV.RAMP_DOWN_DURATION || '2m' },
            ],
            gracefulStop: '30s',
            tags: { test_type: 'mixed-load' },
        },
    },
    thresholds: {
        checks: ['rate>0.99'],
        http_req_failed: ['rate<0.01'],
        http_req_duration: [
            `p(95)<${Number(__ENV.P95_MS || 500)}`,
            `p(99)<${Number(__ENV.P99_MS || 1500)}`,
        ],
        unexpected_responses: ['count==0'],
        dropped_iterations: ['count==0'],
    },
};

function configuredValues(...names) {
    for (const name of names) {
        const value = config.ids && config.ids[name];
        if (value !== undefined && value !== null && value !== '') {
            return Array.isArray(value) ? value : [value];
        }
    }
    return [];
}

function pick(values) {
    if (!values || values.length === 0) {
        return null;
    }
    return values[Math.floor(Math.random() * values.length)];
}

function pickForActor(values, actorIndex, tokenPoolSize) {
    if (!values || values.length === 0) {
        return null;
    }
    if (tokenPoolSize > 1) {
        return values[actorIndex % values.length];
    }
    return pick(values);
}

function randomPage() {
    const draw = Math.random();
    if (draw < 0.7) {
        return 0;
    }
    if (draw < 0.9) {
        return Math.max(1, Number(__ENV.MIXED_MID_PAGE || 5));
    }
    return Math.max(1, Number(__ENV.MIXED_DEEP_PAGE || 50));
}

function randomEquipmentKeyword() {
    const draw = Math.random();
    if (draw < 0.45) {
        return null;
    }
    if (draw < 0.7) {
        return '성능장비';
    }
    if (draw < 0.82) {
        return 'MacBook';
    }
    if (draw < 0.92) {
        return '검색결과없음';
    }
    return pick(['%', '_', '+']);
}

function configuredTokenPool(credentials) {
    if (credentials && Array.isArray(credentials.tokens) && credentials.tokens.length > 0) {
        return credentials.tokens;
    }
    const token = credentials && credentials.accessToken;
    return token ? [token] : [];
}

function hasLoginCredentials(credentials) {
    return Boolean(
        credentials
        && Array.isArray(credentials.accounts)
        && credentials.accounts.length > 0,
    );
}

function loginAccounts(credentials, label) {
    return credentials.accounts.map((account, index) => login(account, `${label}-${index + 1}`));
}

export function prepareMixedLoad(options = {}) {
    const preferLogin = Boolean(options.preferLogin);
    const requireUser = options.requireUser !== false;
    let userTokens = preferLogin && hasLoginCredentials(config.credentials.user)
        ? loginAccounts(config.credentials.user, 'user')
        : configuredTokenPool(config.credentials.user);
    let adminTokens = preferLogin && hasLoginCredentials(config.credentials.admin)
        ? loginAccounts(config.credentials.admin, 'admin')
        : configuredTokenPool(config.credentials.admin);

    if (userTokens.length === 0 && requireUser) {
        userTokens = hasLoginCredentials(config.credentials.user)
            ? loginAccounts(config.credentials.user, 'user')
            : [resolveAccessToken(config.credentials.user, 'user')];
    }
    if (adminTokens.length === 0 && hasLoginCredentials(config.credentials.admin)) {
        adminTokens = loginAccounts(config.credentials.admin, 'admin');
    }

    return {
        userTokens,
        adminTokens,
        // 단일 토큰을 소비하는 concurrency 시나리오와의 호환성을 유지합니다.
        userToken: userTokens.length > 0 ? userTokens[0] : null,
        adminToken: adminTokens.length > 0 ? adminTokens[0] : null,
    };
}

export function setup() {
    return prepareMixedLoad();
}

export function assertRenewableAuth() {
    const staticLongRunTokensAllowed = String(
        __ENV.ALLOW_STATIC_LONG_RUN_TOKENS || __ENV.ALLOW_STATIC_SOAK_TOKENS || '',
    ).toLowerCase() === 'true';
    if (staticLongRunTokensAllowed) {
        return;
    }
    if (tokenRenewSeconds === 0) {
        throw new Error('TOKEN_RENEW_SECONDS must be greater than 0 for a long-running scenario.');
    }

    if (!hasLoginCredentials(config.credentials.user)) {
        requireEnv('USER_EMAIL(S)/USER_PASSWORD(S)', null);
    }

    const adminTokensConfigured = configuredTokenPool(config.credentials.admin).length > 0;
    if (adminTokensConfigured && !hasLoginCredentials(config.credentials.admin)) {
        requireEnv('ADMIN_EMAIL(S)/ADMIN_PASSWORD(S)', null);
    }
}

function currentAuth(data) {
    const now = Date.now();
    if (vuAuth === null) {
        const userTokens = data.userTokens && data.userTokens.length > 0
            ? data.userTokens
            : [data.userToken];
        const adminTokens = data.adminTokens && data.adminTokens.length > 0
            ? data.adminTokens
            : (data.adminToken ? [data.adminToken] : []);
        const userIndex = Math.max(0, __VU - 1) % userTokens.length;
        const adminIndex = adminTokens.length > 0
            ? Math.max(0, __VU - 1) % adminTokens.length
            : 0;

        vuAuth = {
            userToken: userTokens[userIndex],
            adminToken: adminTokens.length > 0 ? adminTokens[adminIndex] : null,
            userIndex,
            adminIndex,
            userTokenPoolSize: userTokens.length,
            adminTokenPoolSize: adminTokens.length,
            userAccount: config.credentials.user.accounts.length > 0
                ? config.credentials.user.accounts[userIndex % config.credentials.user.accounts.length]
                : null,
            adminAccount: config.credentials.admin.accounts.length > 0
                ? config.credentials.admin.accounts[adminIndex % config.credentials.admin.accounts.length]
                : null,
        };
        userTokenIssuedAt = now;
        adminTokenIssuedAt = now;
    }

    if (tokenRenewSeconds === 0) {
        return vuAuth;
    }

    // VU별 작은 시차를 두어 장시간 테스트의 재로그인이 한 시점에 몰리지 않게 합니다.
    const reloginAfterMs = (tokenRenewSeconds + (__VU % 120)) * 1000;
    if (
        vuAuth.userAccount
        && now - userTokenIssuedAt >= reloginAfterMs
    ) {
        vuAuth.userToken = login(vuAuth.userAccount, 'user-relogin');
        userTokenIssuedAt = now;
    }
    if (
        vuAuth.adminAccount
        && now - adminTokenIssuedAt >= reloginAfterMs
    ) {
        vuAuth.adminToken = login(vuAuth.adminAccount, 'admin-relogin');
        adminTokenIssuedAt = now;
    }

    return vuAuth;
}

function requestParams(token, name, extraHeaders) {
    const headers = token
        ? authorizationHeaders(token, extraHeaders)
        : (extraHeaders || {});

    return {
        headers,
        tags: { name },
        timeout: config.requestTimeout,
    };
}

export function jsonParams(token, name, acceptConflict) {
    const params = requestParams(token, name, { 'Content-Type': 'application/json' });
    if (acceptConflict) {
        params.responseCallback = http.expectedStatuses(200, 201, 409);
    }
    return params;
}

function recordExact(response, status, label, pageExpected) {
    expectStatus(response, status, label);
    if (pageExpected && response.status === status) {
        expectPage(response, label);
    }
    if (response.status !== status) {
        unexpectedResponses.add(1, { endpoint: label, status: String(response.status) });
        return false;
    }
    return true;
}

function recordCursorPage(response, status, label) {
    expectStatus(response, status, label);
    if (response.status === status) {
        expectCursorPage(response, label);
    }
    if (response.status !== status) {
        unexpectedResponses.add(1, { endpoint: label, status: String(response.status) });
        return false;
    }
    return true;
}

export function recordMutation(response, successStatuses, label) {
    if (successStatuses.includes(response.status)) {
        successfulMutations.add(1, { endpoint: label, status: String(response.status) });
        check(response, { [`${label}: mutation succeeded`]: () => true });
        return true;
    }
    if (response.status === 409) {
        expectedConflicts.add(1, { endpoint: label });
        check(response, { [`${label}: expected conflict`]: () => true });
        return true;
    }

    unexpectedResponses.add(1, { endpoint: label, status: String(response.status) });
    check(response, { [`${label}: success or expected 409`]: () => false });
    return false;
}

function addOperation(operations, weight, label, runnable, run) {
    if (runnable) {
        operations.push({ weight, label, run });
    }
}

function chooseWeighted(operations) {
    const totalWeight = operations.reduce((sum, operation) => sum + operation.weight, 0);
    let cursor = Math.random() * totalWeight;

    for (const operation of operations) {
        cursor -= operation.weight;
        if (cursor < 0) {
            return operation;
        }
    }
    return operations[operations.length - 1];
}

export function futureDate(offsetDays) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
}

function readOperations(data) {
    const equipmentIds = configuredValues('equipmentIds', 'equipments', 'equipment');
    const rentalIds = configuredValues('rentalIds', 'rentals', 'rental');
    const reportIds = configuredValues('reportIds', 'reports', 'report');
    const paymentIds = configuredValues('paymentIds', 'payments', 'payment');
    const userIds = configuredValues('userIds', 'users', 'user');
    const operations = [];

    addOperation(operations, 30, 'equipment-list', true, () => {
        const response = http.get(
            apiUrl('/api/v1/devices', {
                keyword: randomEquipmentKeyword(),
                page: randomPage(),
                size: pageSize,
                sort: 'LATEST',
            }),
            requestParams(null, 'GET /api/v1/devices'),
        );
        recordExact(response, 200, 'equipment-list', true);
    });

    addOperation(operations, 12, 'equipment-detail', equipmentIds.length > 0, () => {
        const equipmentId = pick(equipmentIds);
        const response = http.get(
            apiUrl(`/api/v1/devices/${equipmentId}`),
            requestParams(null, 'GET /api/v1/devices/:id'),
        );
        recordExact(response, 200, 'equipment-detail', false);
    });

    addOperation(operations, 4, 'equipment-availability', equipmentIds.length > 0, () => {
        const equipmentId = pick(equipmentIds);
        const response = http.get(
            apiUrl(`/api/v1/devices/${equipmentId}/availability`, {
                startDate: futureDate(30),
                endDate: futureDate(33),
            }),
            requestParams(null, 'GET /api/v1/devices/:id/availability'),
        );
        recordExact(response, 200, 'equipment-availability', false);
    });

    addOperation(operations, 8, 'my-profile', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/users/me'),
            requestParams(data.userToken, 'GET /api/v1/users/me'),
        );
        recordExact(response, 200, 'my-profile', false);
    });

    addOperation(operations, 5, 'my-equipment', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/users/me/devices', {
                page: randomPage(),
                size: pageSize,
            }),
            requestParams(data.userToken, 'GET /api/v1/users/me/devices'),
        );
        recordExact(response, 200, 'my-equipment', true);
    });

    addOperation(operations, 6, 'payment-history', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/users/me/payments', {
                status: Math.random() < 0.35 ? pick(['PAID', 'REFUNDED']) : null,
                page: randomPage(),
                size: pageSize,
            }),
            requestParams(data.userToken, 'GET /api/v1/users/me/payments'),
        );
        recordExact(response, 200, 'payment-history', true);
    });

    addOperation(operations, 5, 'notifications', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/notifications', {
                unreadOnly: Math.random() < 0.4,
                page: randomPage(),
                size: pageSize,
            }),
            requestParams(data.userToken, 'GET /api/v1/notifications'),
        );
        recordExact(response, 200, 'notifications', true);
    });

    addOperation(operations, 2, 'notification-unread-count', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/notifications/unread-count'),
            requestParams(data.userToken, 'GET /api/v1/notifications/unread-count'),
        );
        recordExact(response, 200, 'notification-unread-count', false);
    });

    addOperation(operations, 13, 'borrowed-history', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/rentals/borrowed', { page: randomPage(), size: pageSize }),
            requestParams(data.userToken, 'GET /api/v1/rentals/borrowed'),
        );
        recordExact(response, 200, 'borrowed-history', true);
    });

    addOperation(operations, 10, 'lent-history', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/rentals/lent', { page: randomPage(), size: pageSize }),
            requestParams(data.userToken, 'GET /api/v1/rentals/lent'),
        );
        recordExact(response, 200, 'lent-history', true);
    });

    addOperation(operations, 3, 'borrowed-overdue', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/rentals/borrowed/overdue', { page: 0, size: pageSize }),
            requestParams(data.userToken, 'GET /api/v1/rentals/borrowed/overdue'),
        );
        recordExact(response, 200, 'borrowed-overdue', true);
    });

    addOperation(operations, 3, 'lent-overdue', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/rentals/lent/overdue', { page: 0, size: pageSize }),
            requestParams(data.userToken, 'GET /api/v1/rentals/lent/overdue'),
        );
        recordExact(response, 200, 'lent-overdue', true);
    });

    addOperation(operations, 5, 'received-rentals', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/rentals', { role: 'owner', page: 0, size: pageSize }),
            requestParams(data.userToken, 'GET /api/v1/rentals?role=owner'),
        );
        recordExact(response, 200, 'received-rentals', true);
    });

    addOperation(operations, 4, 'return-targets', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/rentals/returns', { page: 0, size: pageSize }),
            requestParams(data.userToken, 'GET /api/v1/rentals/returns'),
        );
        recordExact(response, 200, 'return-targets', true);
    });

    addOperation(operations, 6, 'my-reports', Boolean(data.userToken), () => {
        const response = http.get(
            apiUrl('/api/v1/reports/me', { page: randomPage(), size: pageSize }),
            requestParams(data.userToken, 'GET /api/v1/reports/me'),
        );
        recordExact(response, 200, 'my-reports', true);
    });

    addOperation(operations, 4, 'rental-detail', Boolean(data.userToken) && rentalIds.length > 0, () => {
        const response = http.get(
            apiUrl(`/api/v1/rentals/${pickForActor(rentalIds, data.userIndex, data.userTokenPoolSize)}`),
            requestParams(data.userToken, 'GET /api/v1/rentals/:id'),
        );
        recordExact(response, 200, 'rental-detail', false);
    });

    addOperation(operations, 2, 'my-report-detail', Boolean(data.userToken) && reportIds.length > 0, () => {
        const response = http.get(
            apiUrl(`/api/v1/reports/${pickForActor(reportIds, data.userIndex, data.userTokenPoolSize)}`),
            requestParams(data.userToken, 'GET /api/v1/reports/:id'),
        );
        recordExact(response, 200, 'my-report-detail', false);
    });

    addOperation(operations, 2, 'admin-users', Boolean(data.adminToken), () => {
        const response = http.get(
            apiUrl('/api/v1/admin/users', { size: pageSize }),
            requestParams(data.adminToken, 'GET /api/v1/admin/users'),
        );
        recordCursorPage(response, 200, 'admin-users');
    });

    addOperation(operations, 2, 'admin-equipment', Boolean(data.adminToken), () => {
        const response = http.get(
            apiUrl('/api/v1/admin/equipment', { size: pageSize }),
            requestParams(data.adminToken, 'GET /api/v1/admin/equipment'),
        );
        recordCursorPage(response, 200, 'admin-equipment');
    });

    addOperation(operations, 2, 'admin-reports', Boolean(data.adminToken), () => {
        const response = http.get(
            apiUrl('/api/v1/admin/reports', { size: pageSize }),
            requestParams(data.adminToken, 'GET /api/v1/admin/reports'),
        );
        recordCursorPage(response, 200, 'admin-reports');
    });

    addOperation(operations, 2, 'admin-payments', Boolean(data.adminToken), () => {
        const response = http.get(
            apiUrl('/api/v1/admin/payments', { size: pageSize }),
            requestParams(data.adminToken, 'GET /api/v1/admin/payments'),
        );
        recordCursorPage(response, 200, 'admin-payments');
    });

    addOperation(operations, 1, 'admin-actions', Boolean(data.adminToken), () => {
        const response = http.get(
            apiUrl('/api/v1/admin/actions', { size: pageSize }),
            requestParams(data.adminToken, 'GET /api/v1/admin/actions'),
        );
        recordCursorPage(response, 200, 'admin-actions');
    });

    addOperation(operations, 1, 'admin-user-detail', Boolean(data.adminToken) && userIds.length > 0, () => {
        const response = http.get(
            apiUrl(`/api/v1/admin/users/${pick(userIds)}`),
            requestParams(data.adminToken, 'GET /api/v1/admin/users/:id'),
        );
        recordExact(response, 200, 'admin-user-detail', false);
    });

    addOperation(operations, 1, 'admin-payment-detail', Boolean(data.adminToken) && paymentIds.length > 0, () => {
        const response = http.get(
            apiUrl(`/api/v1/admin/payments/${pick(paymentIds)}`),
            requestParams(data.adminToken, 'GET /api/v1/admin/payments/:id'),
        );
        recordExact(response, 200, 'admin-payment-detail', false);
    });

    addOperation(
        operations,
        5,
        'login',
        includeLoginTraffic && hasLoginCredentials(config.credentials.user),
        () => login(pick(config.credentials.user.accounts), 'mixed-user-login'),
    );

    return operations;
}

function reportTarget(data) {
    const targets = configuredValues('reportTargets', 'reportTargetIds');
    const selected = pickForActor(targets, data.userIndex, data.userTokenPoolSize);
    if (selected && typeof selected === 'object') {
        return selected;
    }
    if (selected !== null) {
        return {
            targetType: __ENV.REPORT_TARGET_TYPE || 'EQUIPMENT',
            targetId: selected,
        };
    }
    return null;
}

function writeOperations(data) {
    const rentableEquipmentIds = configuredValues('rentableEquipmentIds', 'writeEquipmentIds');
    const target = reportTarget(data);
    const operations = [];

    addOperation(operations, 2, 'create-report', Boolean(data.userToken) && Boolean(target), () => {
        const body = JSON.stringify({
            targetType: target.targetType || __ENV.REPORT_TARGET_TYPE || 'EQUIPMENT',
            targetId: target.targetId || target.id,
            reason: '부하 테스트 신고',
            description: `k6 baseline mixed load ${__VU}-${__ITER}`,
        });
        const response = http.post(
            apiUrl('/api/v1/reports'),
            body,
            jsonParams(data.userToken, 'POST /api/v1/reports', true),
        );
        recordMutation(response, [201], 'create-report');
    });

    addOperation(operations, 1, 'create-rental', Boolean(data.userToken) && rentableEquipmentIds.length > 0, () => {
        const body = JSON.stringify({
            equipmentId: pickForActor(
                rentableEquipmentIds,
                data.userIndex,
                data.userTokenPoolSize,
            ),
            startDate: futureDate(Number(__ENV.RENTAL_START_OFFSET_DAYS || 30)),
            endDate: futureDate(Number(__ENV.RENTAL_END_OFFSET_DAYS || 33)),
            receiverName: '부하테스트',
            receiverPhone: '010-1234-5678',
            zipcode: '06236',
            address: '서울특별시 강남구 테헤란로',
            detailAddress: '성능 테스트',
            requestMessage: `k6 baseline mixed load ${__VU}-${__ITER}`,
            useDefaultAddress: false,
        });
        const response = http.post(
            apiUrl('/api/v1/rentals'),
            body,
            jsonParams(data.userToken, 'POST /api/v1/rentals', true),
        );
        recordMutation(response, [201], 'create-rental');
    });

    return operations;
}

export function runMixedIteration(data) {
    const auth = currentAuth(data);

    if (allowDestructiveWrites && Math.random() * 100 < writePercent) {
        const writes = writeOperations(auth);
        if (writes.length > 0) {
            chooseWeighted(writes).run();
            return;
        }
        skippedOperations.add(1, { reason: 'missing-write-data' });
    }

    const reads = readOperations(auth);
    if (reads.length === 0) {
        skippedOperations.add(1, { reason: 'no-runnable-operation' });
        return;
    }
    chooseWeighted(reads).run();
}

export default function (data) {
    runMixedIteration(data);
}
