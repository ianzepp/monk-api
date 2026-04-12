import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { DatabaseConnection } from '@src/lib/database-connection.js';

type MockPoolClient = {
    query: ReturnType<typeof mock>;
    release: ReturnType<typeof mock>;
};

type MockPool = {
    connect: ReturnType<typeof mock>;
};

describe('DatabaseConnection.healthCheck()', () => {
    let poolSpy: ReturnType<typeof spyOn>;
    const queryMock = mock();
    const releaseMock = mock();

    const fakeClient: MockPoolClient = {
        query: queryMock,
        release: releaseMock,
    };

    const fakePool: MockPool = {
        connect: mock(() => Promise.resolve(fakeClient)),
    };

    beforeEach(() => {
        queryMock.mockClear();
        releaseMock.mockClear();
        fakePool.connect.mockClear();
        poolSpy = spyOn(DatabaseConnection, 'getMainPool').mockReturnValue(fakePool as never);
    });

    afterEach(() => {
        poolSpy?.mockRestore();
    });

    it('releases the checked-out client when SELECT succeeds', async () => {
        queryMock.mockResolvedValue({ rows: [{ result: 1 }] });

        const result = await DatabaseConnection.healthCheck();

        expect(result).toEqual({ success: true });
        expect(fakePool.connect).toHaveBeenCalledTimes(1);
        expect(queryMock).toHaveBeenCalledWith('SELECT 1');
        expect(releaseMock).toHaveBeenCalledTimes(1);
    });

    it('releases the checked-out client when SELECT fails', async () => {
        const dbError = new Error('query failed');
        queryMock.mockRejectedValue(dbError);

        const result = await DatabaseConnection.healthCheck();

        expect(result).toEqual({ success: false, error: 'query failed' });
        expect(fakePool.connect).toHaveBeenCalledTimes(1);
        expect(queryMock).toHaveBeenCalledWith('SELECT 1');
        expect(releaseMock).toHaveBeenCalledTimes(1);
    });
});
