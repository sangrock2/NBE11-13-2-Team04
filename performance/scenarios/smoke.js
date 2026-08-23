import { group, sleep } from 'k6';
import http from 'k6/http';
import { authorizationHeaders, resolveAccessToken } from '../lib/auth.js';
import { apiUrl, config } from '../lib/config.js';
import {
    expectCondition,
    expectCursorPage,
    expectJson,
    expectPage,
    expectStatus,
} from '../lib/checks.js';

export const options = {
    scenarios: {
        smoke: {
            executor: 'shared-iterations',
            vus: config.smoke.vus,
            iterations: config.smoke.iterations,
            maxDuration: '2m',
        },
    },
    thresholds: {
        checks: [`rate>${config.thresholds.checkRate}`],
        http_req_failed: [`rate<${config.thresholds.errorRate}`],
        http_req_duration: [`p(95)<${config.thresholds.p95Ms}`],
        dropped_iterations: ['count==0'],
    },
};

function adminAuthenticationConfigured() {
    const hasToken = config.credentials.admin.accessToken.length > 0;
    const hasEmail = config.credentials.admin.email.length > 0;
    const hasPassword = config.credentials.admin.password.length > 0;

    if (hasToken) {
        return true;
    }

    if (hasEmail !== hasPassword) {
        throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be provided together.');
    }

    return hasEmail && hasPassword;
}

export function setup() {
    const userToken = resolveAccessToken(config.credentials.user, 'user');
    const adminToken = adminAuthenticationConfigured()
        ? resolveAccessToken(config.credentials.admin, 'admin')
        : null;

    return {
        userToken,
        adminToken,
    };
}

export default function (data) {
    let equipmentId = config.ids.equipmentId;

    group('public equipment queries', () => {
        const listResponse = http.get(
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

        expectStatus(listResponse, 200, 'equipment list');
        const page = expectPage(listResponse, 'equipment list');
        equipmentId = equipmentId || page?.content?.[0]?.id || null;

        if (equipmentId !== null) {
            const detailResponse = http.get(
                apiUrl(`/api/v1/devices/${equipmentId}`),
                {
                    headers: { Accept: 'application/json' },
                    tags: { name: 'GET /api/v1/devices/{equipmentId}' },
                    timeout: config.requestTimeout,
                },
            );

            expectStatus(detailResponse, 200, 'equipment detail');
            const detail = expectJson(detailResponse, 'equipment detail');
            expectCondition(
                detail?.id === Number(equipmentId),
                'equipment detail: requested id matches response',
            );

            const startDate = futureDate(30);
            const endDate = futureDate(33);
            const availabilityResponse = http.get(
                apiUrl(`/api/v1/devices/${equipmentId}/availability`, {
                    startDate,
                    endDate,
                }),
                {
                    headers: { Accept: 'application/json' },
                    tags: { name: 'GET /api/v1/devices/{equipmentId}/availability' },
                    timeout: config.requestTimeout,
                },
            );
            expectStatus(availabilityResponse, 200, 'equipment availability');
            const availability = expectJson(availabilityResponse, 'equipment availability');

            if (availability?.available === true) {
                const estimateResponse = http.get(
                    apiUrl(`/api/v1/devices/${equipmentId}/estimate`, {
                        startDate,
                        endDate,
                    }),
                    {
                        headers: { Accept: 'application/json' },
                        tags: { name: 'GET /api/v1/devices/{equipmentId}/estimate' },
                        timeout: config.requestTimeout,
                    },
                );
                expectStatus(estimateResponse, 200, 'equipment estimate');
                const estimate = expectJson(estimateResponse, 'equipment estimate');
                expectCondition(
                    Number(estimate?.totalPrice) > 0,
                    'equipment estimate: total price is positive',
                );
            }
        }
    });

    group('authenticated rental queries', () => {
        const userParams = {
            headers: authorizationHeaders(data.userToken),
            timeout: config.requestTimeout,
        };

        const borrowedResponse = http.get(
            apiUrl('/api/v1/rentals/borrowed', {
                page: config.paging.page,
                size: config.paging.size,
            }),
            {
                ...userParams,
                tags: { name: 'GET /api/v1/rentals/borrowed' },
            },
        );
        expectStatus(borrowedResponse, 200, 'borrowed rental history');
        expectPage(borrowedResponse, 'borrowed rental history');

        const lentResponse = http.get(
            apiUrl('/api/v1/rentals/lent', {
                page: config.paging.page,
                size: config.paging.size,
            }),
            {
                ...userParams,
                tags: { name: 'GET /api/v1/rentals/lent' },
            },
        );
        expectStatus(lentResponse, 200, 'lent rental history');
        expectPage(lentResponse, 'lent rental history');

        const myEquipmentResponse = http.get(
            apiUrl('/api/v1/users/me/devices', {
                page: config.paging.page,
                size: config.paging.size,
            }),
            {
                ...userParams,
                tags: { name: 'GET /api/v1/users/me/devices' },
            },
        );
        expectStatus(myEquipmentResponse, 200, 'my equipment');
        expectPage(myEquipmentResponse, 'my equipment');

        const paymentHistoryResponse = http.get(
            apiUrl('/api/v1/users/me/payments', {
                page: config.paging.page,
                size: config.paging.size,
            }),
            {
                ...userParams,
                tags: { name: 'GET /api/v1/users/me/payments' },
            },
        );
        expectStatus(paymentHistoryResponse, 200, 'payment history');
        expectPage(paymentHistoryResponse, 'payment history');

        const notificationResponse = http.get(
            apiUrl('/api/v1/notifications', {
                unreadOnly: false,
                page: config.paging.page,
                size: config.paging.size,
            }),
            {
                ...userParams,
                tags: { name: 'GET /api/v1/notifications' },
            },
        );
        expectStatus(notificationResponse, 200, 'notifications');
        expectPage(notificationResponse, 'notifications');

        const unreadResponse = http.get(
            apiUrl('/api/v1/notifications/unread-count'),
            {
                ...userParams,
                tags: { name: 'GET /api/v1/notifications/unread-count' },
            },
        );
        expectStatus(unreadResponse, 200, 'notification unread count');
        const unread = expectJson(unreadResponse, 'notification unread count');
        expectCondition(
            Number.isInteger(unread?.unreadCount) && unread.unreadCount >= 0,
            'notification unread count: value is valid',
        );

        if (config.ids.rentalId !== null) {
            const detailResponse = http.get(
                apiUrl(`/api/v1/rentals/${config.ids.rentalId}`),
                {
                    ...userParams,
                    tags: { name: 'GET /api/v1/rentals/{rentalId}' },
                },
            );
            expectStatus(detailResponse, 200, 'rental detail');
            const detail = expectJson(detailResponse, 'rental detail');
            expectCondition(
                detail?.rentalId === config.ids.rentalId,
                'rental detail: requested id matches response',
            );
        }
    });

    if (data.adminToken) {
        group('admin payment queries', () => {
            const adminParams = {
                headers: authorizationHeaders(data.adminToken),
                timeout: config.requestTimeout,
            };
            const listResponse = http.get(
                apiUrl('/api/v1/admin/payments', {
                    size: config.paging.size,
                }),
                {
                    ...adminParams,
                    tags: { name: 'GET /api/v1/admin/payments' },
                },
            );
            expectStatus(listResponse, 200, 'admin payment list');
            expectCursorPage(listResponse, 'admin payment list');

            if (config.ids.paymentId !== null) {
                const detailResponse = http.get(
                    apiUrl(`/api/v1/admin/payments/${config.ids.paymentId}`),
                    {
                        ...adminParams,
                        tags: { name: 'GET /api/v1/admin/payments/{paymentId}' },
                    },
                );
                expectStatus(detailResponse, 200, 'admin payment detail');
                const detail = expectJson(detailResponse, 'admin payment detail');
                expectCondition(
                    detail?.payment?.paymentId === config.ids.paymentId,
                    'admin payment detail: requested id matches response',
                );
            }
        });
    }

    sleep(config.thinkTimeSeconds);
}

function futureDate(offsetDays) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
}
