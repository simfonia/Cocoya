/**
 * application/sessionManager.js — DM 會話管理器（M1，R1）
 * 類型鎖定單一路徑：openSession(type) 選定即鎖定；換類型唯一路徑＝確認→回入口。
 * 純狀態機＋依賴注入（confirm/showStatus/t），無 DOM／Bridge 直接依賴，可單元測試。
 */

export function createSessionManager(deps = {}) {
    const {
        confirmFn = async () => true,
        notifyFn = () => {},
        initialType = null
    } = deps;

    const session = {
        lockedType: initialType,
        phase: initialType ? 'workspace' : 'entry'
    };

    function openSession(type) {
        session.lockedType = type || null;
        session.phase = type ? 'workspace' : 'entry';
        return snapshot();
    }

    function backToEntry() {
        session.lockedType = null;
        session.phase = 'entry';
        return snapshot();
    }

    async function requestSwitchType(hasUnsavedWork) {
        if (!session.lockedType) return { switched: true, ...backToEntry() };
        if (hasUnsavedWork) {
            const ok = await confirmFn('SWITCH_TYPE_CONFIRM');
            if (!ok) return { switched: false, ...snapshot() };
        } else {
            notifyFn('SWITCH_TYPE_HINT');
        }
        return { switched: true, ...backToEntry() };
    }

    function snapshot() {
        return { lockedType: session.lockedType, phase: session.phase };
    }

    return { openSession, backToEntry, requestSwitchType, snapshot };
}
