import { check } from 'k6';

export function parseJson(response) {
    try {
        return response.json();
    } catch (error) {
        return null;
    }
}

export function expectStatus(response, expected, label = 'response') {
    const expectedStatuses = Array.isArray(expected) ? expected : [expected];
    const expectedText = expectedStatuses.join(' or ');

    return check(response, {
        [`${label}: status is ${expectedText}`]: (currentResponse) =>
            expectedStatuses.includes(currentResponse.status),
    });
}

export function expectCondition(condition, label) {
    return check(null, {
        [label]: () => Boolean(condition),
    });
}

export function expectJson(response, label = 'response') {
    const body = parseJson(response);

    check(response, {
        [`${label}: content type is JSON`]: (currentResponse) =>
            (currentResponse.headers['Content-Type'] || '').toLowerCase().includes('application/json'),
        [`${label}: body is valid JSON`]: () => body !== null && typeof body === 'object',
    });

    return body;
}

export function expectPage(response, label = 'page response') {
    const body = expectJson(response, label);

    check(body, {
        [`${label}: content is an array`]: (currentBody) => Array.isArray(currentBody?.content),
        [`${label}: page is a number`]: (currentBody) => Number.isInteger(currentBody?.page),
        [`${label}: size is a positive number`]: (currentBody) =>
            Number.isInteger(currentBody?.size) && currentBody.size > 0,
        [`${label}: totalElements is a non-negative number`]: (currentBody) =>
            Number.isInteger(currentBody?.totalElements) && currentBody.totalElements >= 0,
        [`${label}: totalPages is a non-negative number`]: (currentBody) =>
            Number.isInteger(currentBody?.totalPages) && currentBody.totalPages >= 0,
    });

    return body;
}

export function expectCursorPage(response, label = 'cursor page response') {
    const body = expectJson(response, label);

    check(body, {
        [`${label}: content is an array`]: (currentBody) => Array.isArray(currentBody?.content),
        [`${label}: nextCursor is nullable string`]: (currentBody) =>
            currentBody?.nextCursor === null || typeof currentBody?.nextCursor === 'string',
        [`${label}: hasNext is a boolean`]: (currentBody) =>
            typeof currentBody?.hasNext === 'boolean',
        [`${label}: size is a positive number`]: (currentBody) =>
            Number.isInteger(currentBody?.size) && currentBody.size > 0,
        [`${label}: hasNext requires nextCursor`]: (currentBody) =>
            currentBody?.hasNext !== true
            || (typeof currentBody?.nextCursor === 'string' && currentBody.nextCursor.length > 0),
    });

    return body;
}

export function expectAccessToken(response, label = 'login') {
    expectStatus(response, 200, label);
    const body = expectJson(response, label);

    check(body, {
        [`${label}: accessToken is present`]: (currentBody) =>
            typeof currentBody?.accessToken === 'string' && currentBody.accessToken.length > 0,
    });

    return body?.accessToken || null;
}
