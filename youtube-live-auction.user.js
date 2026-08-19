// ==UserScript==
// @name         YouTube Live 낙찰 자동화
// @namespace    https://youtube.com/
// @version      2.5
// @description  YouTube Live 낙찰 자동화 + 밑줄 감지 시 최고가 자동 선별 & 단일 낙찰자 채팅 하이라이터 + 스마트 입찰 금액 추출 + 가상 키패드 + 실시간 토스트 알림 + 안내 패널 + 낙찰 내역 관리 & 엑셀 다운로드 (다시보기 환경 낙찰자 추가/수정 방지)
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @match        file://*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {

    'use strict';

    const PREFIX = '[낙찰 자동화]';

    console.log(PREFIX, '시작');


    // =========================================================
    // 낙찰 내역 관리 (LocalStorage)
    // =========================================================

    const BID_STORAGE_KEY = '__auction_bid_records';
    const ACTIVE_VIDEO_ID_KEY = '__auction_active_video_id';

    /** 현재 방송의 YouTube Video ID 추출 (부모창-iframe 간 동기화 완벽 지원) */
    function getCurrentVideoId() {

        try {
            // 1) ytcfg 글로벌 객체 확인 (YouTube 페이지 내부 환경)
            try {
                if (typeof window.ytcfg !== 'undefined' && typeof window.ytcfg.get === 'function') {
                    const v = window.ytcfg.get('VIDEO_ID') ||
                              window.ytcfg.get('INNERTUBE_CONTEXT_VIDEO_ID') ||
                              (window.ytcfg.data_ && window.ytcfg.data_.INNERTUBE_CONTEXT_VIDEO_ID);
                    if (v && v !== 'live_chat' && v !== 'live_chat_replay' && v !== 'unknown') {
                        try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, v); } catch (e) {}
                        return v;
                    }
                }
            } catch (e) {}

            // 2) 현재 window URL 파라미터 확인
            const url = new URL(window.location.href);
            const v = url.searchParams.get('v');
            if (v && v !== 'live_chat' && v !== 'live_chat_replay') {
                try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, v); } catch (e) {}
                return v;
            }

            if (url.pathname.startsWith('/live/')) {
                const parts = url.pathname.split('/').filter(Boolean);
                if (parts[1] && parts[1] !== 'live_chat') {
                    try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, parts[1]); } catch (e) {}
                    return parts[1];
                }
            }

            // 3) 부모 창(parent/top) URL 확인 (iframe 내부 환경 대응)
            try {
                if (window.top && window.top !== window && window.top.location.href) {
                    const topUrl = new URL(window.top.location.href);
                    const tv = topUrl.searchParams.get('v');
                    if (tv) {
                        try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, tv); } catch (e) {}
                        return tv;
                    }
                    if (topUrl.pathname.startsWith('/live/')) {
                        const tparts = topUrl.pathname.split('/').filter(Boolean);
                        if (tparts[1] && tparts[1] !== 'live_chat') {
                            try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, tparts[1]); } catch (e) {}
                            return tparts[1];
                        }
                    }
                }
            } catch (e) {}

            try {
                if (window.parent && window.parent !== window && window.parent.location.href) {
                    const parentUrl = new URL(window.parent.location.href);
                    const pv = parentUrl.searchParams.get('v');
                    if (pv) {
                        try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, pv); } catch (e) {}
                        return pv;
                    }
                    if (parentUrl.pathname.startsWith('/live/')) {
                        const pparts = parentUrl.pathname.split('/').filter(Boolean);
                        if (pparts[1] && pparts[1] !== 'live_chat') {
                            try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, pparts[1]); } catch (e) {}
                            return pparts[1];
                        }
                    }
                }
            } catch (e) {}

            // 4) document.referrer 확인
            if (document.referrer) {
                try {
                    const refUrl = new URL(document.referrer);
                    const rv = refUrl.searchParams.get('v');
                    if (rv && rv !== 'live_chat' && rv !== 'live_chat_replay') {
                        try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, rv); } catch (e) {}
                        return rv;
                    }
                    if (refUrl.pathname.startsWith('/live/')) {
                        const rparts = refUrl.pathname.split('/').filter(Boolean);
                        if (rparts[1] && rparts[1] !== 'live_chat' && rparts[1] !== 'live_chat_replay') {
                            try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, rparts[1]); } catch (e) {}
                            return rparts[1];
                        }
                    }
                } catch (e) {}
            }

            // 5) DOM의 canonical link 또는 video-id 속성 확인
            const canonical = document.querySelector('link[rel="canonical"]');
            if (canonical && canonical.href) {
                try {
                    const cUrl = new URL(canonical.href);
                    const cv = cUrl.searchParams.get('v');
                    if (cv) {
                        try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, cv); } catch (e) {}
                        return cv;
                    }
                } catch (e) {}
            }

            const flexy = document.querySelector('ytd-watch-flexy[video-id]');
            if (flexy) {
                const fv = flexy.getAttribute('video-id');
                if (fv) {
                    try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, fv); } catch (e) {}
                    return fv;
                }
            }

            // 6) watch 또는 live URL의 pathname 마지막 부분
            const pop = url.pathname.split('/').filter(Boolean).pop();
            if (pop && pop !== 'live_chat' && pop !== 'live_chat_replay' && pop !== 'watch' && !pop.includes('.')) {
                try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, pop); } catch (e) {}
                return pop;
            }

            // 7) 🛑 iframe 내부에서 부모 창이 저장해 둔 활성 Video ID 동기화 (다시보기 완벽 연동)
            try {
                const cachedVid = localStorage.getItem(ACTIVE_VIDEO_ID_KEY);
                if (cachedVid && cachedVid !== 'unknown' && cachedVid !== 'live_chat' && cachedVid !== 'live_chat_replay' && !cachedVid.includes('.')) {
                    return cachedVid;
                }
            } catch (e) {}

            return 'unknown';
        } catch (e) {
            try {
                const fallbackVid = localStorage.getItem(ACTIVE_VIDEO_ID_KEY);
                if (fallbackVid && fallbackVid !== 'unknown' && !fallbackVid.includes('.')) return fallbackVid;
            } catch (err) {}
            return 'unknown';
        }
    }


    /** 다시보기 (YouTube Live Replay / VOD) 환경 여부 판별 */
    function isReplayMode() {
        try {
            // 0) 실시간 채팅 입력창이 존재하면 100% 실시간 라이브 환경 (다시보기 아님!)
            const chatInput = findChatInput();
            if (chatInput) {
                return false;
            }

            // 1) 현재 창 URL 확인 (live_chat_replay 명시된 경우)
            const url = new URL(window.location.href);
            if (url.pathname.includes('live_chat_replay') || url.href.includes('live_chat_replay')) {
                return true;
            }

            // 2) 부모/최상위 창 URL 확인
            try {
                if (window.top && window.top !== window && window.top.location.href) {
                    const topHref = window.top.location.href || '';
                    if (topHref.includes('live_chat_replay')) return true;
                }
            } catch (e) {}

            try {
                if (window.parent && window.parent !== window && window.parent.location.href) {
                    const parentHref = window.parent.location.href || '';
                    if (parentHref.includes('live_chat_replay')) return true;
                }
            } catch (e) {}

            // 3) Referrer 확인
            if (document.referrer && document.referrer.includes('live_chat_replay')) {
                return true;
            }

            // 4) iframe#chatframe src 확인
            const checkIframe = (doc) => {
                try {
                    const iframe = doc.querySelector('iframe#chatframe');
                    if (iframe && iframe.src && iframe.src.includes('live_chat_replay')) {
                        return true;
                    }
                } catch (e) {}
                return false;
            };
            if (checkIframe(document)) return true;
            try {
                if (window.top && checkIframe(window.top.document)) return true;
            } catch (e) {}

            // 5) 다시보기 전용 DOM 요소 확인 (실시간 채팅에는 없는 명확한 다시보기 전용 요소)
            const checkDom = (doc) => {
                try {
                    if (doc.querySelector('yt-live-chat-replay-header-renderer')) return true;
                    if (doc.querySelector('ytd-live-chat-frame[is-replay]')) return true;
                } catch (e) {}
                return false;
            };
            if (checkDom(document)) return true;
            try {
                if (window.top && checkDom(window.top.document)) return true;
            } catch (e) {}

        } catch (e) {}

        return false;
    }


    /** 오늘 날짜 YYYY-MM-DD */
    function getTodayString() {

        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }


    /** 전체 낙찰 기록 불러오기 */
    function loadBidRecords() {

        try {
            const raw = localStorage.getItem(BID_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }


    /** 전체 낙찰 기록 저장 */
    function saveBidRecords(records) {

        try {
            localStorage.setItem(BID_STORAGE_KEY, JSON.stringify(records));
        } catch (e) {
            console.error(PREFIX, 'localStorage 저장 실패', e);
        }

        // 부모 창, iframe, 팝아웃 창 전체에 실시간 동기화 브로드캐스트
        try {
            const payload = { type: '__AUCTION_BID_UPDATED', timestamp: Date.now() };
            window.postMessage(payload, '*');
            if (window.top && window.top !== window) window.top.postMessage(payload, '*');
            if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
            if (window.opener) window.opener.postMessage(payload, '*');
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(f => {
                try { if (f.contentWindow) f.contentWindow.postMessage(payload, '*'); } catch (err) {}
            });
        } catch (e) {}
    }


    /** 초 단위 영상 시간을 MM:SS 또는 HH:MM:SS 문자열로 변환 */
    function formatVideoTime(sec) {
        if (isNaN(sec) || sec === null || sec === undefined || sec < 0) return '';
        const totalSec = Math.floor(sec);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) {
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }


    /** 현재 YouTube 영상 재생 시간 (영상시간) 추출 */
    function getCurrentVideoTime() {
        try {
            // 1) movie_player 플레이어 API 탐색
            const getPlayer = (w) => {
                try {
                    return w.document.getElementById('movie_player');
                } catch (e) {
                    return null;
                }
            };
            const player = getPlayer(window) ||
                (window.top && window.top !== window && getPlayer(window.top)) ||
                (window.parent && window.parent !== window && getPlayer(window.parent)) ||
                (window.opener && getPlayer(window.opener));
            if (player && typeof player.getCurrentTime === 'function') {
                const ct = player.getCurrentTime();
                if (typeof ct === 'number' && !isNaN(ct) && ct >= 0) {
                    return formatVideoTime(ct);
                }
            }

            // 2) video 태그 currentTime 탐색
            const getVideo = (w) => {
                try {
                    return w.document.querySelector('video.html5-main-video, video');
                } catch (e) {
                    return null;
                }
            };
            const video = getVideo(window) ||
                (window.top && window.top !== window && getVideo(window.top)) ||
                (window.parent && window.parent !== window && getVideo(window.parent)) ||
                (window.opener && getVideo(window.opener));
            if (video && typeof video.currentTime === 'number' && !isNaN(video.currentTime) && video.currentTime >= 0) {
                return formatVideoTime(video.currentTime);
            }

            // 3) .ytp-time-current UI 텍스트 탐색
            const getTimeEl = (w) => {
                try {
                    return w.document.querySelector('.ytp-time-current');
                } catch (e) {
                    return null;
                }
            };
            const timeEl = getTimeEl(window) ||
                (window.top && window.top !== window && getTimeEl(window.top)) ||
                (window.parent && window.parent !== window && getTimeEl(window.parent)) ||
                (window.opener && getTimeEl(window.opener));
            if (timeEl && timeEl.textContent && timeEl.textContent.trim()) {
                const txt = timeEl.textContent.trim();
                if (/^\d+:\d+(:\d+)?$/.test(txt)) {
                    return txt;
                }
            }
        } catch (e) {}

        // Fallback: 현재 실제 시간
        const now = new Date();
        return String(now.getHours()).padStart(2, '0') + ':' +
               String(now.getMinutes()).padStart(2, '0') + ':' +
               String(now.getSeconds()).padStart(2, '0');
    }


    /** 만원 단위 또는 숫자 문자열을 실제 금액 포맷(예: 1,000,000)으로 변환 */
    function formatActualPrice(price) {
        if (price === undefined || price === null || price === '') return '';
        const p = parseFloat(price);
        if (isNaN(p)) return String(price);
        // 만원 단위 -> 원 단위 환산 (100 -> 1,000,000 / 15 -> 150,000 / 1.5 -> 15,000)
        const won = Math.round(p * 10000);
        return won.toLocaleString('ko-KR');
    }


    /**
     * 낙찰 1건 기록 추가 (밑줄 자동 감지 / 수동 클릭 / 키패드 공통 100% 신규 추가)
     * @param {string} nickname - 낙찰자 닉네임
     * @param {string} price    - 낙찰가 (만원 단위 문자열, 예: "15", "1.5")
     * @param {string} [originalChat] - 원문 채팅 (자동감지 시)
     * @param {string} message  - 전송된 낙찰 메시지
     * @param {string} [blockKey] - 경매 블록 키
     */
    function addBidRecord(nickname, price, originalChat, message, blockKey = null) {

        const records = loadBidRecords();
        const currentVideoId = getCurrentVideoId();

        const now = new Date();
        const realTimeStr =
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');
        const videoTimeStr = getCurrentVideoTime();

        const newRecord = {
            id:          Date.now() + Math.floor(Math.random() * 1000),
            blockKey:    blockKey || `bid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            date:        getTodayString(),
            time:        videoTimeStr || realTimeStr,
            videoTime:   videoTimeStr || realTimeStr,
            realTime:    realTimeStr,
            videoId:     currentVideoId,
            nickname:    nickname,
            price:       price,
            originalChat: originalChat || '',
            message:     message
        };

        // 🛑 1초 이내 동일 닉네임 & 동일 금액 & 동일 원문채팅의 완전 중복 이벤트만 방어
        const isDuplicate = records.some(r => {
            if (!r) return false;
            return r.nickname === nickname &&
                   r.price === price &&
                   r.originalChat === (originalChat || '') &&
                   Math.abs(Number(r.id) - Number(newRecord.id)) < 1500;
        });

        if (isDuplicate) {
            console.log(PREFIX, '⚠️ 1.5초 이내 중복 낙찰 이벤트 무시:', nickname, price + '만');
            return;
        }

        records.push(newRecord);
        console.log(PREFIX, `✅ [낙찰 기록 추가 완료 #${records.length}]`, nickname, price + '만 (시간: ' + (videoTimeStr || realTimeStr) + ')');

        saveBidRecords(records);
        updateBidBadge();
    }


    /**
     * 특정 경매 블록 또는 닉네임의 낙찰 기록 취소/삭제
     * @param {string|null} blockKey - 경매 블록 키 (예: "round_1")
     * @param {string|null} nickname - 낙찰자 닉네임
     * @returns {boolean} 삭제 성공 여부
     */
    function removeBidRecord(blockKey = null, nickname = null) {

        const curVideoId = getCurrentVideoId();
        const today = getTodayString();
        const allRecords = loadBidRecords();
        let targetRecordId = null;

        for (let i = allRecords.length - 1; i >= 0; i--) {
            const r = allRecords[i];
            if (!r) continue;
            const isCurrentVid = (curVideoId && curVideoId !== 'unknown' && curVideoId !== 'live_chat' && curVideoId !== 'live_chat_replay')
                ? (r.videoId === curVideoId || (!r.videoId || r.videoId === 'unknown' ? r.date === today : false) || r.date === today)
                : (r.date === today || !r.videoId || r.videoId === 'unknown');

            if (isCurrentVid) {
                if (blockKey && r.blockKey === blockKey) {
                    targetRecordId = r.id;
                    break;
                } else if (nickname && r.nickname === nickname) {
                    targetRecordId = r.id;
                    break;
                }
            }
        }

        let updatedRecords;
        if (targetRecordId) {
            updatedRecords = allRecords.filter(r => r && r.id !== targetRecordId);
        } else if (blockKey || nickname) {
            updatedRecords = allRecords.filter(r => {
                if (!r) return false;
                const matchBlock = blockKey && r.blockKey === blockKey;
                const matchNick = nickname && r.nickname === nickname;
                const isCurrent = (curVideoId && curVideoId !== 'unknown' && curVideoId !== 'live_chat' && curVideoId !== 'live_chat_replay')
                    ? (r.videoId === curVideoId || (!r.videoId || r.videoId === 'unknown' ? r.date === today : false) || r.date === today)
                    : (r.date === today || !r.videoId || r.videoId === 'unknown');
                return !(isCurrent && (matchBlock || matchNick));
            });
        } else {
            return false;
        }

        saveBidRecords(updatedRecords);
        updateBidBadge();
        return true;
    }


    /** 현재 방송/영상 기록 필터링 (현재 영상 videoId 또는 당일 기준 필터링) */
    function getTodayBidRecords() {

        const videoId = getCurrentVideoId();
        const records = loadBidRecords();
        const today = getTodayString();

        if (!Array.isArray(records) || records.length === 0) {
            return [];
        }

        const filtered = records.filter(r => {
            if (!r) return false;
            // 1) 현재 방송/다시보기의 videoId가 명확히 확인된 경우
            if (
                videoId && videoId !== 'unknown' && videoId !== 'live_chat' && videoId !== 'live_chat_replay'
            ) {
                // 해당 영상의 videoId와 일치하거나, 당일 기록(videoId 미스매치 완화)도 유연하게 포함
                return r.videoId === videoId || (!r.videoId || r.videoId === 'unknown' ? r.date === today : false) || r.date === today;
            }
            // 2) videoId를 특정하기 어려운 환경(로컬 테스트 파일, 시뮬레이터 등)인 경우:
            // 당일(오늘) 날짜의 기록 반환
            if (r.date === today) {
                return true;
            }
            // 3) Fallback: unknown/live_chat 계열 기록 반환
            return !r.videoId || r.videoId === 'unknown' || r.videoId === 'live_chat' || r.videoId === 'live_chat_replay';
        });

        // 🛑 당일/videoId 필터 결과가 0건이지만 전체 기록이 존재하는 경우 (자정 넘김 방송 등 대응):
        // 최근 24시간 이내의 기록 또는 전체 기록을 반환하여 내역 누락 방지
        if (filtered.length === 0 && records.length > 0) {
            const now = Date.now();
            const recent = records.filter(r => r && (now - Number(r.id) < 86400000 || r.date === today));
            return recent.length > 0 ? recent : records;
        }

        return filtered;
    }


    /** 낙찰 배지 업데이트 (메인창 + iframe + 플로팅 버튼 전역 동기화) */
    function updateBidBadge() {

        const count = getTodayBidRecords().length;
        const text = `📋 낙찰 내역 (${count}건)`;

        // 1) 현재 document에서 탐색
        const btn = document.getElementById('__auction_bid_list_btn');
        if (btn) {
            btn.textContent = text;
        }

        // 2) iframe 내부에서도 탐색
        try {
            const iframe = document.querySelector('iframe#chatframe');
            if (iframe && iframe.contentDocument) {
                const iframeBtn = iframe.contentDocument.getElementById('__auction_bid_list_btn');
                if (iframeBtn) {
                    iframeBtn.textContent = text;
                }
            }
        } catch (e) {}

        // 3) 부모 창(top/parent)에서도 탐색 (iframe 내부에서 실행 중일 때)
        try {
            if (window.top && window.top !== window && window.top.document) {
                const topBtn = window.top.document.getElementById('__auction_bid_list_btn');
                if (topBtn) topBtn.textContent = text;
                const topFloatBtn = window.top.document.getElementById('__auction_floating_bid_btn');
                if (topFloatBtn) topFloatBtn.textContent = text;
            }
        } catch (e) {}

        // 4) 플로팅 버튼 업데이트
        try {
            updateFloatingBidButton();
        } catch (e) {}

        // 5) postMessage로 다른 프레임에 배지 갱신 브로드캐스트
        try {
            if (window.top && window.top !== window) {
                window.top.postMessage({ type: '__AUCTION_BID_UPDATED', count: count }, '*');
            }
        } catch (e) {}
    }


    // =========================================================
    // OS 및 수식키 감지
    // - Mac:     ⌘ Command (metaKey) 만 허용
    // - Windows: Alt        (altKey)  만 허용
    // =========================================================

    const IS_MAC = /mac/i.test(
        navigator.userAgentData
            ? (navigator.userAgentData.platform || '')
            : (navigator.platform || navigator.userAgent)
    );

    function isModifierPressed(event) {

        if (!event) return false;

        if (IS_MAC) {
            // Mac: ⌘ Command 키만
            return !!event.metaKey;
        } else {
            // Windows / 기타: Alt 키만
            return !!event.altKey;
        }
    }


    // =========================================================
    // 유틸
    // =========================================================

    function wait(ms) {

        return new Promise(
            resolve =>
                setTimeout(resolve, ms)
        );
    }


    function getEventElements(event) {

        if (!event) {
            return [];
        }

        if (
            typeof event.composedPath === 'function'
        ) {
            const path =
                event.composedPath();

            if (
                Array.isArray(path) &&
                path.length > 0
            ) {
                return path;
            }
        }

        const elements = [];

        let curr =
            event.target;

        while (curr) {

            elements.push(curr);

            curr =
                curr.parentElement;
        }

        return elements;
    }


    // =========================================================
    // 채팅 메시지 요소 찾기
    // =========================================================

    function findChatMessageItem(target) {

        if (!target) {
            return null;
        }

        if (
            target.nodeType ===
            Node.TEXT_NODE
        ) {
            target =
                target.parentElement;
        }

        if (
            !(target instanceof Element)
        ) {
            return null;
        }

        return target.closest(
            'yt-live-chat-text-message-renderer, ' +
            'yt-live-chat-paid-message-renderer, ' +
            'yt-live-chat-membership-item-renderer, ' +
            'yt-live-chat-paid-sticker-renderer, ' +
            'ytd-sponsorships-live-chat-gift-redemption-announcement-renderer'
        );
    }


    // =========================================================
    // 닉네임 찾기 (Shadow DOM / Composed Path 지원)
    // =========================================================

    function findAuthor(target, event = null) {

        const elements =
            event
                ? getEventElements(event)
                : (target ? [target] : []);

        for (
            const el
            of elements
        ) {

            if (
                !el ||
                !(el instanceof Element)
            ) {
                continue;
            }

            if (
                el.id ===
                'author-name'
            ) {
                return el;
            }

            // ⚠️ el.querySelector('#author-name') 제거:
            // composedPath에 yt-live-chat-app 등 고수준 컨테이너가 포함되면
            // 클릭과 무관한 다른 채팅의 author-name까지 잡히는 버그 방지

            if (
                typeof el.closest === 'function'
            ) {
                const chipAuthor =
                    el.closest(
                        'yt-live-chat-author-chip #author-name, #author-name'
                    );

                if (chipAuthor) {
                    return chipAuthor;
                }

                const messageItem =
                    findChatMessageItem(el);

                if (messageItem) {
                    const itemAuthor =
                        messageItem.querySelector(
                            '#author-name, yt-live-chat-author-chip'
                        );

                    if (itemAuthor) {
                        return itemAuthor;
                    }
                }
            }
        }

        return null;
    }


    // =========================================================
    // 방장 / 진행자 닉네임 목록 (이 닉네임의 채팅은 입찰/낙찰에서 절대 제외)
    // =========================================================

    const HOST_NICKNAMES = [
        '해담분재경매장',
        '해담분재',
        '경매진행자'
    ];

    /**
     * 방장/진행자 닉네임인지 판별
     */
    function isHostNickname(nickname) {
        if (!nickname || typeof nickname !== 'string') return false;
        const clean = nickname.trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase();
        return HOST_NICKNAMES.some(h => {
            const hClean = h.replace(/\s+/g, '').toLowerCase();
            return clean === hClean || clean.includes(hClean);
        });
    }


    // =========================================================
    // 진행자 / 운영자 / 시스템 메시지 판별
    // =========================================================

    /**
     * 진행자, 채널 소유자, 모더레이터(운영자) 또는 시스템 메시지 요소인지 판별
     */
    function isHostOrSystemElement(el) {
        if (!el || !(el instanceof Element)) return false;

        // 0) 작성자 닉네임이 방장/진행자 닉네임(해담분재경매장 등)인지 확인
        const authorEl = el.querySelector('#author-name') || (el.id === 'author-name' ? el : null);
        if (authorEl) {
            const rawNick = authorEl.innerText || authorEl.textContent || '';
            if (isHostNickname(rawNick)) return true;
        }

        // 1) author-type 속성 확인 (채널 소유자 owner만 제외, moderator는 닉네임이 방장일 때만 제외)
        const authorType = (el.getAttribute('author-type') || '').toLowerCase();
        if (authorType === 'owner') return true;

        // 2) message renderer 내부 author-chip 확인
        const authorChip = el.closest('yt-live-chat-author-chip') || el.querySelector('yt-live-chat-author-chip');
        if (authorChip) {
            const chipType = (authorChip.getAttribute('type') || '').toLowerCase();
            if (chipType === 'owner') return true;
            if (authorChip.querySelector('[type="owner"], .host-badge')) return true;
        }

        // 3) 배지 렌더러 확인 (YouTube 표준 소유자 뱃지)
        if (el.querySelector('yt-live-chat-author-badge-renderer[type="owner"], .host-badge')) {
            return true;
        }

        // 4) 시뮬레이터 및 커스텀 클래스
        if (el.classList.contains('system-host') || (typeof el.closest === 'function' && el.closest('.system-host'))) {
            return true;
        }

        return false;
    }


    /**
     * 공지, 안내문구, 낙찰완료 문구, 밑줄 등 시스템/진행자 텍스트인지 판별
     */
    function isSystemOrNoticeMessage(text) {
        if (!text || typeof text !== 'string') return true;
        const clean = text.trim();

        // 1) 밑줄 / 구분선
        if (isSeparatorMessage(clean) || /^={3,}$/.test(clean)) return true;

        // 2) 낙찰 완료 메시지 ("👉 @...", "낙찰입니다. 감사합니다")
        if (clean.includes('낙찰입니다') || clean.startsWith('👉 @') || clean.includes('감사합니다😄')) return true;

        // 3) 공지 및 안내 이모지/접두사
        if (
            clean.startsWith('📢') ||
            clean.startsWith('✨') ||
            clean.startsWith('🧹') ||
            clean.startsWith('🤖') ||
            clean.startsWith('⚠️') ||
            clean.startsWith('[공지]') ||
            clean.startsWith('[안내]') ||
            clean.startsWith('[품목') ||
            clean.startsWith('[동일가') ||
            clean.startsWith('[알림]')
        ) {
            return true;
        }

        // 4) 8종 기본 안내 메시지 내용 포함 여부
        if (
            clean.includes('회원등록 ┃') ||
            clean.includes('호가 ┃') ||
            clean.includes('경매장 ┃') ||
            clean.includes('낙찰 취소 ┃') ||
            clean.includes('택배 ┃') ||
            clean.includes('입찰 안내 ┃') ||
            clean.includes('채팅 안내 ┃') ||
            clean.includes('응원문구 ┃')
        ) {
            return true;
        }

        return false;
    }


    // =========================================================
    // 닉네임 추출 (배지 텍스트 분리 및 정제)
    // =========================================================

    function getNickname(author) {

        if (!author) {
            return null;
        }

        let text = '';

        if (author instanceof Element) {
            const nameEl =
                author.id === 'author-name'
                    ? author
                    : (author.querySelector('#author-name') || author);

            // 뱃지 엘리먼트(.host-badge, yt-live-chat-author-badge-renderer 등)가 포함된 경우 배지 텍스트를 제거하고 순수 텍스트만 추출
            const clone = nameEl.cloneNode(true);
            const badges = clone.querySelectorAll('yt-live-chat-author-badge-renderer, .host-badge, #chat-badges, [type="owner"], [type="moderator"]');
            badges.forEach(b => b.remove());

            text =
                clone.innerText ||
                clone.textContent ||
                clone.getAttribute('aria-label') ||
                '';

        } else if (typeof author === 'string') {
            text = author;
        }

        const nickname =
            text
                .trim()
                .replace(/^@+/, '')
                .replace(/\s*(?:진행자|소유자|운영자|방장)$/i, '')
                .trim();

        return nickname || null;
    }


    // =========================================================
    // 채팅 메시지 추출 (클릭 요소 및 최근 채팅)
    // =========================================================

    function extractChatMessage(target, nickname, event = null) {

        const elements =
            event
                ? getEventElements(event)
                : (target ? [target] : []);

        // 1. 이벤트 path 상의 모든 메시지 요소 또는 message ID 탐색
        for (
            const el
            of elements
        ) {

            if (
                !el ||
                !(el instanceof Element)
            ) {
                continue;
            }

            if (
                el.id === 'message' &&
                el.textContent
            ) {
                const text =
                    el.textContent.trim();

                if (text) {
                    return text;
                }
            }

            const msgEl =
                el.querySelector &&
                el.querySelector('#message');

            if (
                msgEl &&
                msgEl.textContent
            ) {
                const text =
                    msgEl.textContent.trim();

                if (text) {
                    return text;
                }
            }

            const item =
                findChatMessageItem(el);

            if (item) {
                const itemMsg =
                    item.querySelector('#message');

                if (
                    itemMsg &&
                    itemMsg.textContent
                ) {
                    const text =
                        itemMsg.textContent.trim();

                    if (text) {
                        return text;
                    }
                }
            }
        }

        // 2. 닉네임 기준 가장 최근 메시지 역순 검색
        if (nickname) {
            const chatItems =
                document.querySelectorAll(
                    'yt-live-chat-text-message-renderer, ' +
                    'yt-live-chat-paid-message-renderer'
                );

            for (
                let i = chatItems.length - 1;
                i >= 0;
                i--
            ) {
                const chatItem =
                    chatItems[i];

                const authorEl =
                    chatItem.querySelector(
                        '#author-name'
                    );

                if (authorEl) {
                    const authorName =
                        getNickname(authorEl);

                    if (
                        authorName ===
                        nickname
                    ) {
                        const msgEl =
                            chatItem.querySelector(
                                '#message'
                            );

                        if (
                            msgEl &&
                            msgEl.textContent
                        ) {
                            const text =
                                msgEl.textContent.trim();

                            if (text) {
                                return text;
                            }
                        }
                    }
                }
            }
        }

        return null;
    }


    // =========================================================
    // 금액 정리
    // =========================================================

    function normalizePrice(value) {

        if (value === null || value === undefined) {
            return null;
        }

        let price =
            String(value)
                .trim();

        // 쉼표 소수점 지원 (예: "3,5" -> "3.5", ",5" -> "0.5")
        price = price
            .replace(/(?:^|[^\d])\,(\d+)/g, ' 0.$1')
            .replace(/(\d+)\s*,\s*(\d{1,2})(?!\d)/g, '$1.$2')
            .replace(/,/g, '');

        if (!price) {
            return null;
        }

        if (price.startsWith('.')) {
            price = '0' + price;
        }

        if (
            !/^\d+(?:\.\d+)?$/.test(
                price
            )
        ) {
            return null;
        }

        const number =
            Number(price);

        if (
            !Number.isFinite(number) ||
            number <= 0
        ) {
            return null;
        }

        // 부동소수점 오차 방지 (예: 0.30000000000000004 -> 0.3, 15.5 -> 15.5)
        const rounded = Math.round(number * 10000) / 10000;
        return String(rounded);
    }


    // =========================================================
    // 스마트 금액 파싱 (입찰 채팅에서 만원 단위 추출 & 상세 메타데이터 반환)
    // - 첫 번째 등장하는 숫자/단위를 우선 추출하여 자동 낙찰 지원
    // - .5, .3 등 소수점 시작 형태 지원 (.5 ➔ 0.5만원 = 5천원)
    // - 3,5, 15,5, ,5 등 쉼표 소수점 형태 지원 (3,5 ➔ 3.5만원)
    // - 15만, 15.5만, 15만 5천, 150000, 150,000, 5000, 3천, 3천원, 20 등 자동 변환
    // - 65, 55, 75 등 소수점(.)을 생략하고 입력된 십의 자리 약칭 입찰의 문맥 분석 지원
    // =========================================================

    function parseBidPriceDetail(text) {

        if (
            !text ||
            typeof text !== 'string'
        ) {
            return null;
        }

        let clean =
            text.trim();

        // 0-0-1. 입찰이 아닌 감탄사, 탄식, 탈락 후기, 축하 대화 필터링 ("25 빠르다", "25 아깝네", "25 ㄲ비", "25 ㄷㄷ" 등)
        if (/\d+\s*(?:빠르다|빠르네|빠름|아깝|아깝다|아깝네|아까비|ㄲㅂ|ㄲ비|까비|ㄷㄷ|ㅊㅋ|ㅊㅊ|축하|나이스)/i.test(clean)) {
            return null;
        }

        // 0-0-2. 서술형 접두사 제거 ("저 25", "나 30", "전 15" 등 -> "25", "30", "15")
        clean = clean.replace(/^(?:저|나|전|제|me|i)\s+(\d)/i, '$1');

        // 0-0-3. 서술형 입찰 멘트 접미사 정리 ("25요", "25 탑승", "25 손", "25 갑니다", "25 가져갈게요" 등 -> "25")
        clean = clean.replace(/(\d+(?:\.\d+)?)\s*(?:요|이요|에\s*가져갈게요|가져갈게요|가져감|탑승|손|갑니다|갈게요|가요|찍음|찍습니다|픽|픽이요|입니당|입니다|부릅니다|콜|콜이요|go|ㄱㄱ)$/i, '$1');

        // 0-0-4. 한글 자음 및 영문 단위 축약어 변환
        // - "2.5ㅁ", "3ㅁ", "15ㅁ" -> "2.5만", "3만", "15만"
        // - "5ㅊ", "3ㅊ" -> "5천", "3천"
        // - "25k", "30k", "3.5k" -> "25천", "30천", "3.5천"
        // - "150000w", "15000w" -> "150000원", "15000원"
        clean = clean.replace(/(\d+(?:\.\d+)?)\s*ㅁ(?![가-힣a-zA-Z0-9])/g, '$1만');
        clean = clean.replace(/(\d+(?:\.\d+)?)\s*ㅊ(?![가-힣a-zA-Z0-9])/g, '$1천');
        clean = clean.replace(/(\d+(?:\.\d+)?)\s*[kK](?![가-힣a-zA-Z0-9])/g, '$1천');
        clean = clean.replace(/(\d+(?:\.\d+)?)\s*[wW₩](?![가-힣a-zA-Z0-9])/g, '$1원');

        let isPointNumber = false;

        // 0-1. ",5", ",3", ",5만" 등 쉼표로 바로 시작하는 소수점 형태 -> 0.5, 0.3 (0.5만원 = 5천원)
        if (/(?:^|[^\d])\,(\d+)/.test(clean)) {
            clean = clean.replace(/(?:^|[^\d])\,(\d+)/g, ' 0.$1');
            isPointNumber = true;
        }

        // 0-2. ".5", ".3", ".5만" 등 점으로 바로 시작하는 소수점 형태 -> 0.5, 0.3 (0.5만원 = 5천원)
        if (/(?:^|[^\d])\.(\d+)/.test(clean)) {
            clean = clean.replace(/(?:^|[^\d])\.(\d+)/g, ' 0.$1');
            isPointNumber = true;
        }

        // 0-3. "3,5", "15,5", "3,25", "3, 5" 등 쉼표 뒤 1~2자리 숫자가 오는 소수점 쉼표 -> "3.5", "15.5"
        if (/(\d+)\s*,\s*(\d{1,2})(?!\d)/.test(clean)) {
            clean = clean.replace(/(\d+)\s*,\s*(\d{1,2})(?!\d)/g, '$1.$2');
            isPointNumber = true;
        }

        // 0-4. "150,000", "15,000", "1,000,000" 등 3자리 단위 구분 쉼표 -> 쉼표 제거 ("150000", "15000")
        clean =
            clean
                .replace(/(\d+)\s*,\s*(\d{3})/g, '$1$2');

        // 0-5. 기타 남아있는 쉼표 제거
        clean =
            clean
                .replace(/,/g, '');

        if (/\d+\.\d+/.test(clean)) {
            isPointNumber = true;
        }

        // 0-6. "1억", "2억 5천", "1억 5000만" 등 억 단위
        const okMatch = clean.match(/(\d+(?:\.\d+)?)\s*억(?:\s*(\d+(?:\.\d+)?)\s*만)?/);
        if (okMatch) {
            const ok = parseFloat(okMatch[1]) * 10000;
            const man = okMatch[2] ? parseFloat(okMatch[2]) : 0;
            const total = ok + man;
            const pStr = normalizePrice(total);
            return pStr ? {
                priceStr: pStr,
                priceNum: parseFloat(pStr),
                rawNum: total,
                hasExplicitUnit: true,
                isRawInteger: false,
                isPointNumber: isPointNumber || String(total).includes('.'),
                isChonUnit: false
            } : null;
        }

        // 1. "15만 5천", "15만5000", "15만 3천원", "15만 5", "15만 5백" 등 만+천/백 복합 단위
        const manChonMatch =
            clean.match(
                /(\d+(?:\.\d+)?)\s*만\s*(\d+(?:\.\d+)?)\s*(천|백|000|00|원)?/i
            );

        if (manChonMatch) {
            const man =
                parseFloat(manChonMatch[1]);

            let sub =
                parseFloat(manChonMatch[2]);

            const unit =
                manChonMatch[3];

            let calcPrice = man;
            if (
                unit === '천' ||
                unit === '000' ||
                (sub < 10 && !unit)
            ) {
                if (sub >= 1000) {
                    sub = sub / 10000;
                } else if (sub < 10) {
                    sub = sub / 10;
                } else if (sub < 100) {
                    sub = sub / 100;
                }
                calcPrice = man + sub;
            } else if (
                unit === '백' ||
                unit === '00'
            ) {
                if (sub >= 100) {
                    sub = sub / 10000;
                } else if (sub < 10) {
                    sub = sub / 100;
                }
                calcPrice = man + sub;
            } else if (sub > 0 && sub < 10000) {
                calcPrice = man + (sub / 10000);
            }

            const pStr = normalizePrice(calcPrice);
            return pStr ? {
                priceStr: pStr,
                priceNum: parseFloat(pStr),
                rawNum: man,
                hasExplicitUnit: true,
                isRawInteger: false,
                isPointNumber: isPointNumber || String(calcPrice).includes('.'),
                isChonUnit: false
            } : null;
        }

        // 2. "15만", "15만원", "15.5만", "0.5만", ".5만", "15만으로"
        const manMatch =
            clean.match(
                /(\d+(?:\.\d+)?)\s*만/
            );

        if (manMatch) {
            const pStr = normalizePrice(manMatch[1]);
            const pNum = parseFloat(pStr);
            return pStr ? {
                priceStr: pStr,
                priceNum: pNum,
                rawNum: parseFloat(manMatch[1]),
                hasExplicitUnit: true,
                isRawInteger: !manMatch[1].includes('.'),
                isPointNumber: isPointNumber || manMatch[1].includes('.'),
                isChonUnit: false
            } : null;
        }

        // 3. "5천", "5천원", "3천", "3천원", "3천으로", "3.5천"
        const chonMatch =
            clean.match(
                /(\d+(?:\.\d+)?)\s*천/
            );

        if (chonMatch) {
            const chon =
                parseFloat(chonMatch[1]);
            const pStr = normalizePrice(chon / 10);
            return pStr ? {
                priceStr: pStr,
                priceNum: parseFloat(pStr),
                rawNum: chon,
                hasExplicitUnit: true,
                isRawInteger: false,
                isPointNumber: isPointNumber || chonMatch[1].includes('.'),
                isChonUnit: true
            } : null;
        }

        // 4. 원 단위 숫자가 명시된 경우 (예: "150000원", "150,000원", "15000원", "5000원", "3000원")
        const wonMatch =
            clean.match(
                /(\d{3,9})\s*원/
            );

        if (wonMatch) {
            const num =
                parseFloat(wonMatch[1]);
            const pStr = normalizePrice(num / 10000);
            return pStr ? {
                priceStr: pStr,
                priceNum: parseFloat(pStr),
                rawNum: num,
                hasExplicitUnit: true,
                isRawInteger: false,
                isPointNumber: isPointNumber,
                isChonUnit: false
            } : null;
        }

        // 5. 3자리 단위 콤마가 포함되어 있던 원 단위 숫자 (예: "150,000" -> 15, "15,000" -> 1.5, "5,000" -> 0.5)
        if (/\d{1,3}(?:,\d{3})+/.test(text)) {
            const commaNumMatch =
                clean.match(
                    /(\d{4,9})/
                );

            if (commaNumMatch) {
                const num =
                    parseFloat(commaNumMatch[1]);
                const pStr = normalizePrice(num / 10000);
                return pStr ? {
                    priceStr: pStr,
                    priceNum: parseFloat(pStr),
                    rawNum: num,
                    hasExplicitUnit: true,
                    isRawInteger: false,
                    isPointNumber: isPointNumber,
                    isChonUnit: false
                } : null;
            }
        }

        // 6. 단독 큰 숫자 (10,000 이상, 예: 150000, 200000, 75000)
        const largeNumMatch =
            clean.match(
                /(?:^|[^\d.])(\d{5,9})(?:[^\d.]|$)/
            );

        if (largeNumMatch) {
            const num =
                parseFloat(largeNumMatch[1]);
            const pStr = normalizePrice(num / 10000);
            return pStr ? {
                priceStr: pStr,
                priceNum: parseFloat(pStr),
                rawNum: num,
                hasExplicitUnit: false,
                isRawInteger: false,
                isPointNumber: isPointNumber,
                isChonUnit: false
            } : null;
        }

        // 7. 천 단위 4자리 숫자 (예: "5000", "3000", "3500", "7500" -> 0.5, 0.3, 0.35, 0.75)
        const fourDigitChonMatch =
            clean.match(
                /(?:^|[^\d.])([1-9]\d{3})(?:[^\d.]|$)/
            );

        if (fourDigitChonMatch) {
            const num =
                parseFloat(fourDigitChonMatch[1]);
            const pStr = normalizePrice(num / 10000);
            return pStr ? {
                priceStr: pStr,
                priceNum: parseFloat(pStr),
                rawNum: num,
                hasExplicitUnit: false,
                isRawInteger: false,
                isPointNumber: isPointNumber,
                isChonUnit: true
            } : null;
        }

        // 8. 일반 숫자 (예: "15", "20", "15.5", "3.5", "0.5", "2", "35", "65", "100")
        const numMatch =
            clean.match(
                /(\d+(?:\.\d+)?)/
            );

        if (numMatch) {
            const rawVal = numMatch[1];
            const pStr = normalizePrice(rawVal);
            const pNum = parseFloat(pStr);
            const isInt = !rawVal.includes('.');
            return pStr ? {
                priceStr: pStr,
                priceNum: pNum,
                rawNum: parseFloat(rawVal),
                hasExplicitUnit: false,
                isRawInteger: isInt,
                isPointNumber: isPointNumber || !isInt,
                isChonUnit: false
            } : null;
        }

        return null;
    }

    /** 스마트 금액 파싱 (문자열 반환) */
    function parseBidPrice(text) {
        const detail = parseBidPriceDetail(text);
        return detail ? detail.priceStr : null;
    }

    /**
     * 문맥(주변 채팅/경매 블록)을 고려한 스마트 입찰가 파싱
     * @param {string} text - 채팅 메시지
     * @param {Element|null} [element] - 채팅 DOM 요소
     * @returns {string|null} 파싱된 만원 단위 문자열 (예: 65 ➔ "6.5")
     */
    function parseBidPriceWithContext(text, element = null) {
        if (!text) return null;
        const detail = parseBidPriceDetail(text);
        if (!detail) return null;

        // 단위가 이미 명시되어 있거나 소수점이 있는 경우 그대로 반환
        if (detail.hasExplicitUnit || !detail.isRawInteger) {
            return detail.priceStr;
        }

        const raw = detail.rawNum;

        // DOM 요소가 전달된 경우 해당 경매 블록 내 다른 채팅들의 호가 문맥 분석
        if (element) {
            const blockItems = getAuctionBlockItems(element, element.ownerDocument || document);
            const underTenBids = [];
            const tenPlusBids = [];

            const anchorPrices = [];

            blockItems.forEach(item => {
                if (isHostOrSystemElement(item) || item === element) return;
                const msgEl = item.querySelector('#message');
                const chatText = msgEl ? msgEl.textContent.trim() : '';
                if (!chatText || isSystemOrNoticeMessage(chatText)) return;
                const d = parseBidPriceDetail(chatText);
                if (d && d.priceNum > 0) {
                    const num = d.priceNum;
                    if (d.isPointNumber && num < 10) {
                        underTenBids.push(num);
                        anchorPrices.push(num);
                    } else if (num < 10 && !d.isRawInteger) {
                        underTenBids.push(num);
                        anchorPrices.push(num);
                    } else if (num < 10) {
                        underTenBids.push(num);
                        anchorPrices.push(num);
                    } else {
                        tenPlusBids.push(num);
                        if (d.hasExplicitUnit || d.isPointNumber || num < 100) {
                            anchorPrices.push(num);
                        }
                    }
                }
            });

            const isLowScale = underTenBids.length > 0 && (underTenBids.length > tenPlusBids.length || (underTenBids.length >= 3 && tenPlusBids.length <= 1));
            const underTenAvg = underTenBids.length > 0
                ? (underTenBids.reduce((sum, v) => sum + v, 0) / underTenBids.length)
                : null;

            const baselineAvg = anchorPrices.length > 0
                ? (anchorPrices.reduce((sum, v) => sum + v, 0) / anchorPrices.length)
                : (tenPlusBids.length > 0 ? (tenPlusBids.reduce((sum, v) => sum + v, 0) / tenPlusBids.length) : null);

            // [케이스 1] 2자리 숫자 (10~99: 29 ➔ 2.9만, 27 ➔ 2.7만, 65 ➔ 6.5만 등)
            if (raw >= 10 && raw <= 99 && isLowScale) {
                const candidate = raw / 10;
                if (underTenAvg !== null && Math.abs(candidate - underTenAvg) < Math.abs(raw - underTenAvg)) {
                    console.log(
                        PREFIX,
                        `💡 [문맥 보정 파싱 (2자리)] "${text}" (${raw}) ➔ ${normalizePrice(candidate)}만 으로 보정됨`
                    );
                    return normalizePrice(candidate);
                }
            }
            // [케이스 2] 3자리 숫자 (100~999: 366 ➔ 36.6만 또는 3.66만, 255 ➔ 25.5만 등)
            else if (raw >= 100 && raw <= 999) {
                if (isLowScale && underTenAvg !== null) {
                    const candidate = raw / 100;
                    if (Math.abs(candidate - underTenAvg) < Math.abs(raw - underTenAvg)) {
                        console.log(
                            PREFIX,
                            `💡 [문맥 보정 파싱 (3자리/소액)] "${text}" (${raw}) ➔ ${normalizePrice(candidate)}만 으로 보정됨`
                        );
                        return normalizePrice(candidate);
                    }
                } else {
                    const candidate = raw / 10;
                    const avg = baselineAvg !== null ? baselineAvg : 20;
                    if (Math.abs(candidate - avg) < Math.abs(raw - avg)) {
                        console.log(
                            PREFIX,
                            `💡 [문맥 보정 파싱 (3자리/중고가)] "${text}" (${raw}) ➔ ${normalizePrice(candidate)}만 으로 보정됨`
                        );
                        return normalizePrice(candidate);
                    }
                }
            }
        }

        return detail.priceStr;
    }


    // =========================================================
    // 밑줄(구분선) 메시지 감지
    // - 실시간 라이브: [밑줄] 버튼을 통해 입력되는 정확히 등호 19개("===================") 일 때만 엄격 감지
    // - 다시보기(Replay): 등호 19개 또는 등호 3개 이상(===...) 모두 지원
    // =========================================================

    const EXACT_AUCTION_SEPARATOR = '==================='; // 등호 19개

    function isSeparatorMessage(text, checkLenient = false) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        const clean = text.trim();

        // 1) 정확히 등호 19개 일치 (표준 밑줄 버튼)
        if (clean === EXACT_AUCTION_SEPARATOR) {
            return true;
        }

        // 2) 등호, 하이픈, 물결, 언더바 3개 이상 연속된 구분선 (실시간 라이브 & 다시보기 공통 지원)
        if (/^={3,}$/.test(clean) || /^-{3,}$/.test(clean) || /^~{3,}$/.test(clean) || /^__{3,}$/.test(clean)) {
            return true;
        }

        return false;
    }


    // =========================================================
    // 밑줄 위 최고가 입찰자 자동 선별 (동일가 선착순 우선 + 스마트 문맥 보정)
    // =========================================================

    function findTopBidAboveSeparator(separatorEl = null, targetDoc = null) {
        const actualDoc = (separatorEl && separatorEl.ownerDocument) || targetDoc || document;

        // 채팅 메시지 엘리먼트 목록 수집
        let chatItems = Array.from(
            actualDoc.querySelectorAll(
                'yt-live-chat-text-message-renderer, ' +
                'yt-live-chat-paid-message-renderer, ' +
                'yt-live-chat-membership-item-renderer'
            )
        );

        if (!chatItems.length && actualDoc !== document) {
            chatItems = Array.from(
                document.querySelectorAll(
                    'yt-live-chat-text-message-renderer, ' +
                    'yt-live-chat-paid-message-renderer, ' +
                    'yt-live-chat-membership-item-renderer'
                )
            );
        }

        if (!chatItems.length) {
            return null;
        }

        let targetItems = [];

        if (separatorEl) {
            let sepIndex = chatItems.indexOf(separatorEl);

            // 🛑 DOM에서 separatorEl 인덱스를 직접 찾지 못했거나 맨 앞(0)인 경우:
            // 형제 노드(previousElementSibling) 역추적 fallback
            if (sepIndex < 0) {
                const prevSiblingItems = [];
                let sibling = separatorEl.previousElementSibling;
                while (sibling) {
                    if (
                        typeof sibling.matches === 'function' &&
                        sibling.matches(
                            'yt-live-chat-text-message-renderer, ' +
                            'yt-live-chat-paid-message-renderer, ' +
                            'yt-live-chat-membership-item-renderer'
                        )
                    ) {
                        const msgEl = sibling.querySelector('#message');
                        const text = msgEl ? msgEl.textContent.trim() : '';
                        if (isSeparatorMessage(text)) {
                            break; // 직전 밑줄 도달
                        }
                        prevSiblingItems.unshift(sibling);
                    }
                    sibling = sibling.previousElementSibling;
                }
                if (prevSiblingItems.length > 0) {
                    targetItems = prevSiblingItems;
                } else {
                    // fallback: chatItems 전체에서 마지막 밑줄 이전 탐색
                    sepIndex = chatItems.length - 1;
                }
            }

            if (targetItems.length === 0 && sepIndex > 0) {
                // separatorEl 이전(위쪽) 메시지들 탐색
                let startIndex = 0;
                for (let i = sepIndex - 1; i >= 0; i--) {
                    const item = chatItems[i];
                    const msgEl = item.querySelector('#message');
                    const text = msgEl ? msgEl.textContent.trim() : '';
                    if (isSeparatorMessage(text)) {
                        startIndex = i + 1;
                        break;
                    }
                }
                targetItems = chatItems.slice(startIndex, sepIndex);
            }
        } else {
            // separatorEl이 직접 지정되지 않은 경우(예: 밑줄 버튼 클릭 시):
            // 마지막 밑줄 이후(또는 최근 60개)의 메시지들을 대상
            let startIndex = 0;
            for (let i = chatItems.length - 1; i >= 0; i--) {
                const item = chatItems[i];
                const msgEl = item.querySelector('#message');
                const text = msgEl ? msgEl.textContent.trim() : '';
                if (isSeparatorMessage(text)) {
                    startIndex = i + 1;
                    break;
                }
            }
            targetItems = chatItems.slice(startIndex);
        }

        if (!targetItems.length) {
            // 최후 fallback: separatorEl 직전 최근 30개 메시지 탐색
            if (separatorEl && chatItems.length > 0) {
                const idx = chatItems.indexOf(separatorEl);
                if (idx > 0) {
                    targetItems = chatItems.slice(Math.max(0, idx - 30), idx);
                } else {
                    targetItems = chatItems.slice(-30);
                }
            }
        }

        if (!targetItems.length) {
            return null;
        }

        // 1단계: 각 메시지에서 작성자와 입찰가 파싱 및 상세 메타데이터 수집
        const rawBids = [];

        targetItems.forEach((item, index) => {
            // 🛑 진행자, 방장, 운영자 또는 시스템 메시지는 입찰 대상에서 완벽 제외
            if (isHostOrSystemElement(item)) {
                return;
            }

            const msgEl = item.querySelector('#message');
            const chatText = msgEl ? msgEl.textContent.trim() : '';
            if (!chatText || isSystemOrNoticeMessage(chatText)) {
                return;
            }

            const authorEl = findAuthor(item);
            const nickname = getNickname(authorEl);
            if (!nickname || isHostNickname(nickname)) {
                return;
            }

            const detail = parseBidPriceDetail(chatText);
            if (detail && detail.priceNum > 0) {
                rawBids.push({
                    element: item,
                    nickname: nickname,
                    price: detail.priceNum,
                    priceStr: detail.priceStr,
                    originalChat: chatText,
                    detail: detail,
                    index: index // DOM 순서 (먼저 올라온 채팅이 낮은 index = 선착순 1위)
                });
            }
        });

        if (!rawBids.length) {
            return null;
        }

        // 2단계: 경매 블록 내 호가 문맥 분석 (Context Scale Analysis)
        // 10 미만 명확한 입찰가 (1 ~ 9.9만, 예: 5, 6, 6.5, 7, .5, 3.5 등) 및 10 이상 입찰가 수집
        const underTenBids = [];
        const tenPlusBids = [];
        const anchorPrices = [];

        rawBids.forEach(b => {
            const num = b.detail.priceNum;
            if (b.detail.isPointNumber && num < 10) {
                underTenBids.push(num);
                anchorPrices.push(num);
            } else if (num < 10 && !b.detail.isRawInteger) {
                underTenBids.push(num);
                anchorPrices.push(num);
            } else if (num < 10) {
                underTenBids.push(num);
                anchorPrices.push(num);
            } else {
                tenPlusBids.push(num);
                if (b.detail.hasExplicitUnit || b.detail.isPointNumber || num < 100) {
                    anchorPrices.push(num);
                }
            }
        });

        // 10만원 미만 단위 경매인지 정확히 판정:
        // - 10 미만 입찰가(5, 6, 7 등)가 존재하고, 10 미만 입찰가가 10 이상 입찰가보다 더 많을 때만 (예: 5, 5, 6, 6, 6.5, 7 vs 65)
        // ※ 10, 12, 15, 16, 17, 20, 21, 22, 25처럼 10 이상 입찰가가 주를 이루는 경매는 isLowScaleAuction = false!
        const isLowScaleAuction = underTenBids.length > 0 && (underTenBids.length > tenPlusBids.length || (underTenBids.length >= 3 && tenPlusBids.length <= 1));
        const underTenAvg = underTenBids.length > 0
            ? (underTenBids.reduce((sum, v) => sum + v, 0) / underTenBids.length)
            : null;

        // 전체 기준 호가 평균 (10만원 이상 경매 기준가 산출용)
        const baselineAvg = anchorPrices.length > 0
            ? (anchorPrices.reduce((sum, v) => sum + v, 0) / anchorPrices.length)
            : (tenPlusBids.length > 0 ? (tenPlusBids.reduce((sum, v) => sum + v, 0) / tenPlusBids.length) : null);

        // 3단계: 스마트 문맥 보정 (65 ➔ 6.5만 / 255 ➔ 25.5만 등 소수점 생략 입력 보정)
        const resolvedBids = rawBids.map(b => {
            let finalPrice = b.price;
            let finalPriceStr = b.priceStr;

            // 보정 조건:
            // 1) '만', '원' 등의 명시적 단위가 없고,
            // 2) 소수점이 없는 순수 정수이며,
            // 3) 2자리 정수 (29, 65, 75 등) 또는 끝자리가 5인 3자리 정수 (105, 125, 255 등)
            if (!b.detail.hasExplicitUnit && b.detail.isRawInteger) {
                const raw = b.detail.rawNum;

                // [케이스 1] 2자리 숫자 (10~99: 29 ➔ 2.9만, 27 ➔ 2.7만, 65 ➔ 6.5만 등): 10미만 경매에서 2.9만, 6.5만 등으로 보정
                if (raw >= 10 && raw <= 99 && isLowScaleAuction) {
                    const candidate = raw / 10;
                    if (underTenAvg !== null && Math.abs(candidate - underTenAvg) < Math.abs(raw - underTenAvg)) {
                        finalPrice = candidate;
                        finalPriceStr = normalizePrice(candidate);
                        console.log(
                            PREFIX,
                            `💡 [스마트 문맥 보정 (2자리)] "${b.originalChat}" (${raw}) ➔ ${finalPriceStr}만 으로 자동 보정됨 (작성자: ${b.nickname})`
                        );
                    }
                }
                // [케이스 2] 3자리 숫자 (100~999: 366 ➔ 36.6만 또는 3.66만, 255 ➔ 25.5만 등)
                else if (raw >= 100 && raw <= 999) {
                    if (isLowScaleAuction && underTenAvg !== null) {
                        // 10만원 미만 경매에서 3자리 입력 시 (예: 366 ➔ 3.66만, 255 ➔ 2.55만)
                        const candidate = raw / 100;
                        if (Math.abs(candidate - underTenAvg) < Math.abs(raw - underTenAvg)) {
                            finalPrice = candidate;
                            finalPriceStr = normalizePrice(candidate);
                            console.log(
                                PREFIX,
                                `💡 [스마트 문맥 보정 (3자리/소액)] "${b.originalChat}" (${raw}) ➔ ${finalPriceStr}만 으로 자동 보정됨 (작성자: ${b.nickname})`
                            );
                        }
                    } else {
                        // 10~99만원대 경매에서 3자리 입력 시 (예: 366 ➔ 36.6만, 255 ➔ 25.5만)
                        const candidate = raw / 10;
                        const avg = baselineAvg !== null ? baselineAvg : 20;

                        if (Math.abs(candidate - avg) < Math.abs(raw - avg)) {
                            finalPrice = candidate;
                            finalPriceStr = normalizePrice(candidate);
                            console.log(
                                PREFIX,
                                `💡 [스마트 문맥 보정 (3자리/중고가)] "${b.originalChat}" (${raw}) ➔ ${finalPriceStr}만 으로 자동 보정됨 (작성자: ${b.nickname})`
                            );
                        }
                    }
                }
            }

            return {
                ...b,
                price: finalPrice,
                priceStr: finalPriceStr
            };
        });

        // 4단계: 비정상 장난/트롤 입찰(Outlier) 필터링
        // 기준 호가(baselineAvg)가 형성되어 있고 복수의 입찰이 존재하는 상황에서,
        // 기준 호가 대비 25배 이상 비현실적으로 높은 장난 입찰(예: 3만 경매에 1억, 9999만 등)은 이상치로 제외
        let candidateBids = resolvedBids;
        if (resolvedBids.length >= 2 && baselineAvg && baselineAvg > 0) {
            const filtered = resolvedBids.filter(b => {
                if (b.price >= 500 && b.price >= baselineAvg * 25) {
                    console.warn(
                        PREFIX,
                        `⚠️ [장난/트롤 입찰 감지 및 제외] "${b.originalChat}" (${b.price}만) - 기준 호가(${Math.round(baselineAvg)}만) 대비 25배 이상 급등 이상치로 제외 (작성자: ${b.nickname})`
                    );
                    return false;
                }
                return true;
            });
            if (filtered.length > 0) {
                candidateBids = filtered;
            }
        }

        // 5단계: 최고가 탐색 및 동일가 선착순 우선 선별
        let maxPrice = -Infinity;
        candidateBids.forEach(b => {
            if (b.price > maxPrice) {
                maxPrice = b.price;
            }
        });

        // 최고가 입찰자들 필터링
        const topBids = candidateBids.filter(b => b.price === maxPrice);

        // 동일 가격일 경우 가장 먼저 올라온 채팅(index가 가장 작은 것) 우선
        const winner = topBids[0];

        return winner;
    }


    // =========================================================
    // 낙찰자 채팅 하이라이트 스타일 주입 및 강조 표시
    // =========================================================

    const AUCTION_HIGHLIGHT_STYLE_ID = '__auction_highlight_styles';

    /** 낙찰자 하이라이트 전용 스타일 주입 */
    function injectAuctionHighlightStyles(targetDoc = null) {
        const docs = targetDoc ? [targetDoc] : getTargetDocs();
        const css = `
            yt-live-chat-text-message-renderer.auction-winner-highlight,
            yt-live-chat-paid-message-renderer.auction-winner-highlight,
            yt-live-chat-membership-item-renderer.auction-winner-highlight,
            .auction-winner-highlight {
                position: relative !important;
                background: linear-gradient(90deg, rgba(245, 158, 11, 0.32) 0%, rgba(251, 191, 36, 0.18) 60%, rgba(245, 158, 11, 0.06) 100%) !important;
                border-left: 5px solid #f59e0b !important;
                border-top: 1px solid rgba(245, 158, 11, 0.45) !important;
                border-bottom: 1px solid rgba(245, 158, 11, 0.45) !important;
                box-shadow: inset 0 0 14px rgba(245, 158, 11, 0.2), 0 2px 12px rgba(245, 158, 11, 0.3) !important;
                border-radius: 4px !important;
                transition: all 0.2s ease !important;
                z-index: 10 !important;
            }

            .auction-winner-badge {
                display: inline-flex !important;
                align-items: center !important;
                gap: 4px !important;
                margin-left: 8px !important;
                padding: 2px 8px !important;
                font-size: 11px !important;
                font-weight: 800 !important;
                color: #ffffff !important;
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
                border-radius: 4px !important;
                box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4) !important;
                vertical-align: middle !important;
                letter-spacing: -0.2px !important;
                line-height: 1.2 !important;
                user-select: none !important;
                white-space: nowrap !important;
            }

            .auction-winner-badge .badge-icon {
                font-size: 12px !important;
                line-height: 1 !important;
            }
        `;

        docs.forEach(doc => {
            if (!doc) return;
            try {
                let styleEl = doc.getElementById(AUCTION_HIGHLIGHT_STYLE_ID);
                if (!styleEl) {
                    styleEl = doc.createElement('style');
                    styleEl.id = AUCTION_HIGHLIGHT_STYLE_ID;
                    styleEl.textContent = css;
                    const head = doc.head || doc.documentElement || doc.body;
                    if (head) {
                        head.appendChild(styleEl);
                    }
                }
            } catch (e) {}
        });
    }

    /**
     * 특정 채팅 요소가 속한 경매 회차(블록 키)를 계산 (예: "round_1", "round_2")
     * @param {Element|null} element - 기준 채팅 요소
     * @param {Document} doc - 대상 document
     * @returns {string} 경매 회차 고유 키
     */
    function getAuctionBlockKey(element, doc = document) {
        const chatItems = Array.from(
            doc.querySelectorAll(
                'yt-live-chat-text-message-renderer, ' +
                'yt-live-chat-paid-message-renderer, ' +
                'yt-live-chat-membership-item-renderer'
            )
        );

        if (!chatItems.length) {
            return 'round_1';
        }

        let targetIndex = element ? chatItems.indexOf(element) : -1;
        if (targetIndex === -1) {
            targetIndex = chatItems.length - 1;
        }

        // targetIndex 이전(위쪽)에 등장한 밑줄의 개수 카운트
        let separatorCount = 0;
        for (let i = 0; i < targetIndex; i++) {
            const item = chatItems[i];
            const msgEl = item.querySelector('#message');
            const text = msgEl ? msgEl.textContent.trim() : '';
            if (isSeparatorMessage(text) || /^={3,}$/.test(text) || item.classList.contains('separator-msg')) {
                separatorCount++;
            }
        }

        return `round_${separatorCount + 1}`;
    }

    /**
     * 특정 채팅 요소가 속한 경매 블록(밑줄과 밑줄 사이 구간) 내의 메시지 요소 목록을 반환
     * @param {Element} element - 기준 채팅 메시지 요소
     * @param {Document} doc - 대상 document
     * @returns {Array<Element>} 해당 경매 블록에 속한 채팅 메시지 요소들
     */
    function getAuctionBlockItems(element, doc = document) {
        if (!element) return [];

        const chatItems = Array.from(
            doc.querySelectorAll(
                'yt-live-chat-text-message-renderer, ' +
                'yt-live-chat-paid-message-renderer, ' +
                'yt-live-chat-membership-item-renderer'
            )
        );

        const targetIndex = chatItems.indexOf(element);
        if (targetIndex === -1) {
            return [element];
        }

        // 1. 위쪽(과거)으로 올라가며 직전 밑줄(경계) 찾기
        let startIndex = 0;
        for (let i = targetIndex - 1; i >= 0; i--) {
            const item = chatItems[i];
            const msgEl = item.querySelector('#message');
            const text = msgEl ? msgEl.textContent.trim() : '';
            if (isSeparatorMessage(text) || /^={3,}$/.test(text) || item.classList.contains('separator-msg')) {
                startIndex = i + 1; // 밑줄 다음 메시지부터가 현재 블록의 시작
                break;
            }
        }

        // 2. 아래쪽(미래)으로 내려가며 다음 밑줄(경계) 찾기
        let endIndex = chatItems.length - 1;
        for (let i = targetIndex; i < chatItems.length; i++) {
            const item = chatItems[i];
            const msgEl = item.querySelector('#message');
            const text = msgEl ? msgEl.textContent.trim() : '';
            if (isSeparatorMessage(text) || /^={3,}$/.test(text) || item.classList.contains('separator-msg')) {
                endIndex = i; // 밑줄까지 포함
                break;
            }
        }

        return chatItems.slice(startIndex, endIndex + 1);
    }

    /**
     * 특정 경매 블록(해당 밑줄 구간) 내에 이미 존재하는 기존 낙찰자 정보 조회
     * @param {Element|null} targetEl - 기준 채팅 요소
     * @param {Document|null} targetDoc - 대상 document
     * @returns {Object|null} 기존 낙찰자 정보 { element, nickname, price } 또는 null
     */
    function getExistingWinnerInBlock(targetEl, targetDoc = null) {
        if (!targetEl) return null;

        const doc = targetDoc || targetEl.ownerDocument || document;
        const blockItems = getAuctionBlockItems(targetEl, doc);

        // 1) DOM에서 하이라이트/뱃지를 가진 메시지 요소 탐색
        for (const item of blockItems) {
            if (!item) continue;
            if (item.classList.contains('auction-winner-highlight') || item.querySelector('.auction-winner-badge')) {
                const authorEl = findAuthor(item) || item.querySelector('#author-name');
                const nick = authorEl ? getNickname(authorEl) : '';
                const badgeEl = item.querySelector('.auction-winner-badge');
                let badgeText = badgeEl ? badgeEl.textContent : '';
                let price = '';
                const pMatch = badgeText.match(/(\d+(?:\.\d+)?)\s*만?/);
                if (pMatch) price = pMatch[1];

                return {
                    element: item,
                    nickname: nick,
                    price: price
                };
            }
        }

        // 2) DOM에 없더라도 blockKey 기준으로 저장된 낙찰 기록이 있는지 확인
        const blockKey = getAuctionBlockKey(targetEl, doc);
        const curVideoId = getCurrentVideoId();
        const today = getTodayString();
        const records = loadBidRecords();

        for (let i = records.length - 1; i >= 0; i--) {
            const r = records[i];
            if (!r) continue;
            const isCurrentVid = (curVideoId && curVideoId !== 'unknown' && curVideoId !== 'live_chat' && curVideoId !== 'live_chat_replay')
                ? (r.videoId === curVideoId || (!r.videoId || r.videoId === 'unknown' ? r.date === today : false))
                : (r.date === today || !r.videoId || r.videoId === 'unknown');

            if (isCurrentVid && r.blockKey === blockKey) {
                return {
                    element: null,
                    nickname: r.nickname || '',
                    price: r.price || ''
                };
            }
        }

        return null;
    }

    /**
     * 특정 경매 블록(해당 밑줄 구간) 내에 이미 존재하는 낙찰자 하이라이트 및 뱃지만 제거
     * -> 이전 경매 및 다른 경매 블록의 낙찰자 하이라이트는 그대로 유지!
     * @param {Element|null} targetEl - 현재 낙찰 대상 채팅 요소 (속한 블록만 클리어)
     * @param {Document|null} targetDoc - 대상 document
     */
    function clearWinnerHighlightsInBlock(targetEl, targetDoc = null) {
        if (!targetEl) return;

        const doc = targetDoc || targetEl.ownerDocument || document;
        const blockItems = getAuctionBlockItems(targetEl, doc);

        blockItems.forEach(item => {
            if (!item) return;

            // 1) 하이라이트 클래스 제거
            if (item.classList.contains('auction-winner-highlight')) {
                item.classList.remove('auction-winner-highlight');
            }

            // 2) 낙찰 뱃지 제거
            const badges = item.querySelectorAll('.auction-winner-badge');
            badges.forEach(b => {
                if (b && b.parentNode) {
                    b.parentNode.removeChild(b);
                } else if (b && typeof b.remove === 'function') {
                    b.remove();
                }
            });
        });
    }

    /**
     * 채팅창 내 낙찰자 메시지 하이라이트 표시
     * - 해당 경매 블록 내에서는 1명만 하이라이트 유지 (블록 내 기존 하이라이트는 자동 교체)
     * - 1번째, 2번째, n번째 각 경매별 낙찰자 하이라이트는 각각 1명씩 그대로 보존
     * @param {Element|null} element - 낙찰된 채팅 DOM 요소
     * @param {Object} winnerInfo - { nickname, priceStr, originalChat }
     * @param {Document|null} targetDoc - 대상 document
     */
    function highlightWinnerChatMessage(element, winnerInfo = {}, targetDoc = null) {
        injectAuctionHighlightStyles(targetDoc);

        let targetEl = element;

        // element가 없거나 연결이 끊어진 경우 닉네임 기준 역순 탐색
        if (!targetEl || !targetEl.isConnected) {
            const docs = targetDoc ? [targetDoc] : getTargetDocs();
            for (const doc of docs) {
                if (!doc) continue;
                const chatItems = Array.from(
                    doc.querySelectorAll(
                        'yt-live-chat-text-message-renderer, ' +
                        'yt-live-chat-paid-message-renderer, ' +
                        'yt-live-chat-membership-item-renderer'
                    )
                );
                for (let i = chatItems.length - 1; i >= 0; i--) {
                    const item = chatItems[i];
                    if (isHostOrSystemElement(item)) continue;
                    const authorEl = findAuthor(item);
                    const nick = getNickname(authorEl);
                    if (nick && winnerInfo.nickname && nick.trim() === winnerInfo.nickname.trim()) {
                        targetEl = item;
                        break;
                    }
                }
                if (targetEl) break;
            }
        }

        if (!targetEl) {
            console.log(PREFIX, '하이라이트 대상 요소를 찾지 못했습니다.');
            return;
        }

        // 🛑 해당 경매 블록(동일 회차/밑줄 구간) 내의 기존 하이라이트만 교체 해제 (이전 경매의 낙찰자 하이라이트 및 기록은 완벽 유지)
        clearWinnerHighlightsInBlock(targetEl, targetEl.ownerDocument || targetDoc);

        // 하이라이트 클래스 적용
        targetEl.classList.add('auction-winner-highlight');

        // 낙찰 뱃지 추가 (중복 방지)
        if (!targetEl.querySelector('.auction-winner-badge')) {
            const badge = (targetEl.ownerDocument || document).createElement('span');
            badge.className = 'auction-winner-badge';
            const priceText = winnerInfo.priceStr ? ` ${winnerInfo.priceStr}만` : '';
            badge.innerHTML = `<span class="badge-icon">👑</span>낙찰${priceText}`;

            const authorEl = targetEl.querySelector('#author-name') || targetEl.querySelector('yt-live-chat-author-chip');
            if (authorEl && authorEl.parentNode) {
                if (authorEl.nextSibling) {
                    authorEl.parentNode.insertBefore(badge, authorEl.nextSibling);
                } else {
                    authorEl.parentNode.appendChild(badge);
                }
            } else {
                const msgEl = targetEl.querySelector('#message');
                if (msgEl && msgEl.parentNode) {
                    msgEl.parentNode.insertBefore(badge, msgEl);
                } else {
                    targetEl.appendChild(badge);
                }
            }
        }

        // 부드럽게 스크롤하여 낙찰자 메시지 포커스
        try {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {}

        console.log(PREFIX, '🏆 [경매 블록별] 낙찰자 채팅 하이라이트 적용 완료:', winnerInfo.nickname || '', winnerInfo.priceStr ? winnerInfo.priceStr + '만' : '');
    }


    /**
     * 밑줄 감지 시 자동 낙찰 처리
     */
    function processSeparatorElement(separatorEl, targetDoc = null) {
        if (!separatorEl || separatorEl.dataset.auctionProcessed === 'true') {
            return;
        }

        // 중복 처리 방지 마킹
        separatorEl.dataset.auctionProcessed = 'true';

        const winner = findTopBidAboveSeparator(separatorEl, targetDoc);

        if (!winner) {
            console.log(PREFIX, '밑줄 감지: 유효 입찰자 없음');
            return;
        }

        console.log(
            PREFIX,
            '🎯 밑줄 위 최고가 자동 선별 성공:',
            winner.nickname,
            winner.priceStr + '만',
            '(원문:', winner.originalChat + ')'
        );

        // 🛑 다시보기 환경: 인풋창 자동 입력 및 DB 낙찰 기록 추가/수정은 차단하고, 채팅창 하이라이터만 완벽 적용!
        if (isReplayMode()) {
            highlightWinnerChatMessage(winner.element, winner, targetDoc);
            return;
        }

        removeAuctionUI();

        const message = createMessage(winner.nickname, winner.priceStr);
        const input = findChatInput();

        if (input) {
            setChatInput(input, message);
            input.focus();
            console.log(PREFIX, '인풋창 자동 입력 완료:', message);
        } else {
            console.log(PREFIX, '채팅 입력창 없음 (입력창 숨김): 낙찰 기록 및 하이라이트 진행');
        }

        // 낙찰 내역 기록 (밑줄 자동 감지 고유 키 부여)
        const blockKey = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        addBidRecord(
            winner.nickname,
            winner.priceStr,
            winner.originalChat || '',
            message,
            blockKey
        );

        // 🏆 채팅창에서 최고가 낙찰자 하이라이트 적용
        highlightWinnerChatMessage(winner.element, winner, targetDoc);
    }


    // =========================================================
    // 메시지 생성
    // =========================================================

    function createMessage(
        nickname,
        price
    ) {

        return (
            `👉 @${nickname}님 ` +
            `${price}만 낙찰입니다. 감사합니다😄`
        );
    }


    // =========================================================
    // DOM 생성
    // =========================================================

    function createElement(
        tag,
        options = {}
    ) {

        const element =
            document.createElement(tag);

        if (options.id) {
            element.id =
                options.id;
        }

        if (
            options.text !==
            undefined
        ) {
            element.textContent =
                options.text;
        }

        if (options.type) {
            element.type =
                options.type;
        }

        if (options.placeholder) {
            element.placeholder =
                options.placeholder;
        }

        const inputModeVal = options.inputMode || options.inputmode;
        if (inputModeVal) {
            element.inputMode =
                inputModeVal;
        }

        if (options.autocomplete) {
            element.autocomplete =
                options.autocomplete;
        }

        if (options.checked !== undefined) {
            element.checked = !!options.checked;
        }

        if (options.style) {
            element.setAttribute(
                'style',
                options.style
            );
        }

        return element;
    }


    // =========================================================
    // 숫자/소수점 입력값 정제 헬퍼 (숫자 및 단일 소수점만 허용, 쉼표 자동 변환)
    // =========================================================

    function sanitizeDecimalInput(value) {
        if (typeof value !== 'string') return '';
        let clean = value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const parts = clean.split('.');
        if (parts.length > 2) {
            clean = parts[0] + '.' + parts.slice(1).join('');
        }
        return clean;
    }


    // =========================================================
    // UI 제거
    // =========================================================

    function removeCustomModals() {
        const docs = getTargetDocs();
        docs.forEach(doc => {
            try {
                if (!doc) return;
                const ids = [
                    '__auction_auto_modal',
                    '__auction_auto_backdrop',
                    '__auction_spec_modal',
                    '__auction_spec_backdrop',
                    '__auction_price_choice_modal',
                    '__auction_price_choice_backdrop',
                    '__auction_price_amount_modal',
                    '__auction_price_amount_backdrop'
                ];
                ids.forEach(id => {
                    const el = doc.getElementById(id);
                    if (el) el.remove();
                });
            } catch (e) {}
        });
    }

    function removeAuctionUI() {
        removeCustomModals();
    }


    // =========================================================
    // 낙찰 내역 UI 제거
    // =========================================================

    let _bidListKeydownHandler = null;
    let _lastOpenBidListModalTime = 0;

    function getTargetDocs() {
        const docs = [document];
        const addDoc = (d) => {
            if (d && !docs.includes(d)) {
                docs.push(d);
            }
        };

        try {
            const input = findChatInput();
            if (input && input.ownerDocument) {
                addDoc(input.ownerDocument);
            }
        } catch (e) {}

        try {
            const iframe = document.querySelector('iframe#chatframe');
            if (iframe && iframe.contentDocument) {
                addDoc(iframe.contentDocument);
            }
        } catch (e) {}

        try {
            if (window.top && window.top.document) {
                addDoc(window.top.document);
                const topIframes = window.top.document.querySelectorAll('iframe');
                topIframes.forEach(f => {
                    try {
                        if (f.contentDocument) addDoc(f.contentDocument);
                    } catch (e) {}
                });
            }
        } catch (e) {}

        try {
            if (window.parent && window.parent.document) {
                addDoc(window.parent.document);
            }
        } catch (e) {}

        return docs;
    }

    /** 채팅창 내부 우선 마운트 타겟 획득 (라이브 및 다시보기/일반 영상 대응) */
    function getChatMountTarget() {
        if (window.location.pathname.startsWith('/live_chat')) {
            return document.body || document.documentElement;
        }
        try {
            const input = findChatInput();
            if (input && input.ownerDocument && input.ownerDocument.body) {
                return input.ownerDocument.body;
            }
        } catch (e) {}
        try {
            const iframe = document.querySelector('iframe#chatframe');
            if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
                return iframe.contentDocument.body;
            }
        } catch (e) {}
        return document.body || document.documentElement;
    }

    function removeBidListUI() {
        const docs = getTargetDocs();

        if (_bidListKeydownHandler) {
            docs.forEach(doc => {
                try {
                    const win = doc.defaultView || window;
                    win.removeEventListener('keydown', _bidListKeydownHandler, true);
                } catch (e) {}
            });
            window.removeEventListener('keydown', _bidListKeydownHandler, true);
            _bidListKeydownHandler = null;
        }

        docs.forEach(doc => {
            try {
                if (!doc) return;
                const modal = doc.getElementById('__auction_bid_list_modal');
                const backdrop = doc.getElementById('__auction_bid_list_backdrop');
                if (modal) modal.remove();
                if (backdrop) backdrop.remove();
            } catch (e) {}
        });
    }


    // =========================================================
    // 플로팅 낙찰 내역 버튼 (미사용 주석 처리)
    // =========================================================

    /*
    function createFloatingBidButton() {
        if (window !== window.top) {
            return null; // 최상위 메인 윈도우에서만 생성
        }

        const existing = document.getElementById('__auction_floating_bid_btn');
        if (existing) return existing;

        const btn = createElement(
            'button',
            {
                id: '__auction_floating_bid_btn',
                type: 'button',
                title: '낙찰 내역 보기 및 CSV 다운로드',
                style: `
                    position: fixed !important;
                    bottom: 24px !important;
                    right: 24px !important;
                    z-index: 2147483640 !important;
                    background: linear-gradient(135deg, rgba(32,32,40,.96), rgba(18,18,24,.96)) !important;
                    border: 1px solid rgba(255,204,0,.40) !important;
                    color: #ffcc00 !important;
                    border-radius: 24px !important;
                    padding: 8px 16px !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                    font-size: 12.5px !important;
                    font-weight: 800 !important;
                    line-height: 1.3 !important;
                    box-shadow: 0 8px 24px rgba(0,0,0,.70), 0 0 14px rgba(255,204,0,.18) !important;
                    backdrop-filter: blur(8px) !important;
                    -webkit-backdrop-filter: blur(8px) !important;
                    cursor: pointer !important;
                    display: none;
                    align-items: center !important;
                    gap: 6px !important;
                    transition: transform .15s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease !important;
                    user-select: none !important;
                `
            }
        );

        const count = getTodayBidRecords().length;
        const totalAll = loadBidRecords().length;
        const displayCount = count > 0 ? count : totalAll;
        btn.textContent = `📋 낙찰 내역 (${displayCount}건)`;

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-2px) scale(1.02)';
            btn.style.background = 'linear-gradient(135deg, rgba(46,46,58,.98), rgba(26,26,34,.98))';
            btn.style.borderColor = 'rgba(255,204,0,.65)';
            btn.style.boxShadow = '0 12px 28px rgba(0,0,0,.80), 0 0 18px rgba(255,204,0,.30)';
            btn.style.color = '#ffe066';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateY(0) scale(1)';
            btn.style.background = 'linear-gradient(135deg, rgba(32,32,40,.96), rgba(18,18,24,.96))';
            btn.style.borderColor = 'rgba(255,204,0,.40)';
            btn.style.boxShadow = '0 8px 24px rgba(0,0,0,.70), 0 0 14px rgba(255,204,0,.18)';
            btn.style.color = '#ffcc00';
        });
        btn.addEventListener('mousedown', () => {
            btn.style.transform = 'translateY(0) scale(.96)';
        });
        btn.addEventListener('mouseup', () => {
            btn.style.transform = 'translateY(-2px) scale(1.02)';
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openBidListModal();
        });

        const mount = document.body || document.documentElement;
        if (mount) mount.appendChild(btn);

        return btn;
    }

    function updateFloatingBidButton() {
        if (window !== window.top) return;

        let btn = document.getElementById('__auction_floating_bid_btn');
        if (!btn) {
            btn = createFloatingBidButton();
        }
        if (!btn) return;

        // 채팅 입력창 안내 패널이 DOM에 활성화되어 있는지 확인
        let isGuidePanelVisible = !!document.getElementById('__auction_guide_panel');
        if (!isGuidePanelVisible) {
            try {
                const iframe = document.querySelector('iframe#chatframe');
                if (iframe && iframe.contentDocument) {
                    if (iframe.contentDocument.getElementById('__auction_guide_panel')) {
                        isGuidePanelVisible = true;
                    }
                }
            } catch (e) {}
        }

        const todayRecords = getTodayBidRecords();
        btn.textContent = `📋 낙찰 내역 (${todayRecords.length}건)`;

        // 안내 패널이 활성화되어 있으면 채팅창 내 버튼이 있으므로 플로팅 숨김,
        // 방송이 종료되거나 채팅창이 닫혀 안내 패널이 없을 때 플로팅 버튼 노출
        if (isGuidePanelVisible) {
            btn.style.display = 'none';
        } else {
            const pathname = window.location.pathname || '';
            const isWatchPage = pathname.startsWith('/watch') || pathname.startsWith('/live');
            if (todayRecords.length > 0 || isWatchPage) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        }
    }
    */
    function createFloatingBidButton() { return null; }
    function updateFloatingBidButton() {}


    // =========================================================
    // 낙찰 내역 모달 (현재 방송 전용 - 미사용 주석 처리)
    // =========================================================

    function openBidListModal() {
        // 미사용 처리
        return;

        const nowTime = Date.now();
        if (nowTime - _lastOpenBidListModalTime < 250) {
            return;
        }
        _lastOpenBidListModalTime = nowTime;

        console.log(PREFIX, '📋 낙찰 내역 모달 열기 실행!');

        try {
            removeBidListUI();

            let records = [];
            try {
                records = getTodayBidRecords() || [];
            } catch (e) {
                console.error(PREFIX, '기록 불러오기 오류:', e);
                records = [];
            }

            const totalCount = records.length;
            let totalPrice = 0;
            records.forEach(r => {
                const p = parseFloat(r && r.price);
                if (!isNaN(p)) {
                    totalPrice += p;
                }
            });
            const totalPriceStr =
                Number.isInteger(totalPrice)
                    ? String(totalPrice)
                    : totalPrice.toFixed(1).replace(/\.0$/, '');

            // -- Backdrop --

            const backdrop = createElement(
                'div',
                {
                    id: '__auction_bid_list_backdrop',
                    style: `
                        position:fixed !important;
                        inset:0 !important;
                        width:100vw !important;
                        height:100vh !important;
                        background:rgba(0,0,0,.75) !important;
                        backdrop-filter:blur(6px) !important;
                        -webkit-backdrop-filter:blur(6px) !important;
                        z-index:2147483646 !important;
                        pointer-events:auto !important;
                        opacity:1 !important;
                        visibility:visible !important;
                        overscroll-behavior:contain !important;
                    `
                }
            );


            // -- Modal (Compact Layout - 330px 너비) --

            const modal = createElement(
                'div',
                {
                    id: '__auction_bid_list_modal',
                    style: `
                        position:fixed !important;
                        left:50% !important;
                        top:50% !important;
                        transform:translate(-50%,-50%) !important;
                        width:330px !important;
                        max-width:calc(100vw - 24px) !important;
                        max-height:calc(100vh - 32px) !important;
                        box-sizing:border-box !important;
                        padding:16px 16px 18px !important;
                        background:linear-gradient(145deg, rgba(32,32,38,.99), rgba(18,18,22,.99)) !important;
                        color:#fff !important;
                        border:1px solid rgba(255,255,255,.16) !important;
                        border-radius:18px !important;
                        box-shadow:0 25px 80px rgba(0,0,0,.90), 0 0 0 1px rgba(255,255,255,.05) !important;
                        z-index:2147483647 !important;
                        display:flex !important;
                        flex-direction:column !important;
                        gap:10px !important;
                        font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                        overflow:hidden !important;
                        opacity:1 !important;
                        visibility:visible !important;
                        pointer-events:auto !important;
                        overscroll-behavior:contain !important;
                    `
                }
            );


            // -- Header --

            const header = createElement(
                'div',
                {
                    style: `
                        display:flex !important;
                        align-items:center !important;
                        justify-content:space-between !important;
                    `
                }
            );

            const title = createElement(
                'div',
                {
                    style: `
                        display:flex !important;
                        align-items:center !important;
                        gap:8px !important;
                        font-size:15px !important;
                        font-weight:800 !important;
                        color:#fff !important;
                    `
                }
            );
            const titleIcon = createElement('div', {
                text: '📋',
                style: `
                    width:26px !important;
                    height:26px !important;
                    display:flex !important;
                    align-items:center !important;
                    justify-content:center !important;
                    border-radius:8px !important;
                    background:rgba(255,204,0,.14) !important;
                    color:#ffcc00 !important;
                    font-size:14px !important;
                    font-weight:800 !important;
                `
            });
            const titleText = createElement('span', { text: '낙찰 내역' });
            title.appendChild(titleIcon);
            title.appendChild(titleText);

            const closeBtn = createElement(
                'button',
                {
                    type: 'button',
                    text: '×',
                    style: `
                        width:26px !important;
                        height:26px !important;
                        padding:0 !important;
                        border:0 !important;
                        border-radius:8px !important;
                        background:rgba(255,255,255,.08) !important;
                        color:rgba(255,255,255,.75) !important;
                        font-size:19px !important;
                        line-height:24px !important;
                        cursor:pointer !important;
                    `
                }
            );
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'rgba(255,255,255,.18)';
                closeBtn.style.color = '#fff';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'rgba(255,255,255,.08)';
                closeBtn.style.color = 'rgba(255,255,255,.75)';
            });
            closeBtn.addEventListener('click', removeBidListUI);

            header.appendChild(title);
            header.appendChild(closeBtn);
            modal.appendChild(header);


            // -- 통계 카드 --

            const statsCard = createElement(
                'div',
                {
                    style: `
                        display:flex !important;
                        gap:6px !important;
                    `
                }
            );

            let statCountValEl = null;
            let statPriceValEl = null;

            function makeStatBox(label, value, color, role) {
                const box = createElement(
                    'div',
                    {
                        style: `
                            flex:1 !important;
                            padding:8px 10px !important;
                            border-radius:10px !important;
                            background:rgba(255,255,255,.04) !important;
                            border:1px solid rgba(255,255,255,.08) !important;
                        `
                    }
                );
                const lbl = createElement('div', {
                    text: label,
                    style: 'font-size:10px !important; color:rgba(255,255,255,.45) !important; font-weight:600 !important; margin-bottom:2px !important;'
                });
                const val = createElement('div', {
                    text: value,
                    style: `font-size:16px !important; font-weight:800 !important; color:${color} !important; font-variant-numeric:tabular-nums !important; font-feature-settings:"tnum" 1 !important;`
                });
                if (role === 'count') statCountValEl = val;
                if (role === 'price') statPriceValEl = val;
                box.appendChild(lbl);
                box.appendChild(val);
                return box;
            }

            statsCard.appendChild(makeStatBox('총 낙찰', `${totalCount}건`, '#ffcc00', 'count'));
            statsCard.appendChild(makeStatBox('합계 금액', `${totalPriceStr}만`, '#6ee0a0', 'price'));
            modal.appendChild(statsCard);


            // -- 액션 버튼 행 --

            const actionRow = createElement(
                'div',
                {
                    style: `display:flex !important; gap:5px !important;`
                }
            );

            function makeActionBtn(emoji, label, bg, borderC, textC, onClick) {
                const btn = createElement(
                    'button',
                    {
                        type: 'button',
                        text: `${emoji} ${label}`,
                        style: `
                            flex:1 !important;
                            height:30px !important;
                            padding:0 4px !important;
                            border:1px solid ${borderC} !important;
                            border-radius:8px !important;
                            background:${bg} !important;
                            color:${textC} !important;
                            font-size:11px !important;
                            font-weight:700 !important;
                            cursor:pointer !important;
                            white-space:nowrap !important;
                            overflow:hidden !important;
                            text-overflow:ellipsis !important;
                            transition:opacity .15s !important;
                        `
                    }
                );
                btn.addEventListener('mouseenter', () => { btn.style.opacity = '.8'; });
                btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
                btn.addEventListener('click', onClick);
                return btn;
            }

            // 정렬 및 그룹화 상태 관리
            const SORT_STORAGE_KEY = '__auction_bid_sort';
            const GROUP_BIDDER_STORAGE_KEY = '__auction_group_bidder_option';
            let currentSort = 'newest';
            let groupBidderOption = false;
            try {
                currentSort = localStorage.getItem(SORT_STORAGE_KEY) || 'newest';
                groupBidderOption = localStorage.getItem(GROUP_BIDDER_STORAGE_KEY) === 'true';
            } catch (e) {}

            function sortBidRecords(list, sortType) {
                const arr = [...list];
                switch (sortType) {
                    case 'newest': // 최신순 (최근 등록 순)
                        return arr.sort((a, b) => (b.id || 0) - (a.id || 0));
                    case 'oldest': // 오래된 순 (최초 등록 순)
                        return arr.sort((a, b) => (a.id || 0) - (b.id || 0));
                    case 'price_desc': // 가격 높은 순
                        return arr.sort((a, b) => {
                            const pa = parseFloat(a.price) || 0;
                            const pb = parseFloat(b.price) || 0;
                            if (pb !== pa) return pb - pa;
                            return (b.id || 0) - (a.id || 0);
                        });
                    case 'price_asc': // 가격 낮은 순
                        return arr.sort((a, b) => {
                            const pa = parseFloat(a.price) || 0;
                            const pb = parseFloat(b.price) || 0;
                            if (pa !== pb) return pa - pb;
                            return (b.id || 0) - (a.id || 0);
                        });
                    default:
                        return arr.sort((a, b) => (b.id || 0) - (a.id || 0));
                }
            }

            function groupBidRecordsByNickname(list, sortType) {
                // 1) 기준 정렬 적용
                const sorted = sortBidRecords(list, sortType);
                // 2) 닉네임 그룹화 (첫 등장 순서 보장: Map)
                const groupMap = new Map();
                sorted.forEach(r => {
                    const nick = (r && r.nickname) ? String(r.nickname).trim() : '';
                    if (!groupMap.has(nick)) {
                        groupMap.set(nick, []);
                    }
                    groupMap.get(nick).push(r);
                });
                // 3) 각 그룹 내에서도 동일 정렬 기준 유지 및 평탄화
                const result = [];
                groupMap.forEach(groupItems => {
                    const sortedGroup = sortBidRecords(groupItems, sortType);
                    result.push(...sortedGroup);
                });
                return result;
            }


            // =========================================================
            // 경매양식 원본(경매양식원본.xls) 내보내기 엔진 (BIFF8 / OLE2)
            // =========================================================

            const AUCTION_TEMPLATE_GZIP_B64 = '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3ulafzWud9H1TnG9k653+rjeKa530vVOjyvGA3eK6528b90prnfS9U5xvYuvKN4prtv4vMud4nonXe8U1+d51sqdjutdrvVX43o3Xe8S17voepeP613iehdd7xLXu1mvd4nrXazXu8T1Lrre5XFFvd7lWX+F613i+kSkO8dc7xLXxznOustxvdu1/mpca9L1bnG9m653+7jeLa530/Vujyvq9W5xrcnx693iejdd7xbXVZxv3S2uCRy/3i2ud7Ne7xbX6Rxn3e241nStvxrXe+haU1xr0rWmj2tNca1J15riWpOuNcX1HrrWFNeadK0prqPpWlNch/JRw5riWpOuNfVRZN63ajqu97jWX41rLbreI6730PUeH9d7xPUeut4jrrXYB+7xuKK/3iOu99D1HnG9h33gHnEdzPHAPeJ6D13v0ecJY1mJuN4TvNzHrNeyPIp7ryV2nyVW2xKrY4ndb4nVtcTqWWIPWGIPWmIPWWL1LbGHLbFHLLEGltijllhDS+wxS+xxS+wJS+xJS+wpS+xpS6yRJfaMJfasJdbYEmtiiT1niT1viTW1xF6wPOJdy7WPYPrDvewPtaQ/1GJ/qOXTH2pJf6jF/lBL+sO97A+1pD/U4jihlvSHWuwPtaQ/1GJ/qCX9oRbvZ7U889t4d3+oJf1hPtcPazl9917XPoJxvY+u94rrvXS918f1XnG9l673elyxLnuvuN7LvnuvuN7Hddl7xfXWIPa97hXXe9l37xXXe9l379UjeDiuvddxvc+1j2Bca9P1PnG9j673+bjeJ6730fU+ca3Ner1PXO+j630eV9TrfXpsNZ83vk9c76PrfeJ6H13vE9c1nIfd57jWdu0jGNc6dK0trrXpWtvHtba41qZrbXGtQ9fa4jqc+zO1xbU2XWuLa232gdriWpuutcW1Nl1ri+tMjmtrO651XPsIxvV+utYR1zp0rePjWkdc69C1jrjeT9c6uk/L543riGsdutYR12/5vEYdca1D1zriWoeudfTsW87D6jiu97v2EYxrXbreL6730/V+H9f7xfV+ut7vcUV/vV+Pr+fzcPeL6/10vV9cj/J5uPv1TGEeGXW/uN5P1/vF9S263u+41nXtI3TOdq1H17riWpeudX1c64prXbrWFde6dK0rrotZr3XFtS5d6+r7R1yXrSuu9ehaV1zr0rWurhtwXbau41rP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ZXGtTNfK4lqOdaCy51rF1+1uXKvStYq4VqFrFYdrFXGtQtcq4lqVrlW0e5iuVcS1Cl2riOsvUaivVcS1MetAFXGtQtcq+vV9ulbxXKv6ut2NazW6VhXXqnSt6nCtKq5V6Vo14Ir6WlVcq7G+VhXXqnStKq6JkX95bMplOX6KrlXFtSpdq4rrDNaBqp5rNV+3u3GtTtdq4lqNrtUcrtXEtRpdq4lrdeZrtYAr8rWauFajazVxLct5VrVA1yBcq4lrNbpWE9crdK3muVb3dbsb1xp0rS6u1ela3eFaXVyr07W6uNaga/WQvlwRu//VxbU6XauL68Jo1Nfq4lqd963q4lqdrtUD6y24Vvdca/i63Y1rTbrWENcadK3hcK0hrjXoWiPginVsDXGtyTpQQ1xr0LWGuK5kfa0hrjXoWkNca9C1hrhuY32t4bnW9HW7G9dadK0prjXpWtPhWlNca9K1prjWYr7WDLhivVVTXGvStaa4ZuL+QE1xrUnXmuJak641xXUd87Wm51rL1+1uXGvTtZa41qJrLYdrLXGtRddaAVfct2qJa23may1xrUXXWuI6iPlaS1xjWF9riWstutYS14rcH6jludb2dbsb1zp0rS2utela2+FaW1xr07W2uNama21xrUPX2uJam661xTUhBvlaW1zfp2ttca1N19rimonrrdqeax1ft7txrUvXOuJah651HK51xLUOXeuIax261hHXunStI6516FpHXD+Jhmsdca0Twr5LHXGtQ9c64npnDFzreK51fd3uxrUeXeuKa1261nW41hXXunStK671WF/rBva1MR+oK6516VpXXNdFYT5QV1zrsr7WFde6dK0rrgV536rrudbzdbsb1/p0rSeu9ehaz+FaT1zr0bWeuNana72QvnYFrvXEtR5d6wWeAqK+1hPXenStJ6716FpPXGtHI1/rea71fd3uxrUBXeuLa3261ne41hfX+nStL64N6FpfXOtzXVBfXOvTtb64zuD8tb64HuH+QH1xrU/X+np8KvO1vufawNftblwb0rWBuDagawOHawNxbUDXBuLakK4NxLUBXRuIawO6NhDXutFYxzYQ19N0bSCuDejaQFwvM18bhG73MesNLV3JjSyxxpZYE0usqSWWYIk1s8SaW2ItLLGWllgrSyzREmttibWxxJIssbaWWDtLrL0l1sES62iJdbLE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';

            /** GZIP 압축된 Base64 데이터를 Uint8Array로 압축 해제 */
            async function decompressGzipBase64(base64Str) {
                const binStr = atob(base64Str);
                const len = binStr.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binStr.charCodeAt(i);
                }
                if (typeof DecompressionStream !== 'undefined') {
                    const ds = new DecompressionStream('gzip');
                    const writer = ds.writable.getWriter();
                    writer.write(bytes);
                    writer.close();
                    const response = new Response(ds.readable);
                    const arrayBuffer = await response.arrayBuffer();
                    return new Uint8Array(arrayBuffer);
                }
                throw new Error('DecompressionStream을 지원하지 않는 브라우저 환경입니다.');
            }

            /** BIFF8 NUMBER 레코드(0x0203) 생성 */
            function createNumberRecord(row, col, xf, val) {
                const buf = new Uint8Array(18);
                const view = new DataView(buf.buffer);
                view.setUint16(0, 0x0203, true);
                view.setUint16(2, 14, true);
                view.setUint16(4, row, true);
                view.setUint16(6, col, true);
                view.setUint16(8, xf, true);
                view.setFloat64(10, Number(val) || 0, true);
                return buf;
            }

            /** BIFF8 LABEL 레코드(0x0204, UTF-16LE 직접 저장) 생성 */
            function createLabelRecord(row, col, xf, text) {
                const str = String(text || '');
                const cch = str.length;
                const recLen = 9 + cch * 2;
                const byteLen = 4 + recLen;
                const buf = new Uint8Array(byteLen);
                const view = new DataView(buf.buffer);
                view.setUint16(0, 0x0204, true);
                view.setUint16(2, recLen, true);
                view.setUint16(4, row, true);
                view.setUint16(6, col, true);
                view.setUint16(8, xf, true);
                view.setUint16(10, cch, true);
                buf[12] = 1; // UTF-16LE 플래그
                for (let i = 0; i < cch; i++) {
                    view.setUint16(13 + i * 2, str.charCodeAt(i), true);
                }
                return buf;
            }

            /** BIFF8 BLANK 레코드(0x0201) 생성 */
            function createBlankRecord(row, col, xf) {
                const buf = new Uint8Array(10);
                const view = new DataView(buf.buffer);
                view.setUint16(0, 0x0201, true);
                view.setUint16(2, 6, true);
                view.setUint16(4, row, true);
                view.setUint16(6, col, true);
                view.setUint16(8, xf, true);
                return buf;
            }

            /** BIFF8 MULBLANK 레코드(0x00BE) 생성 */
            function createMulblankRecord(row, firstCol, lastCol, xfs) {
                const count = lastCol - firstCol + 1;
                const recLen = 4 + count * 2 + 2;
                const byteLen = 4 + recLen;
                const buf = new Uint8Array(byteLen);
                const view = new DataView(buf.buffer);
                view.setUint16(0, 0x00BE, true);
                view.setUint16(2, recLen, true);
                view.setUint16(4, row, true);
                view.setUint16(6, firstCol, true);
                for (let i = 0; i < count; i++) {
                    view.setUint16(8 + i * 2, xfs[i], true);
                }
                view.setUint16(8 + count * 2, lastCol, true);
                return buf;
            }

            /** BIFF8 FORMULA 레코드(0x0006, 공유 수식 참조 ptgExp 5바이트) 생성 */
            function createSharedFormulaRecord(row, col, xf, baseRow, baseCol) {
                const buf = new Uint8Array(31);
                const view = new DataView(buf.buffer);
                view.setUint16(0, 0x0006, true);
                view.setUint16(2, 27, true);      // 레코드 길이 27바이트
                view.setUint16(4, row, true);     // 행
                view.setUint16(6, col, true);     // 열
                view.setUint16(8, xf, true);      // 스타일 XF
                // 결과(8바이트): 0
                view.setUint16(18, 0x0008, true); // 로드 시 재계산 플래그
                // chn(4바이트): 0
                view.setUint16(24, 5, true);      // cce 수식 길이 5바이트
                buf[26] = 0x01;                   // ptgExp (공유 수식 참조)
                view.setUint16(27, baseRow, true);// 기준 행
                view.setUint16(29, baseCol, true);// 기준 열
                return buf;
            }

            /** OLE2 Compound Document 컨테이너 바이너리 빌드 (동적 FAT / Directory 할당) */
            function buildOle2CompoundFile(streams) {
                const SECTOR_SIZE = 512;
                function padSector(data) {
                    const rem = data.length % SECTOR_SIZE;
                    if (rem === 0) return data;
                    const padded = new Uint8Array(data.length + (SECTOR_SIZE - rem));
                    padded.set(data, 0);
                    return padded;
                }

                const streamNames = ['Workbook', '\x05SummaryInformation', '\x05DocumentSummaryInformation'];
                const streamSectors = {};
                const streamData = [];
                const fatEntries = [];
                let sectorOffset = 0;

                for (let i = 0; i < streamNames.length; i++) {
                    const name = streamNames[i];
                    const sBytes = streams[name];
                    const padded = padSector(sBytes);
                    const numSec = padded.length / SECTOR_SIZE;
                    const startSec = sectorOffset;
                    streamSectors[name] = { startSec: startSec, size: sBytes.length, numSec: numSec };
                    sectorOffset += numSec;
                    streamData.push(padded);

                    for (let s = 0; s < numSec - 1; s++) {
                        fatEntries.push(startSec + s + 1);
                    }
                    fatEntries.push(0xFFFFFFFE); // ENDOFCHAIN
                }

                const dirStartSec = sectorOffset;
                const dirNumSec = 1;
                sectorOffset += dirNumSec;
                fatEntries.push(0xFFFFFFFE); // ENDOFCHAIN for directory

                function makeDirEntry(name, entryType, startSec, size, left, right, child) {
                    const entry = new Uint8Array(128);
                    const view = new DataView(entry.buffer);
                    const nameLen = name.length;
                    for (let i = 0; i < nameLen; i++) {
                        view.setUint16(i * 2, name.charCodeAt(i), true);
                    }
                    view.setUint16(64, (nameLen + 1) * 2, true);
                    view.setUint8(66, entryType);
                    view.setUint8(67, 0);

                    view.setUint32(68, left >= 0 ? left : 0xFFFFFFFF, true);
                    view.setUint32(72, right >= 0 ? right : 0xFFFFFFFF, true);
                    view.setUint32(76, child >= 0 ? child : 0xFFFFFFFF, true);

                    view.setUint32(116, startSec, true);
                    view.setUint32(120, size, true);
                    view.setUint32(124, 0, true);
                    return entry;
                }

                const d0 = makeDirEntry('Root Entry', 5, 0, 0, -1, -1, 2);
                const d1 = makeDirEntry('Workbook', 2, streamSectors['Workbook'].startSec, streamSectors['Workbook'].size, -1, -1, -1);
                const d2 = makeDirEntry('\x05SummaryInformation', 2, streamSectors['\x05SummaryInformation'].startSec, streamSectors['\x05SummaryInformation'].size, 1, 3, -1);
                const d3 = makeDirEntry('\x05DocumentSummaryInformation', 2, streamSectors['\x05DocumentSummaryInformation'].startSec, streamSectors['\x05DocumentSummaryInformation'].size, -1, -1, -1);

                const dirData = new Uint8Array(512);
                dirData.set(d0, 0);
                dirData.set(d1, 128);
                dirData.set(d2, 256);
                dirData.set(d3, 384);

                const totalDataSectors = sectorOffset;
                let numFatSectors = 1;
                while (true) {
                    const totalSectors = totalDataSectors + numFatSectors;
                    if (numFatSectors * 128 >= totalSectors) {
                        break;
                    }
                    numFatSectors++;
                }

                const fatStartSec = totalDataSectors;
                for (let i = 0; i < numFatSectors; i++) {
                    fatEntries.push(0xFFFFFFFD); // FATSECT
                }
                while (fatEntries.length < numFatSectors * 128) {
                    fatEntries.push(0xFFFFFFFF); // FREESECT
                }

                const fatData = new Uint8Array(fatEntries.length * 4);
                const fatView = new DataView(fatData.buffer);
                for (let i = 0; i < fatEntries.length; i++) {
                    fatView.setUint32(i * 4, fatEntries[i], true);
                }

                const hdr = new Uint8Array(512);
                const hdrView = new DataView(hdr.buffer);
                const magic = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
                for (let i = 0; i < 8; i++) hdr[i] = magic[i];

                hdrView.setUint16(24, 0x003E, true);
                hdrView.setUint16(26, 0x0003, true);
                hdrView.setUint16(28, 0xFFFE, true);
                hdrView.setUint16(30, 9, true);
                hdrView.setUint16(32, 6, true);

                hdrView.setUint32(44, numFatSectors, true);
                hdrView.setUint32(48, dirStartSec, true);
                hdrView.setUint32(56, 0x00001000, true);

                hdrView.setUint32(60, 0xFFFFFFFE, true);
                hdrView.setUint32(68, 0xFFFFFFFE, true);

                for (let i = 0; i < numFatSectors && i < 109; i++) {
                    hdrView.setUint32(76 + i * 4, fatStartSec + i, true);
                }
                for (let i = numFatSectors; i < 109; i++) {
                    hdrView.setUint32(76 + i * 4, 0xFFFFFFFF, true);
                }

                let totalOutputSize = 512;
                for (let i = 0; i < streamData.length; i++) totalOutputSize += streamData[i].length;
                totalOutputSize += dirData.length;
                totalOutputSize += fatData.length;

                const outBuf = new Uint8Array(totalOutputSize);
                outBuf.set(hdr, 0);
                let curOutPos = 512;
                for (let i = 0; i < streamData.length; i++) {
                    outBuf.set(streamData[i], curOutPos);
                    curOutPos += streamData[i].length;
                }
                outBuf.set(dirData, curOutPos);
                curOutPos += dirData.length;
                outBuf.set(fatData, curOutPos);

                return outBuf;
            }

            /** 경매양식원본.xls 원본에 6G(낙찰가)와 6H(낙찰자)만 주입하고 기존 수식을 100% 보존하여 새 바이너리 생성 */
            function fillAuctionTemplateXls(origXlsBytes, bidList) {
                const origBytes = new Uint8Array(origXlsBytes);
                const headerView = new DataView(origBytes.buffer, origBytes.byteOffset, origBytes.byteLength);
                const dirStartSec = headerView.getUint32(48, true);
                const dirOffset = (dirStartSec + 1) * 512;

                const getStreamInfo = (entryIndex) => {
                    const entryOffset = dirOffset + entryIndex * 128;
                    const startSec = headerView.getUint32(entryOffset + 116, true);
                    const size = headerView.getUint32(entryOffset + 120, true);
                    return { startSec, size };
                };

                const wbInfo = getStreamInfo(1);
                const siInfo = getStreamInfo(2);
                const dsiInfo = getStreamInfo(3);

                const wbStreamBytes = origBytes.subarray((wbInfo.startSec + 1) * 512, (wbInfo.startSec + 1) * 512 + wbInfo.size);
                const siBytes = origBytes.subarray((siInfo.startSec + 1) * 512, (siInfo.startSec + 1) * 512 + siInfo.size);
                const dsiBytes = origBytes.subarray((dsiInfo.startSec + 1) * 512, (dsiInfo.startSec + 1) * 512 + dsiInfo.size);

                const records = [];
                let pos = 0;
                let currentSheet = -1;
                const view = new DataView(wbStreamBytes.buffer, wbStreamBytes.byteOffset, wbStreamBytes.byteLength);

                while (pos <= wbStreamBytes.length - 4) {
                    const recType = view.getUint16(pos, true);
                    const recLen = view.getUint16(pos + 2, true);
                    const recData = wbStreamBytes.subarray(pos + 4, pos + 4 + recLen);
                    if (recType === 0x0809) {
                        currentSheet++;
                    }
                    records.push({
                        type: recType,
                        data: new Uint8Array(recData),
                        sheet: currentSheet
                    });
                    pos += 4 + recLen;
                }

                const newRecords = [];
                const sampleBids = bidList || [];

                for (let i = 0; i < records.length; i++) {
                    const rec = records[i];
                    if (rec.sheet !== 1) { // 1번 시트: '경매현황'
                        newRecords.push(rec);
                        continue;
                    }

                    const rtype = rec.type;
                    const rdata = rec.data;
                    const rview = new DataView(rdata.buffer, rdata.byteOffset, rdata.byteLength);

                    // 1) 7번 행 (1번 물품: 6D 수량=1, 6G 낙찰가, 6H 낙찰자 주입)
                    if ((rtype === 0x027E || rtype === 0x0203) && rdata.length >= 6) {
                        const row = rview.getUint16(0, true);
                        const col = rview.getUint16(2, true);
                        const xf = rview.getUint16(4, true);
                        if (row === 7 && col === 3) { // 6D 수량 열 (항목 존재 시 무조건 1)
                            if (sampleBids.length >= 1) {
                                const recBytes = createNumberRecord(7, 3, xf, 1);
                                newRecords.push({ raw: recBytes });
                                continue;
                            }
                        } else if (row === 7 && col === 6) { // 6G 낙찰가 열
                            if (sampleBids.length >= 1) {
                                const recBytes = createNumberRecord(7, 6, xf, sampleBids[0].price);
                                newRecords.push({ raw: recBytes });
                                continue;
                            }
                        }
                    } else if ((rtype === 0x00FD || rtype === 0x0204) && rdata.length >= 6) {
                        const row = rview.getUint16(0, true);
                        const col = rview.getUint16(2, true);
                        const xf = rview.getUint16(4, true);
                        if (row === 7 && col === 7) { // 6H 낙찰자 열
                            if (sampleBids.length >= 1) {
                                const recBytes = createLabelRecord(7, 7, xf, sampleBids[0].bidder);
                                newRecords.push({ raw: recBytes });
                                continue;
                            }
                        }
                    }

                    // 2) Row 13의 원본 템플릿 손상 수식 레코드(26바이트) 표준 27바이트 수식으로 완벽 자동 복원
                    if (rtype === 0x0006 && rdata.length === 26) {
                        const row = rview.getUint16(0, true);
                        const col = rview.getUint16(2, true);
                        const xf = rview.getUint16(4, true);
                        if (row === 13 && col >= 10 && col <= 16) {
                            const fixedFormula = createSharedFormulaRecord(13, col, xf, 10, col);
                            newRecords.push({ raw: fixedFormula });
                            continue;
                        }
                    }

                    // 3) 8번 행 이후 (2번~992번 물품: MULBLANK에서 D열(수량=1), G열(낙찰가), H열(낙찰자) 주입 및 J열 수식 보존)
                    if (rtype === 0x00BE && rdata.length >= 6) {
                        const row = rview.getUint16(0, true);
                        const fc = rview.getUint16(2, true);
                        const lc = rview.getUint16(rdata.length - 2, true);
                        const itemIdx = row - 7;
                        const count = lc - fc + 1;
                        const xfs = [];
                        for (let k = 0; k < count; k++) {
                            xfs.push(rview.getUint16(4 + k * 2, true));
                        }

                        if (itemIdx >= 1 && itemIdx < sampleBids.length && fc === 2 && lc >= 7) {
                            const bid = sampleBids[itemIdx];

                            // col 2: 품명 (BLANK)
                            const b2 = createBlankRecord(row, 2, xfs[0]);
                            // col 3: 수량 (NUMBER = 무조건 1)
                            const qtyRec = createNumberRecord(row, 3, xfs[1], 1);
                            // col 4..5: 출품자, 비회원 (MULBLANK)
                            const mb4_5 = createMulblankRecord(row, 4, 5, [xfs[2], xfs[3]]);
                            // col 6: 6G 낙찰가 (NUMBER)
                            const priceRec = createNumberRecord(row, 6, xfs[4], bid.price);
                            // col 7: 6H 낙찰자 (LABEL)
                            const bidderRec = createLabelRecord(row, 7, xfs[5], bid.bidder);
                            // col 8: 비회원 (BLANK)
                            const b8 = createBlankRecord(row, 8, xfs[6]);

                            let combined;
                            if (lc === 9) {
                                // Row 9~18: 원본에서 누락되었던 J열(유찰여부) 수식 완벽 복원
                                const f9 = createSharedFormulaRecord(row, 9, xfs[7] || 66, 7, 9);
                                const totalL = b2.length + qtyRec.length + mb4_5.length + priceRec.length + bidderRec.length + b8.length + f9.length;
                                combined = new Uint8Array(totalL);
                                let offset = 0;
                                combined.set(b2, offset); offset += b2.length;
                                combined.set(qtyRec, offset); offset += qtyRec.length;
                                combined.set(mb4_5, offset); offset += mb4_5.length;
                                combined.set(priceRec, offset); offset += priceRec.length;
                                combined.set(bidderRec, offset); offset += bidderRec.length;
                                combined.set(b8, offset); offset += b8.length;
                                combined.set(f9, offset);
                            } else {
                                const totalL = b2.length + qtyRec.length + mb4_5.length + priceRec.length + bidderRec.length + b8.length;
                                combined = new Uint8Array(totalL);
                                let offset = 0;
                                combined.set(b2, offset); offset += b2.length;
                                combined.set(qtyRec, offset); offset += qtyRec.length;
                                combined.set(mb4_5, offset); offset += mb4_5.length;
                                combined.set(priceRec, offset); offset += priceRec.length;
                                combined.set(bidderRec, offset); offset += bidderRec.length;
                                combined.set(b8, offset);
                            }

                            if (combined) {
                                newRecords.push({ raw: combined });
                                continue;
                            }
                        } else if (fc === 2 && lc === 9) {
                            // 낙찰 데이터가 없는 Row 9~18 행에서도 누락된 J열 수식을 복원하여 서식 단절 방지
                            const mb2_8 = createMulblankRecord(row, 2, 8, [xfs[0], xfs[1], xfs[2], xfs[3], xfs[4], xfs[5], xfs[6]]);
                            const f9 = createSharedFormulaRecord(row, 9, xfs[7] || 66, 7, 9);
                            const totalL = mb2_8.length + f9.length;
                            const combined = new Uint8Array(totalL);
                            combined.set(mb2_8, 0);
                            combined.set(f9, mb2_8.length);
                            newRecords.push({ raw: combined });
                            continue;
                        }
                    }

                    // 수식(0x0006 FORMULA)을 포함한 모든 레코드는 전혀 수정 없이 100% 원본 그대로 유지
                    newRecords.push(rec);
                }

                // 새 BOF 위치 계산
                const newBofs = [];
                let curPos = 0;
                for (let i = 0; i < newRecords.length; i++) {
                    const rec = newRecords[i];
                    const recLen = rec.raw ? rec.raw.length : (4 + rec.data.length);
                    if (rec.type === 0x0809) {
                        newBofs.push(curPos);
                    }
                    curPos += recLen;
                }

                // BOUNDSHEET 레코드 내 시트별 BOF 오프셋 업데이트
                let bsIdx = 0;
                for (let i = 0; i < newRecords.length; i++) {
                    const rec = newRecords[i];
                    if (rec.type === 0x0085) {
                        const rview = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
                        rview.setUint32(0, newBofs[1 + bsIdx], true);
                        bsIdx++;
                    }
                }

                // Workbook 스트림 재조립
                let totalLen = 0;
                for (let i = 0; i < newRecords.length; i++) {
                    const rec = newRecords[i];
                    totalLen += rec.raw ? rec.raw.length : (4 + rec.data.length);
                }

                const newWbStream = new Uint8Array(totalLen);
                const newWbView = new DataView(newWbStream.buffer);
                let writePos = 0;

                for (let i = 0; i < newRecords.length; i++) {
                    const rec = newRecords[i];
                    if (rec.raw) {
                        newWbStream.set(rec.raw, writePos);
                        writePos += rec.raw.length;
                    } else {
                        newWbView.setUint16(writePos, rec.type, true);
                        newWbView.setUint16(writePos + 2, rec.data.length, true);
                        newWbStream.set(rec.data, writePos + 4);
                        writePos += 4 + rec.data.length;
                    }
                }

                const streams = {
                    'Workbook': newWbStream,
                    '\x05SummaryInformation': new Uint8Array(siBytes),
                    '\x05DocumentSummaryInformation': new Uint8Array(dsiBytes)
                };

                return buildOle2CompoundFile(streams);
            }

            /** 경매양식 엑셀(.xls) 생성 및 다운로드 실행 함수 */
            async function downloadAuctionTemplateExcel(rawRecords, sortType, isGrouped) {
                if (!rawRecords || rawRecords.length === 0) {
                    showAuctionToast('내보낼 낙찰 내역이 없습니다.', 'auction');
                    return;
                }

                const activeSort = sortType || currentSort || 'newest';
                const groupOption = (typeof isGrouped === 'boolean') ? isGrouped : groupBidderOption;

                try {
                    showAuctionToast('⏳ 양식 엑셀 파일 생성 중...', 'auction');
                    
                    // 1) 정렬 및 낙찰자 묶기 옵션 반영
                    let sortedRecords;
                    if (groupOption) {
                        sortedRecords = groupBidRecordsByNickname(rawRecords, activeSort);
                    } else {
                        sortedRecords = sortBidRecords(rawRecords, activeSort);
                    }

                    const bidList = sortedRecords.map(r => {
                        const cleanNick = (r && r.nickname) ? String(r.nickname).replace(/^@/, '').trim() : '익명';
                        const p = parseFloat(r && r.price);
                        const wonPrice = !isNaN(p) ? Math.round(p * 10000) : 0;
                        return {
                            price: wonPrice,
                            bidder: cleanNick
                        };
                    });

                    // 2) 템플릿 압축 해제
                    const templateBytes = await decompressGzipBase64(AUCTION_TEMPLATE_GZIP_B64);

                    // 3) 6D(수량 1), 6G(낙찰가), 6H(낙찰자) 주입 (존재하는 수식은 수정없이 그대로 유지)
                    const newXlsBytes = fillAuctionTemplateXls(templateBytes, bidList);

                    // 4) 파일 다운로드 트리거
                    const blob = new Blob([newXlsBytes], { type: 'application/vnd.ms-excel;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `유튜브경매_경매양식_${getTodayString().replace(/-/g, '')}.xls`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);

                    const sortNames = {
                        newest: '최신순',
                        oldest: '오래된순',
                        price_desc: '높은가격순',
                        price_asc: '낮은가격순'
                    };
                    const sortName = sortNames[activeSort] || activeSort;
                    const groupInfo = groupOption ? ' (낙찰자별 묶기)' : '';
                    showAuctionToast(`📋 경매양식 내보내기 완료! [${sortName}${groupInfo}]`, 'success');
                } catch (err) {
                    console.error(PREFIX, '경매양식 내보내기 오류:', err);
                    showAuctionToast(`❌ 양식 내보내기 실패: ${err.message}`, 'separator');
                }
            }

            // 엑셀 다운로드 (.xls)
            actionRow.appendChild(makeActionBtn(
                '📊', '엑셀다운',
                'rgba(40,167,69,.15)', 'rgba(40,167,69,.4)', '#75d888',
                () => {
                    const rawRecords = getTodayBidRecords();
                    if (rawRecords.length === 0) {
                        showAuctionToast('저장할 낙찰 내역이 없습니다.', 'auction');
                        return;
                    }
                    const allRecords = groupBidRecordsByNickname(rawRecords, currentSort);

                    // 닉네임별 총합 및 전체 총합 계산
                    let grandSumMan = 0;
                    const nickTotals = {};
                    allRecords.forEach(r => {
                        const nick = (r && r.nickname) ? String(r.nickname).trim() : '';
                        const p = parseFloat(r && r.price);
                        const val = !isNaN(p) ? p : 0;
                        grandSumMan += val;
                        if (!nickTotals[nick]) {
                            nickTotals[nick] = { total: 0, count: 0 };
                        }
                        nickTotals[nick].total += val;
                        nickTotals[nick].count += 1;
                    });

                    const grandTotalWon = Math.round(grandSumMan * 10000);
                    const totalUsersCount = Object.keys(nickTotals).length;
                    const todayStr = getTodayString();

                    function escXml(str) {
                        return String(str || '')
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;');
                    }

                    // XML Rows 생성
                    const xmlRows = [];

                    // 1) 상단 대제목 행 (4열 병합)
                    xmlRows.push(`
      <Row ss:Height="34">
        <Cell ss:MergeAcross="3" ss:StyleID="sTitle">
          <Data ss:Type="String">🎬 유튜브 라이브 경매 낙찰 집계표</Data>
        </Cell>
      </Row>`);

                    // 2) 요약 메타 정보 카드 행 (좌: 방송일자, 우: 총 낙찰건수 및 총매출액)
                    xmlRows.push(`
      <Row ss:Height="24">
        <Cell ss:MergeAcross="1" ss:StyleID="sSummaryLeft">
          <Data ss:Type="String">📅 방송일자: ${escXml(todayStr)}</Data>
        </Cell>
        <Cell ss:MergeAcross="1" ss:StyleID="sSummaryRight">
          <Data ss:Type="String">👥 총 낙찰: ${allRecords.length}건 (${totalUsersCount}명)  │  💰 총매출: ${grandTotalWon.toLocaleString('ko-KR')}원</Data>
        </Cell>
      </Row>`);

                    // 3) 상단 여백 빈 줄
                    xmlRows.push(`
      <Row ss:Height="10">
        <Cell ss:MergeAcross="3" ss:StyleID="sBlank"/>
      </Row>`);

                    // 4) 테이블 헤더 행 (4개 열)
                    xmlRows.push(`
      <Row ss:Height="26">
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">번호</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">시간</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">낙찰자</Data></Cell>
        <Cell ss:StyleID="sHeader"><Data ss:Type="String">낙찰가</Data></Cell>
      </Row>`);

                    // 닉네임 그룹별 가독성 높은 소프트 파스텔 컬러 테마 5종
                    const colorThemes = [
                        // 0: 소프트 스카이블루
                        { rowBg: '#f0f7ff', subBg: '#dbeafe', textColor: '#1e40af', borderColor: '#cbd5e1', subBorder: '#93c5fd', subBottomBorder: '#3b82f6', priceColor: '#1d4ed8' },
                        // 1: 소프트 민트그린
                        { rowBg: '#f0fdf4', subBg: '#dcfce7', textColor: '#166534', borderColor: '#cbd5e1', subBorder: '#86efac', subBottomBorder: '#22c55e', priceColor: '#15803d' },
                        // 2: 소프트 웜앰버
                        { rowBg: '#fffbeb', subBg: '#fef3c7', textColor: '#92400e', borderColor: '#cbd5e1', subBorder: '#fcd34d', subBottomBorder: '#f59e0b', priceColor: '#b45309' },
                        // 3: 소프트 라벤더
                        { rowBg: '#faf5ff', subBg: '#f3e8ff', textColor: '#6b21a8', borderColor: '#cbd5e1', subBorder: '#d8b4fe', subBottomBorder: '#a855f7', priceColor: '#7e22ce' },
                        // 4: 소프트 코랄로즈
                        { rowBg: '#fff1f2', subBg: '#ffe4e6', textColor: '#9f1239', borderColor: '#cbd5e1', subBorder: '#fda4af', subBottomBorder: '#f43f5e', priceColor: '#be123c' }
                    ];

                    // 테마별 XML Style 생성
                    const themeStylesXml = colorThemes.map((t, idx) => `
  <Style ss:ID="sRow_${idx}">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Color="#475569"/>
   <Interior ss:Color="${t.rowBg}" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sNick_${idx}">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="10.5" ss:Bold="1" ss:Color="#0f172a"/>
   <Interior ss:Color="${t.rowBg}" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sPrice_${idx}">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.borderColor}"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="10.5" ss:Bold="1" ss:Color="${t.priceColor}"/>
   <Interior ss:Color="${t.rowBg}" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0&quot;원&quot;"/>
  </Style>
  <Style ss:ID="sSubLabel_${idx}">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${t.subBottomBorder}"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.subBorder}"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.subBorder}"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.subBorder}"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1" ss:Color="${t.textColor}"/>
   <Interior ss:Color="${t.subBg}" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sSubPrice_${idx}">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${t.subBottomBorder}"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.subBorder}"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.subBorder}"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${t.subBorder}"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="11" ss:Bold="1" ss:Color="${t.textColor}"/>
   <Interior ss:Color="${t.subBg}" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0&quot;원&quot;"/>
  </Style>`).join('');

                    // 5) 데이터 행 + 소계 행 + 닉네임 그룹 구분선
                    let groupIndex = 0;
                    let rowIndex = 0;
                    for (let i = 0; i < allRecords.length; i++) {
                        const r = allRecords[i];
                        rowIndex++;
                        const nick = (r && r.nickname) ? String(r.nickname).trim() : '';
                        const nextNick = (i + 1 < allRecords.length && allRecords[i + 1] && allRecords[i + 1].nickname)
                            ? String(allRecords[i + 1].nickname).trim()
                            : null;

                        const isLastOfNick = (nextNick !== nick);
                        const nickSumWon = Math.round((nickTotals[nick]?.total || 0) * 10000);
                        const nickCount = nickTotals[nick]?.count || 1;
                        const priceNum = Math.round((parseFloat(r.price) || 0) * 10000);

                        // 닉네임 그룹별 순환 테마 인덱스
                        const themeIdx = groupIndex % colorThemes.length;
                        const styleRow = `sRow_${themeIdx}`;
                        const styleNick = `sNick_${themeIdx}`;
                        const stylePrice = `sPrice_${themeIdx}`;
                        const styleSubLabel = `sSubLabel_${themeIdx}`;
                        const styleSubPrice = `sSubPrice_${themeIdx}`;

                        // 본문 데이터 행 (4열)
                        xmlRows.push(`
      <Row ss:Height="22">
        <Cell ss:StyleID="${styleRow}"><Data ss:Type="Number">${rowIndex}</Data></Cell>
        <Cell ss:StyleID="${styleRow}"><Data ss:Type="String">${escXml(r.videoTime || r.time || '')}</Data></Cell>
        <Cell ss:StyleID="${styleNick}"><Data ss:Type="String">@${escXml(r.nickname || '')}</Data></Cell>
        <Cell ss:StyleID="${stylePrice}"><Data ss:Type="Number">${priceNum}</Data></Cell>
      </Row>`);

                        // 닉네임별 소계 행 (번호, 시간, 닉네임 3개 열 병합 + 낙찰가 열에 소계 금액)
                        if (isLastOfNick) {
                            xmlRows.push(`
      <Row ss:Height="24">
        <Cell ss:MergeAcross="2" ss:StyleID="${styleSubLabel}"><Data ss:Type="String">▶ @${escXml(nick || '익명')} 소계 (${nickCount}건)</Data></Cell>
        <Cell ss:StyleID="${styleSubPrice}"><Data ss:Type="Number">${nickSumWon}</Data></Cell>
      </Row>`);

                            // 다음 그룹이 있으면 가벼운 구분 빈 행
                            if (i < allRecords.length - 1) {
                                xmlRows.push(`
      <Row ss:Height="10">
        <Cell ss:MergeAcross="3" ss:StyleID="sBlank"/>
      </Row>`);
                            }
                            groupIndex++;
                        }
                    }

                    // 6) 하단 총합계 행
                    xmlRows.push(`
      <Row ss:Height="12">
        <Cell ss:MergeAcross="3" ss:StyleID="sBlank"/>
      </Row>
      <Row ss:Height="28">
        <Cell ss:MergeAcross="2" ss:StyleID="sGrandTotal"><Data ss:Type="String">★ [전체 총 합 계]  (총 ${totalUsersCount}명 / ${allRecords.length}건)</Data></Cell>
        <Cell ss:StyleID="sGrandTotalPrice"><Data ss:Type="Number">${grandTotalWon}</Data></Cell>
      </Row>`);

                    // 엑셀 XML 템플릿 완성
                    const excelXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Color="#1e293b"/>
  </Style>
  <Style ss:ID="sBlank">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="맑은 고딕" ss:Size="10"/>
  </Style>
  <Style ss:ID="sTitle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0f172a"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="13" ss:Bold="1" ss:Color="#ffffff"/>
   <Interior ss:Color="#1e293b" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sSummaryLeft">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="9.5" ss:Bold="1" ss:Color="#475569"/>
   <Interior ss:Color="#f1f5f9" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sSummaryRight">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1" ss:Color="#1d4ed8"/>
   <Interior ss:Color="#eff6ff" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sHeader">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#1e293b"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="10.5" ss:Bold="1" ss:Color="#ffffff"/>
   <Interior ss:Color="#334155" ss:Pattern="Solid"/>
  </Style>${themeStylesXml}
  <Style ss:ID="sGrandTotal">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0f172a"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0f172a"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0f172a"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0f172a"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="11" ss:Bold="1" ss:Color="#ffffff"/>
   <Interior ss:Color="#1e293b" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sGrandTotalPrice">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0f172a"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0f172a"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0f172a"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0f172a"/>
   </Borders>
   <Font ss:FontName="맑은 고딕" ss:Size="12.5" ss:Bold="1" ss:Color="#4ade80"/>
   <Interior ss:Color="#0f172a" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0&quot;원&quot;"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="낙찰목록">
  <Table ss:DefaultRowHeight="20">
   <Column ss:Width="55"/>
   <Column ss:Width="85"/>
   <Column ss:Width="140"/>
   <Column ss:Width="125"/>
${xmlRows.join('')}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Portrait"/>
    <PageMargins x:Bottom="0.75" x:Left="0.7" x:Right="0.7" x:Top="0.75"/>
   </PageSetup>
   <DisplayGridlines/>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

                    const blob = new Blob([excelXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `유튜브경매_낙찰목록_${getTodayString().replace(/-/g, '')}.xls`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    showAuctionToast('📊 엑셀(.xls) 다운로드 완료!', 'success');
                }
            ));

            // 경매양식 내보내기 옵션 팝업 다이얼로그
            function openAuctionExportDialog(rawRecords) {
                if (!rawRecords || rawRecords.length === 0) {
                    showAuctionToast('내보낼 낙찰 내역이 없습니다.', 'auction');
                    return;
                }

                const existingDialog = document.getElementById('__auction_export_dialog_backdrop');
                if (existingDialog) existingDialog.remove();

                const dialogBackdrop = createElement('div', {
                    id: '__auction_export_dialog_backdrop',
                    style: `
                        position: fixed !important;
                        inset: 0 !important;
                        z-index: 2147483647 !important;
                        background: rgba(0,0,0,.68) !important;
                        backdrop-filter: blur(4px) !important;
                        -webkit-backdrop-filter: blur(4px) !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                    `
                });

                const dialog = createElement('div', {
                    style: `
                        width: 270px !important;
                        background: #1e1e26 !important;
                        border: 1px solid rgba(255,204,0,.35) !important;
                        border-radius: 14px !important;
                        box-shadow: 0 12px 36px rgba(0,0,0,.85), 0 0 16px rgba(255,204,0,.15) !important;
                        padding: 16px !important;
                        color: #fff !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 12px !important;
                        box-sizing: border-box !important;
                    `
                });

                // 상단 타이틀
                const titleRow = createElement('div', {
                    style: `
                        display: flex !important;
                        align-items: center !important;
                        justify-content: space-between !important;
                    `
                });
                const titleText = createElement('div', {
                    text: '📑 경매양식 내보내기',
                    style: 'font-size: 13.5px !important; font-weight: 800 !important; color: #ffcc00 !important;'
                });
                const closeBtn = createElement('button', {
                    type: 'button',
                    text: '×',
                    style: `
                        width: 22px !important;
                        height: 22px !important;
                        border: 0 !important;
                        border-radius: 6px !important;
                        background: rgba(255,255,255,.08) !important;
                        color: rgba(255,255,255,.7) !important;
                        font-size: 16px !important;
                        line-height: 20px !important;
                        cursor: pointer !important;
                    `
                });
                closeBtn.addEventListener('click', () => dialogBackdrop.remove());
                titleRow.appendChild(titleText);
                titleRow.appendChild(closeBtn);
                dialog.appendChild(titleRow);

                // 같은 낙찰자끼리 묶기 체크박스 옵션
                let isGroupChecked = groupBidderOption;
                const optionWrap = createElement('label', {
                    style: `
                        display: flex !important;
                        align-items: center !important;
                        gap: 9px !important;
                        padding: 10px 12px !important;
                        border-radius: 9px !important;
                        background: rgba(255,255,255,.05) !important;
                        border: 1px solid rgba(255,255,255,.1) !important;
                        cursor: pointer !important;
                        user-select: none !important;
                    `
                });

                const cb = createElement('input', {
                    type: 'checkbox',
                    id: '__auction_export_group_cb',
                    checked: isGroupChecked,
                    style: `
                        accent-color: #ffcc00 !important;
                        width: 16px !important;
                        height: 16px !important;
                        margin: 0 !important;
                        cursor: pointer !important;
                    `
                });
                cb.checked = isGroupChecked;

                const cbText = createElement('span', {
                    text: '👥 같은 낙찰자끼리 묶기',
                    style: `
                        font-size: 12px !important;
                        font-weight: 700 !important;
                        color: ${isGroupChecked ? '#ffcc00' : 'rgba(255,255,255,.85)'} !important;
                        transition: color .15s !important;
                    `
                });

                cb.addEventListener('change', (e) => {
                    isGroupChecked = e.target.checked;
                    groupBidderOption = isGroupChecked;
                    try {
                        localStorage.setItem(GROUP_BIDDER_STORAGE_KEY, String(groupBidderOption));
                    } catch (err) {}
                    cbText.style.color = isGroupChecked ? '#ffcc00' : 'rgba(255,255,255,.85)';
                });

                optionWrap.appendChild(cb);
                optionWrap.appendChild(cbText);
                dialog.appendChild(optionWrap);

                // 버튼 영역 (취소 / 내보내기 실행)
                const btnRow = createElement('div', {
                    style: 'display: flex !important; gap: 6px !important; margin-top: 2px !important;'
                });

                const cancelBtn = createElement('button', {
                    type: 'button',
                    text: '취소',
                    style: `
                        flex: 1 !important;
                        height: 32px !important;
                        border: 1px solid rgba(255,255,255,.15) !important;
                        border-radius: 8px !important;
                        background: rgba(255,255,255,.06) !important;
                        color: rgba(255,255,255,.7) !important;
                        font-size: 11.5px !important;
                        font-weight: 700 !important;
                        cursor: pointer !important;
                    `
                });
                cancelBtn.addEventListener('click', () => dialogBackdrop.remove());

                const submitBtn = createElement('button', {
                    type: 'button',
                    text: '📑 엑셀 내보내기',
                    style: `
                        flex: 2 !important;
                        height: 32px !important;
                        border: 1px solid rgba(59,130,246,.5) !important;
                        border-radius: 8px !important;
                        background: linear-gradient(135deg, rgba(59,130,246,.35), rgba(37,99,235,.45)) !important;
                        color: #fff !important;
                        font-size: 11.5px !important;
                        font-weight: 800 !important;
                        cursor: pointer !important;
                        box-shadow: 0 2px 8px rgba(59,130,246,.3) !important;
                    `
                });
                submitBtn.addEventListener('click', () => {
                    dialogBackdrop.remove();
                    downloadAuctionTemplateExcel(rawRecords, currentSort, isGroupChecked);
                });

                btnRow.appendChild(cancelBtn);
                btnRow.appendChild(submitBtn);
                dialog.appendChild(btnRow);

                dialogBackdrop.appendChild(dialog);
                dialogBackdrop.addEventListener('click', (e) => {
                    if (e.target === dialogBackdrop) dialogBackdrop.remove();
                });

                document.body.appendChild(dialogBackdrop);
            }

            // 경매양식 내보내기 (.xls)
            actionRow.appendChild(makeActionBtn(
                '📑', '양식 내보내기',
                'rgba(59,130,246,.15)', 'rgba(59,130,246,.4)', '#60a5fa',
                () => {
                    const rawRecords = getTodayBidRecords();
                    openAuctionExportDialog(rawRecords);
                }
            ));


            // 현재 방송 내역 전체 삭제
            actionRow.appendChild(makeActionBtn(
                '🗑️', '전체삭제',
                'rgba(220,70,70,.12)', 'rgba(220,70,70,.32)', '#ee9292',
                () => {
                    const cur = getTodayBidRecords();
                    if (cur.length === 0) {
                        showAuctionToast('삭제할 내역이 없습니다.', 'auction');
                        return;
                    }
                    if (!confirm(`현재 방송의 낙찰 내역 ${cur.length}건을 모두 삭제할까요?`)) return;

                    const curIds = new Set(cur.map(r => r && r.id));
                    const allRecords = loadBidRecords();
                    const filtered = allRecords.filter(r => r && !curIds.has(r.id));
                    saveBidRecords(filtered);
                    updateBidBadge();
                    updateStats();
                    renderBidList();
                    showAuctionToast('🗑️ 낙찰 내역이 삭제되었습니다.', 'separator');
                }
            ));

            modal.appendChild(actionRow);


            // -- 정렬 탭 바 --

            const sortTabBar = createElement(
                'div',
                {
                    style: `
                        display:grid !important;
                        grid-template-columns:repeat(4, 1fr) !important;
                        gap:3px !important;
                        background:rgba(255,255,255,.04) !important;
                        padding:3px !important;
                        border-radius:9px !important;
                        border:1px solid rgba(255,255,255,.07) !important;
                    `
                }
            );

            const SORT_TABS = [
                { id: 'newest',     label: '최신순' },
                { id: 'oldest',     label: '오래된순' },
                { id: 'price_desc', label: '높은가격' },
                { id: 'price_asc',  label: '낮은가격' }
            ];

            const sortButtons = {};

            SORT_TABS.forEach(tab => {
                const btn = createElement(
                    'button',
                    {
                        type: 'button',
                        text: tab.label,
                        style: `
                            height:25px !important;
                            padding:0 !important;
                            border:0 !important;
                            border-radius:6px !important;
                            font-size:10.5px !important;
                            font-weight:700 !important;
                            cursor:pointer !important;
                            transition:all .15s !important;
                            background:transparent !important;
                            color:rgba(255,255,255,.5) !important;
                        `
                    }
                );

                btn.addEventListener('click', () => {
                    if (currentSort === tab.id) return;
                    currentSort = tab.id;
                    try {
                        localStorage.setItem(SORT_STORAGE_KEY, currentSort);
                    } catch (e) {}
                    updateSortTabUI();
                    renderBidList();
                });

                sortButtons[tab.id] = btn;
                sortTabBar.appendChild(btn);
            });

            function updateSortTabUI() {
                SORT_TABS.forEach(tab => {
                    const btn = sortButtons[tab.id];
                    if (!btn) return;
                    if (tab.id === currentSort) {
                        btn.style.background = 'rgba(255,204,0,.18)';
                        btn.style.color = '#ffcc00';
                        btn.style.fontWeight = '800';
                        btn.style.boxShadow = '0 1px 4px rgba(0,0,0,.3)';
                    } else {
                        btn.style.background = 'transparent';
                        btn.style.color = 'rgba(255,255,255,.5)';
                        btn.style.fontWeight = '700';
                        btn.style.boxShadow = 'none';
                    }
                });
            }

            updateSortTabUI();
            modal.appendChild(sortTabBar);


            // -- 닉네임 검색 바 & 초성 검색 지원 --
            let searchQuery = '';

            // 한글 초성 분기 맵
            const CHOSUNG_MAP = {
                'ㄱ': '[가-깋ㄱ]',
                'ㄲ': '[까-낗ㄲ]',
                'ㄴ': '[나-닣ㄴ]',
                'ㄷ': '[다-딯ㄷ]',
                'ㄸ': '[따-띻ㄸ]',
                'ㄹ': '[라-맇ㄹ]',
                'ㅁ': '[마-밓ㅁ]',
                'ㅂ': '[바-빟ㅂ]',
                'ㅃ': '[빠-삫ㅃ]',
                'ㅅ': '[사-싷ㅅ]',
                'ㅆ': '[싸-앃ㅆ]',
                'ㅇ': '[아-잏ㅇ]',
                'ㅈ': '[자-즿ㅈ]',
                'ㅉ': '[짜-찧ㅉ]',
                'ㅊ': '[차-칳ㅊ]',
                'ㅋ': '[카-킿ㅋ]',
                'ㅌ': '[타-팋ㅌ]',
                'ㅍ': '[파-핗ㅍ]',
                'ㅎ': '[하-힣ㅎ]'
            };

            function escapeRegex(str) {
                return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }

            function makeChosungRegex(query) {
                if (!query) return null;
                let pattern = '';
                for (let i = 0; i < query.length; i++) {
                    const ch = query[i];
                    if (CHOSUNG_MAP[ch]) {
                        pattern += CHOSUNG_MAP[ch];
                    } else {
                        pattern += escapeRegex(ch);
                    }
                }
                try {
                    return new RegExp(pattern, 'i');
                } catch (e) {
                    return null;
                }
            }

            function isChosungMatch(targetText, queryStr, chosungRegex) {
                if (!queryStr) return true;
                if (!targetText) return false;
                const cleanTarget = String(targetText).toLowerCase().replace(/^@/, '');
                const cleanQuery = queryStr.toLowerCase().replace(/^@/, '');

                // 1) 기본 문자열 포함 검사
                if (cleanTarget.includes(cleanQuery)) return true;

                // 2) 초성 정규표현식 일치 검사
                if (chosungRegex && chosungRegex.test(cleanTarget)) return true;

                return false;
            }

            const searchWrap = createElement(
                'div',
                {
                    style: `
                        position:relative !important;
                        display:flex !important;
                        align-items:center !important;
                        width:100% !important;
                        box-sizing:border-box !important;
                    `
                }
            );

            const searchIcon = createElement(
                'span',
                {
                    text: '🔍',
                    style: `
                        position:absolute !important;
                        left:8px !important;
                        font-size:11px !important;
                        opacity:0.5 !important;
                        pointer-events:none !important;
                    `
                }
            );

            const searchInput = createElement(
                'input',
                {
                    type: 'text',
                    placeholder: '닉네임 / 초성 검색 (예: ㅎㄱㄷ)...',
                    style: `
                        width:100% !important;
                        height:27px !important;
                        padding:0 24px 0 25px !important;
                        border:1px solid rgba(255,255,255,.08) !important;
                        border-radius:7px !important;
                        background:rgba(255,255,255,.04) !important;
                        color:#fff !important;
                        font-size:11px !important;
                        font-weight:500 !important;
                        outline:none !important;
                        box-sizing:border-box !important;
                        transition:all .15s ease !important;
                    `
                }
            );

            searchInput.addEventListener('focus', () => {
                searchInput.style.borderColor = 'rgba(255,204,0,.45)';
                searchInput.style.background = 'rgba(255,255,255,.07)';
            });
            searchInput.addEventListener('blur', () => {
                searchInput.style.borderColor = 'rgba(255,255,255,.08)';
                searchInput.style.background = 'rgba(255,255,255,.04)';
            });

            const searchClearBtn = createElement(
                'button',
                {
                    type: 'button',
                    text: '×',
                    title: '검색어 지우기',
                    style: `
                        position:absolute !important;
                        right:5px !important;
                        width:16px !important;
                        height:16px !important;
                        padding:0 !important;
                        border:0 !important;
                        border-radius:50% !important;
                        background:rgba(255,255,255,.12) !important;
                        color:rgba(255,255,255,.7) !important;
                        font-size:12px !important;
                        line-height:14px !important;
                        cursor:pointer !important;
                        display:none !important;
                        align-items:center !important;
                        justify-content:center !important;
                    `
                }
            );

            searchClearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchQuery = '';
                searchClearBtn.style.display = 'none';
                renderBidList();
                searchInput.focus();
            });

            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value;
                if (searchQuery.trim().length > 0) {
                    searchClearBtn.style.display = 'flex';
                } else {
                    searchClearBtn.style.display = 'none';
                }
                renderBidList();
            });

            searchWrap.appendChild(searchIcon);
            searchWrap.appendChild(searchInput);
            searchWrap.appendChild(searchClearBtn);
            modal.appendChild(searchWrap);


            // -- 낙찰 목록 컨테이너 --

            const listWrap = createElement(
                'div',
                {
                    style: `
                        flex:1 !important;
                        overflow-y:auto !important;
                        overscroll-behavior:contain !important;
                        -webkit-overflow-scrolling:touch !important;
                        max-height:210px !important;
                        display:flex !important;
                        flex-direction:column !important;
                        gap:5px !important;
                        padding-right:2px !important;
                    `
                }
            );

            function updateStats() {
                const curRecords = getTodayBidRecords();
                let sum = 0;
                curRecords.forEach(r => {
                    const p = parseFloat(r && r.price);
                    if (!isNaN(p)) sum += p;
                });
                const sumStr =
                    Number.isInteger(sum)
                        ? String(sum)
                        : sum.toFixed(1).replace(/\.0$/, '');

                if (statCountValEl) {
                    statCountValEl.textContent = `${curRecords.length}건`;
                } else {
                    const countEl = statsCard.querySelector('div:nth-child(1) div:nth-child(2)');
                    if (countEl) countEl.textContent = `${curRecords.length}건`;
                }

                if (statPriceValEl) {
                    statPriceValEl.textContent = `${sumStr}만`;
                } else {
                    const priceEl = statsCard.querySelector('div:nth-child(2) div:nth-child(2)');
                    if (priceEl) priceEl.textContent = `${sumStr}만`;
                }
            }

            function renderBidList() {
                if (typeof listWrap.replaceChildren === 'function') {
                    listWrap.replaceChildren();
                } else {
                    while (listWrap.firstChild) {
                        listWrap.removeChild(listWrap.firstChild);
                    }
                }
                const rawList = getTodayBidRecords();

                let filteredList = rawList;
                const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
                if (q) {
                    const chosungRegex = makeChosungRegex(q);
                    filteredList = rawList.filter(r => {
                        if (!r) return false;
                        const nick = String(r.nickname || '');
                        const origChat = String(r.originalChat || '');
                        return isChosungMatch(nick, q, chosungRegex) || isChosungMatch(origChat, q, chosungRegex);
                    });
                }

                const sortedList = sortBidRecords(filteredList, currentSort);

                if (rawList.length === 0) {
                    const empty = createElement(
                        'div',
                        {
                            style: `
                                text-align:center !important;
                                padding:28px 0 !important;
                                color:rgba(255,255,255,.35) !important;
                                font-size:12px !important;
                            `
                        }
                    );
                    empty.textContent = '현재 방송의 낙찰 내역이 없습니다.';
                    listWrap.appendChild(empty);
                    return;
                }

                if (sortedList.length === 0) {
                    const empty = createElement(
                        'div',
                        {
                            style: `
                                text-align:center !important;
                                padding:28px 0 !important;
                                color:rgba(255,255,255,.35) !important;
                                font-size:12px !important;
                            `
                        }
                    );
                    empty.textContent = `"${searchQuery}" 검색 결과가 없습니다.`;
                    listWrap.appendChild(empty);
                    return;
                }

                sortedList.forEach((record, idx) => {
                    if (!record) return;
                    const item = createElement(
                        'div',
                        {
                            style: `
                                display:flex !important;
                                align-items:center !important;
                                gap:6px !important;
                                padding:7px 9px !important;
                                border-radius:8px !important;
                                background:rgba(255,255,255,.04) !important;
                                border:1px solid rgba(255,255,255,.07) !important;
                            `
                        }
                    );

                    const origChat = String(record.originalChat || '');
                    const chatPreview = origChat
                        ? ` · "${origChat.slice(0, 15)}${origChat.length > 15 ? '…' : ''}"`
                        : '';

                    const numBadge = createElement('div', {
                        text: String(idx + 1),
                        style: `
                            flex-shrink:0 !important;
                            width:18px !important;
                            height:18px !important;
                            border-radius:5px !important;
                            background:rgba(255,204,0,.12) !important;
                            color:#ffcc00 !important;
                            font-size:10px !important;
                            font-weight:800 !important;
                            font-variant-numeric:tabular-nums !important;
                            font-feature-settings:"tnum" 1 !important;
                            display:flex !important;
                            align-items:center !important;
                            justify-content:center !important;
                        `
                    });

                    const infoWrap = createElement('div', {
                        style: 'flex:1 !important; min-width:0 !important; overflow:hidden !important;'
                    });

                    const nickDiv = createElement('div', {
                        text: `@${record.nickname || '익명'}`,
                        style: `
                            font-size:12.5px !important;
                            font-weight:800 !important;
                            color:#fff !important;
                            overflow:hidden !important;
                            text-overflow:ellipsis !important;
                            white-space:nowrap !important;
                        `
                    });

                    const datePrefix = (record.date && record.date !== getTodayString()) ? `${record.date} ` : '';
                    const timeDiv = createElement('div', {
                        text: `${datePrefix}${record.time || ''}${chatPreview}`,
                        style: 'font-size:10px !important; color:rgba(255,255,255,.45) !important; margin-top:1px !important; font-variant-numeric:tabular-nums !important; font-feature-settings:"tnum" 1 !important;'
                    });

                    infoWrap.appendChild(nickDiv);
                    infoWrap.appendChild(timeDiv);

                    const priceDiv = createElement('div', {
                        text: `${record.price || '0'}만`,
                        style: `
                            flex-shrink:0 !important;
                            font-size:14px !important;
                            font-weight:800 !important;
                            color:#6ee0a0 !important;
                            white-space:nowrap !important;
                            font-variant-numeric:tabular-nums !important;
                            font-feature-settings:"tnum" 1 !important;
                            margin-right:2px !important;
                        `
                    });

                    item.appendChild(numBadge);
                    item.appendChild(infoWrap);
                    item.appendChild(priceDiv);

                    // 개별 삭제 버튼
                    const delBtn = createElement(
                        'button',
                        {
                            type: 'button',
                            text: '×',
                            title: '삭제',
                            style: `
                                flex-shrink:0 !important;
                                width:18px !important;
                                height:18px !important;
                                padding:0 !important;
                                border:0 !important;
                                border-radius:5px !important;
                                background:rgba(255,255,255,.05) !important;
                                color:rgba(255,255,255,.4) !important;
                                opacity:0.4 !important;
                                font-size:13px !important;
                                line-height:16px !important;
                                cursor:pointer !important;
                                transition:opacity .15s ease, background-color .15s ease, color .15s ease !important;
                            `
                        }
                    );
                    delBtn.addEventListener('mouseenter', () => {
                        delBtn.style.opacity = '1';
                        delBtn.style.background = 'rgba(220,70,70,.25)';
                        delBtn.style.color = '#ff8888';
                    });
                    delBtn.addEventListener('mouseleave', () => {
                        delBtn.style.opacity = '0.4';
                        delBtn.style.background = 'rgba(255,255,255,.05)';
                        delBtn.style.color = 'rgba(255,255,255,.4)';
                    });
                    delBtn.addEventListener('click', () => {
                        const nick = record.nickname ? `@${record.nickname}님` : '해당';
                        const priceStr = record.price ? ` (${record.price}만)` : '';
                        const timeStr = record.time ? ` [${record.time}]` : '';
                        if (!confirm(`[낙찰 내역 삭제 확인]\n${nick}${priceStr}${timeStr} 항목을 정말 삭제하시겠습니까?`)) {
                            return;
                        }

                        const all = loadBidRecords();
                        const updated = all.filter(r => r && r.id !== record.id);
                        saveBidRecords(updated);
                        updateBidBadge();
                        updateStats();
                        renderBidList();
                        showAuctionToast(`🗑️ ${nick} 낙찰 내역이 삭제되었습니다.`, 'separator');
                    });

                    item.appendChild(delBtn);
                    listWrap.appendChild(item);
                });
            }

            renderBidList();
            modal.appendChild(listWrap);


            // -- DOM 삽입 (채팅창 내부 렌더링 - 낙찰 처리 모달과 동일) --
            const mountTarget = getChatMountTarget();
            mountTarget.appendChild(backdrop);
            mountTarget.appendChild(modal);

            const openedAt = Date.now();
            backdrop.addEventListener('click', (e) => {
                // 모달 생성 직후 버블링으로 인한 즉시 닫힘 방지 (200ms 가드)
                if (Date.now() - openedAt < 200) return;
                if (e.target === backdrop) {
                    removeBidListUI();
                }
            });

            // 스크롤 체이닝 방지 (전체 창 / 부모 채팅창 스크롤 전파 차단)
            listWrap.addEventListener('wheel', (e) => {
                const atTop = listWrap.scrollTop <= 0 && e.deltaY < 0;
                const atBottom = listWrap.scrollTop + listWrap.clientHeight >= listWrap.scrollHeight - 1 && e.deltaY > 0;
                if (atTop || atBottom) {
                    e.preventDefault();
                }
                e.stopPropagation();
            }, { passive: false });

            modal.addEventListener('wheel', (e) => {
                if (!listWrap.contains(e.target) || listWrap.scrollHeight <= listWrap.clientHeight) {
                    e.preventDefault();
                }
                e.stopPropagation();
            }, { passive: false });

            backdrop.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, { passive: false });

            // ESC 키로 닫기 (모든 관련 window에 등록)
            _bidListKeydownHandler = function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    removeBidListUI();
                }
            };

            const allDocs = getTargetDocs();
            allDocs.forEach(doc => {
                try {
                    const win = doc.defaultView || window;
                    win.addEventListener('keydown', _bidListKeydownHandler, true);
                } catch (e) {}
            });
            window.addEventListener('keydown', _bidListKeydownHandler, true);

            console.log(PREFIX, '📋 낙찰 내역 모달 열기 완료!');

        } catch (error) {
            console.error(PREFIX, 'openBidListModal 치명적 오류:', error);
        }
    }

    // 더미 낙찰 데이터 추가 (테스트/시뮬레이터용 내장 지원)
    function addDummyBidRecords(count = 5) {
        const num = Math.max(1, parseInt(count, 10) || 5);
        const records = loadBidRecords();
        const curVideoId = getCurrentVideoId();
        const today = getTodayString();
        const baseTs = Date.now() - (num * 90000);

        const DUMMY_SAMPLES = [
            { nick: '솔향기', price: '8.5', chat: '8.5만', item: '해송 소품 분재' },
            { nick: '소나무장인', price: '25', chat: '25', item: '진백 명품 사간형' },
            { nick: '도예가', price: '4.5', chat: '4,5', item: '소품 왜철쭉' },
            { nick: '황금송', price: '12', chat: '12만', item: '자연 문양 수석' },
            { nick: '산그늘-y2y', price: '35', chat: '350,000원', item: '제주 팽나무 특선' },
            { nick: '솔향기', price: '18.5', chat: '18.5만', item: '주목 고목 분재' },
            { nick: '사랑아-g7d', price: '7', chat: '7만', item: '느릅나무 근상' },
            { nick: '소나무장인', price: '15', chat: '15', item: '단풍나무 쌍간' },
            { nick: '비키비키-k', price: '10.5', chat: '10만 5천', item: '소품 흑송' },
            { nick: '청송매니아', price: '22', chat: '22만', item: '문인목 소나무' },
            { nick: '도예가', price: '3', chat: '3', item: '야생화 화분 세트' },
            { nick: '대박농원', price: '45', chat: '45만', item: '단풍나무 특대작' },
            { nick: '솔향기', price: '6.5', chat: '65', item: '소품 진백' },
            { nick: '괴목사랑', price: '16', chat: '16만', item: '명품 남수석' },
            { nick: '초록정원', price: '5.5', chat: '.55', item: '석곡 착생목' }
        ];

        for (let i = 0; i < num; i++) {
            const sample = DUMMY_SAMPLES[i % DUMMY_SAMPLES.length];
            const ts = baseTs + (i * 90000);
            const d = new Date(ts);
            const timeStr = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
            const vMin = String(Math.floor((i * 2 + 1))).padStart(2, '0');
            const vSec = String((i * 17) % 60).padStart(2, '0');
            const videoTime = `00:${vMin}:${vSec}`;
            const itemText = sample.item ? `[${sample.item}] ` : '';

            records.push({
                id: ts,
                blockKey: `dummy_sim_${ts}_${i + 1}`,
                date: today,
                time: videoTime,
                videoTime: videoTime,
                realTime: timeStr,
                videoId: curVideoId,
                nickname: sample.nick,
                price: sample.price,
                qty: 1,
                originalChat: sample.chat,
                message: `👉 @${sample.nick} ${sample.price}만 ${itemText}낙찰입니다. 축하드립니다!😄`
            });
        }

        saveBidRecords(records);
        updateBidBadge();
        return records;
    }

    function clearBidRecords() {
        saveBidRecords([]);
        updateBidBadge();
    }

    // 외부 디버깅 및 시뮬레이터 연동용 전역 바인딩
    const AuctionAutomationAPI = {
        loadBidRecords,
        saveBidRecords,
        addBidRecord,
        removeBidRecord,
        getTodayBidRecords,
        updateBidBadge,
        openBidModal: openBidListModal,
        openBidListModal,
        addDummyBidRecords,
        clearBidRecords
    };

    window.__AuctionAutomation = AuctionAutomationAPI;
    window.__openAuctionBidListModal = openBidListModal;
    try {
        if (window.top && window.top !== window) {
            window.top.__AuctionAutomation = AuctionAutomationAPI;
            window.top.__openAuctionBidListModal = openBidListModal;
        }
    } catch (e) {}



    // =========================================================
    // 멋진 토스트 메시지 알림 (브라우저 전체 중앙 하단 표시)
    // =========================================================

    function showAuctionToast(
        text,
        type = 'auction',
        duration = 2600
    ) {

        let targetDoc = document;
        let bidListModal = null;

        // 낙찰 내역 모달 및 경매 모달이 열려있는지 확인
        const docsToCheck = getTargetDocs();

        for (const doc of docsToCheck) {
            try {
                if (!doc) continue;
                const found = doc.getElementById('__auction_bid_list_modal') || doc.getElementById('__auction_auto_modal');
                if (found && found.isConnected) {
                    bidListModal = found;
                    targetDoc = found.ownerDocument || doc;
                    break;
                }
            } catch (e) {}
        }

        if (!bidListModal) {
            try {
                if (window.top && window.top.document && window.top.document.body) {
                    targetDoc = window.top.document;
                }
            } catch (e) {
                targetDoc = document;
            }
        }

        const isInsideModal = Boolean(bidListModal);
        const mountTarget = isInsideModal
            ? bidListModal
            : (targetDoc.body || targetDoc.documentElement);

        if (!mountTarget) {
            return;
        }

        // 기존 토스트 정리 (관련 문서들 모두 확인)
        docsToCheck.forEach(doc => {
            try {
                doc.querySelectorAll('.__auction_toast_notification').forEach(el => el.remove());
            } catch (e) {}
        });

        const toast = targetDoc.createElement('div');
        toast.className = '__auction_toast_notification';

        let iconBg = 'rgba(255,204,0,.20)';
        let iconColor = '#ffcc00';
        let iconText = '⚡';
        let borderCol = 'rgba(255,204,0,.40)';
        let glowCol = 'rgba(255,204,0,.15)';

        if (type === 'guide') {
            iconBg = 'rgba(80,160,255,.20)';
            iconColor = '#6eb4ff';
            iconText = '📢';
            borderCol = 'rgba(80,160,255,.40)';
            glowCol = 'rgba(80,160,255,.15)';
        } else if (type === 'separator') {
            iconBg = 'rgba(235,90,90,.20)';
            iconColor = '#ff8f8f';
            iconText = '📏';
            borderCol = 'rgba(235,90,90,.40)';
            glowCol = 'rgba(235,90,90,.15)';
        } else if (type === 'success') {
            iconBg = 'rgba(70,200,120,.20)';
            iconColor = '#6ee0a0';
            iconText = '✓';
            borderCol = 'rgba(70,200,120,.40)';
            glowCol = 'rgba(70,200,120,.15)';
        }

        const toastStyle = isInsideModal
            ? `
                position:absolute !important;
                bottom:14px !important;
                left:50% !important;
                transform:translateX(-50%) translateY(12px) !important;
                background:linear-gradient(135deg, rgba(28,28,34,.98), rgba(16,16,20,.99)) !important;
                border:1px solid ${borderCol} !important;
                box-shadow:0 10px 30px rgba(0,0,0,.85), 0 0 18px ${glowCol} !important;
                border-radius:12px !important;
                padding:8px 16px !important;
                display:flex !important;
                align-items:center !important;
                gap:8px !important;
                color:#fff !important;
                font-size:12.5px !important;
                font-weight:750 !important;
                font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                z-index:2147483647 !important;
                pointer-events:none !important;
                backdrop-filter:blur(10px) !important;
                -webkit-backdrop-filter:blur(10px) !important;
                opacity:0 !important;
                transition:transform .22s cubic-bezier(0.16, 1, 0.3, 1), opacity .22s ease !important;
                white-space:nowrap !important;
                max-width:calc(100% - 24px) !important;
                box-sizing:border-box !important;
            `
            : `
                position:fixed !important;
                bottom:36px !important;
                left:50% !important;
                transform:translateX(-50%) translateY(20px) !important;
                background:linear-gradient(135deg, rgba(32,32,38,.96), rgba(18,18,22,.98)) !important;
                border:1px solid ${borderCol} !important;
                box-shadow:0 12px 36px rgba(0,0,0,.70), 0 0 22px ${glowCol} !important;
                border-radius:14px !important;
                padding:11px 20px !important;
                display:flex !important;
                align-items:center !important;
                gap:10px !important;
                color:#fff !important;
                font-size:13.5px !important;
                font-weight:750 !important;
                font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                z-index:2147483647 !important;
                pointer-events:none !important;
                backdrop-filter:blur(10px) !important;
                -webkit-backdrop-filter:blur(10px) !important;
                opacity:0 !important;
                transition:transform .25s cubic-bezier(0.16, 1, 0.3, 1), opacity .25s ease !important;
                white-space:nowrap !important;
                max-width:calc(100vw - 32px) !important;
                box-sizing:border-box !important;
            `;

        toast.setAttribute('style', toastStyle);

        const iconSize = isInsideModal ? '22px' : '26px';
        const iconFontSize = isInsideModal ? '12px' : '13.5px';
        const iconRadius = isInsideModal ? '6px' : '8px';

        const iconDiv = targetDoc.createElement('div');
        iconDiv.textContent = iconText;
        iconDiv.setAttribute(
            'style',
            `
                width:${iconSize} !important;
                height:${iconSize} !important;
                display:flex !important;
                align-items:center !important;
                justify-content:center !important;
                border-radius:${iconRadius} !important;
                background:${iconBg} !important;
                color:${iconColor} !important;
                font-size:${iconFontSize} !important;
                font-weight:800 !important;
                flex-shrink:0 !important;
            `
        );

        const textDiv = targetDoc.createElement('div');
        textDiv.textContent = text;
        textDiv.setAttribute(
            'style',
            `
                color:#fff !important;
                line-height:1.3 !important;
                overflow:hidden !important;
                text-overflow:ellipsis !important;
                letter-spacing:-.2px !important;
            `
        );

        toast.appendChild(iconDiv);
        toast.appendChild(textDiv);

        mountTarget.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    }


    // =========================================================
    // 낙찰 모달
    // =========================================================

    function openAuctionModal(
        nickname,
        lastChatMessage = null,
        targetChatItem = null
    ) {

        // 🛑 다시보기 환경: 낙찰 모달 팝업 및 낙찰자 추가/수정 완전 차단
        if (isReplayMode()) {
            console.log(PREFIX, '🛑 다시보기 환경에서는 낙찰 모달이 지원되지 않습니다.');
            return;
        }

        console.log(
            PREFIX,
            'openAuctionModal:',
            nickname,
            'chat:',
            lastChatMessage
        );

        const parsedPrice =
            lastChatMessage
                ? parseBidPriceWithContext(lastChatMessage, targetChatItem)
                : null;

        removeAuctionUI();


        // =====================================================
        // BACKDROP
        // =====================================================

        const backdrop =
            createElement(
                'div',
                {
                    id:
                        '__auction_auto_backdrop',

                    style: `
                        position:fixed !important;
                        inset:0 !important;

                        width:100vw !important;
                        height:100vh !important;

                        background:
                            rgba(0,0,0,.62)
                            !important;

                        backdrop-filter:
                            blur(5px)
                            !important;

                        -webkit-backdrop-filter:
                            blur(5px)
                            !important;

                        z-index:
                            2147483646 !important;

                        opacity:1 !important;

                        visibility:visible !important;

                        pointer-events:auto !important;

                        overscroll-behavior:contain !important;
                    `
                }
            );


        // =====================================================
        // MODAL (Compact Layout - No Overflow/Scroll)
        // =====================================================

        const modal =
            createElement(
                'div',
                {
                    id:
                        '__auction_auto_modal',

                    style: `
                        position:fixed !important;

                        left:50% !important;
                        top:50% !important;

                        transform:
                            translate(-50%,-50%)
                            !important;

                        width:330px !important;

                        max-width:
                            calc(100vw - 24px)
                            !important;

                        max-height:
                            calc(100vh - 32px)
                            !important;

                        overflow:hidden !important;

                        overscroll-behavior:contain !important;

                        box-sizing:border-box
                            !important;

                        padding:
                            16px 18px
                            !important;

                        background:
                            linear-gradient(
                                145deg,
                                rgba(38,38,42,.98),
                                rgba(22,22,25,.99)
                            )
                            !important;

                        color:#fff !important;

                        border:
                            1px solid
                            rgba(255,255,255,.11)
                            !important;

                        border-radius:
                            18px
                            !important;

                        box-shadow:
                            0 25px 80px
                            rgba(0,0,0,.75),
                            0 0 0 1px
                            rgba(255,255,255,.04)
                            !important;

                        z-index:
                            2147483647 !important;

                        display:block !important;

                        visibility:visible !important;

                        opacity:1 !important;

                        pointer-events:auto !important;

                        font-family:
                            -apple-system,
                            BlinkMacSystemFont,
                            "Segoe UI",
                            Roboto,
                            Arial,
                            sans-serif
                            !important;
                    `
                }
            );


        // =====================================================
        // HEADER
        // =====================================================

        const header =
            createElement(
                'div',
                {
                    style: `
                        display:flex;

                        align-items:center;

                        justify-content:
                            space-between;

                        margin-bottom:
                            10px;
                    `
                }
            );


        const headerLeft =
            createElement(
                'div',
                {
                    style: `
                        display:flex;

                        align-items:center;

                        gap:8px;
                    `
                }
            );


        const icon =
            createElement(
                'div',
                {
                    text:
                        '✓',

                    style: `
                        width:26px;
                        height:26px;

                        display:flex;

                        align-items:center;

                        justify-content:center;

                        border-radius:8px;

                        background:
                            rgba(255,204,0,.14);

                        color:#ffcc00;

                        font-size:14px;

                        font-weight:800;
                    `
                }
            );


        headerLeft.appendChild(
            icon
        );


        const title =
            createElement(
                'div',
                {
                    text:
                        '낙찰 처리',

                    style: `
                        font-size:15px;

                        font-weight:800;

                        color:#fff;
                    `
                }
            );


        headerLeft.appendChild(
            title
        );

        header.appendChild(
            headerLeft
        );


        // =====================================================
        // 닫기
        // =====================================================

        const close =
            createElement(
                'button',
                {
                    type:
                        'button',

                    text:
                        '×',

                    style: `
                        width:26px;

                        height:26px;

                        padding:0;

                        border:0;

                        border-radius:8px;

                        background:
                            rgba(255,255,255,.06);

                        color:
                            rgba(255,255,255,.65);

                        font-size:19px;

                        line-height:24px;

                        cursor:pointer;
                    `
                }
            );


        close.addEventListener(
            'mouseenter',
            function () {

                close.style.background =
                    'rgba(255,255,255,.14)';

                close.style.color =
                    '#fff';
            }
        );


        close.addEventListener(
            'mouseleave',
            function () {

                close.style.background =
                    'rgba(255,255,255,.06)';

                close.style.color =
                    'rgba(255,255,255,.65)';
            }
        );


        close.addEventListener(
            'click',
            removeAuctionUI
        );


        header.appendChild(
            close
        );

        modal.appendChild(
            header
        );


        // =====================================================
        // 닉네임 (컴팩트 인라인 카드)
        // =====================================================

        const userCard =
            createElement(
                'div',
                {
                    style: `
                        padding:
                            8px 12px;

                        border-radius:
                            10px;

                        background:
                            linear-gradient(
                                135deg,
                                rgba(255,204,0,.10),
                                rgba(255,255,255,.03)
                            );

                        border:
                            1px solid
                            rgba(255,204,0,.16);

                        margin-bottom:
                            10px;

                        display:flex;

                        align-items:center;

                        justify-content:space-between;

                        gap:8px;
                    `
                }
            );


        const userLabel =
            createElement(
                'div',
                {
                    text:
                        '낙찰 대상자',

                    style: `
                        color:
                            rgba(255,255,255,.45);

                        font-size:11px;

                        font-weight:600;

                        white-space:nowrap;
                    `
                }
            );


        const userName =
            createElement(
                'div',
                {
                    text:
                        `@${nickname}`,

                    style: `
                        color:#ffcc00;

                        font-size:15px;

                        line-height:1.2;

                        font-weight:800;

                        overflow:hidden;

                        text-overflow:ellipsis;

                        white-space:nowrap;

                        text-align:right;
                    `
                }
            );


        userCard.appendChild(
            userLabel
        );

        userCard.appendChild(
            userName
        );

        modal.appendChild(
            userCard
        );


        // =====================================================
        // 금액 입력창
        // =====================================================

        const inputWrap =
            createElement(
                'div',
                {
                    style: `
                        position:relative;

                        width:100%;
                    `
                }
            );


        const input =
            createElement(
                'input',
                {
                    id:
                        '__auction_price',

                    type:
                        'text',

                    inputMode:
                        'decimal',

                    autocomplete:
                        'off',

                    placeholder:
                        '예: 2 또는 1.5',

                    style: `
                        display:block !important;

                        width:100% !important;

                        height:44px !important;

                        box-sizing:border-box
                            !important;

                        padding:
                            0 56px 0 12px
                            !important;

                        border:
                            1px solid
                            rgba(255,204,0,.25)
                            !important;

                        border-radius:
                            10px !important;

                        background:
                            rgba(0,0,0,.30)
                            !important;

                        color:#fff !important;

                        outline:none !important;

                        font-size:24px !important;

                        font-weight:800 !important;
                    `
                }
            );


        if (parsedPrice) {
            input.value =
                parsedPrice;
        }


        input.addEventListener(
            'focus',
            function () {

                input.style.borderColor =
                    'rgba(255,204,0,.75)';

                input.style.boxShadow =
                    '0 0 0 2px rgba(255,204,0,.12)';
            }
        );


        input.addEventListener(
            'blur',
            function () {

                input.style.borderColor =
                    'rgba(255,204,0,.25)';

                input.style.boxShadow =
                    'none';
            }
        );


        const unit =
            createElement(
                'div',
                {
                    text:
                        '만원',

                    style: `
                        position:absolute;

                        right:12px;

                        top:50%;

                        transform:
                            translateY(-50%);

                        color:
                            #ffcc00;

                        font-size:14px;

                        font-weight:800;

                        pointer-events:none;
                    `
                }
            );


        inputWrap.appendChild(
            input
        );

        inputWrap.appendChild(
            unit
        );

        modal.appendChild(
            inputWrap
        );


        // =====================================================
        // 가상 키패드 (정사각형 1:1 비율 / Compact Square Keypad)
        // =====================================================

        const keypadWrap =
            createElement(
                'div',
                {
                    style: `
                        display:grid;

                        grid-template-columns:
                            repeat(4, 1fr);

                        gap:6px;

                        margin-top:10px;
                    `
                }
            );


        const keypadButtons = [
            { label: '1', value: '1', type: 'num' },
            { label: '2', value: '2', type: 'num' },
            { label: '3', value: '3', type: 'num' },
            { label: '+1', value: '+1', type: 'fn', amount: 1 },

            { label: '4', value: '4', type: 'num' },
            { label: '5', value: '5', type: 'num' },
            { label: '6', value: '6', type: 'num' },
            { label: '+5', value: '+5', type: 'fn', amount: 5 },

            { label: '7', value: '7', type: 'num' },
            { label: '8', value: '8', type: 'num' },
            { label: '9', value: '9', type: 'num' },
            { label: '+10', value: '+10', type: 'fn', amount: 10 },

            { label: '.', value: '.', type: 'dot' },
            { label: '0', value: '0', type: 'num' },
            { label: '⌫', value: 'backspace', type: 'del' },
            { label: 'C', value: 'clear', type: 'clear' }
        ];


        keypadButtons.forEach(btnInfo => {

            const isFn =
                btnInfo.type === 'fn';

            const isDelOrClear =
                btnInfo.type === 'del' ||
                btnInfo.type === 'clear';

            let bg =
                isFn
                    ? 'rgba(255,204,0,.11)'
                    : (isDelOrClear ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.07)');

            let border =
                isFn
                    ? 'rgba(255,204,0,.22)'
                    : 'rgba(255,255,255,.08)';

            let color =
                isFn
                    ? '#ffcc00'
                    : (isDelOrClear ? 'rgba(255,255,255,.65)' : '#fff');

            let fontSize =
                isFn ? '15px' : (isDelOrClear ? '18px' : '21px');

            const btn =
                createElement(
                    'button',
                    {
                        type: 'button',

                        text: btnInfo.label,

                        style: `
                            aspect-ratio:1 / 1 !important;

                            width:100% !important;

                            box-sizing:border-box !important;

                            display:flex !important;

                            align-items:center !important;

                            justify-content:center !important;

                            border:1px solid ${border} !important;

                            border-radius:10px !important;

                            background:${bg} !important;

                            color:${color} !important;

                            font-size:${fontSize} !important;

                            font-weight:800 !important;

                            cursor:pointer !important;

                            outline:none !important;

                            user-select:none !important;

                            box-shadow:0 2px 6px rgba(0,0,0,.20) !important;

                            transition:
                                background .12s ease,
                                border-color .12s ease,
                                transform .06s ease,
                                box-shadow .12s ease !important;
                        `
                    }
                );

            btn.addEventListener(
                'mouseenter',
                function () {
                    btn.style.background =
                        isFn
                            ? 'rgba(255,204,0,.22)'
                            : 'rgba(255,255,255,.14)';
                }
            );

            btn.addEventListener(
                'mouseleave',
                function () {
                    btn.style.background = bg;
                }
            );

            btn.addEventListener(
                'mousedown',
                function (e) {
                    e.preventDefault();
                    btn.style.transform = 'scale(.91)';
                }
            );

            btn.addEventListener(
                'mouseup',
                function () {
                    btn.style.transform = 'scale(1)';
                }
            );

            btn.addEventListener(
                'click',
                function (e) {
                    e.preventDefault();

                    if (btnInfo.type === 'num') {
                        if (input.value === '0') {
                            input.value = btnInfo.value;
                        } else {
                            input.value += btnInfo.value;
                        }
                    } else if (btnInfo.type === 'dot') {
                        if (!input.value.includes('.')) {
                            input.value = input.value ? input.value + '.' : '0.';
                        }
                    } else if (btnInfo.type === 'del') {
                        input.value = input.value.slice(0, -1);
                    } else if (btnInfo.type === 'clear') {
                        input.value = '';
                    } else if (btnInfo.type === 'fn') {
                        const current = parseFloat(input.value) || 0;
                        const nextVal = Math.round((current + btnInfo.amount) * 100) / 100;
                        input.value = String(nextVal);
                    }

                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.focus();
                }
            );

            keypadWrap.appendChild(btn);
        });

        modal.appendChild(keypadWrap);


        // =====================================================
        // BUTTON
        // =====================================================

        const buttonArea =
            createElement(
                'div',
                {
                    style: `
                        display:flex;

                        gap:8px;

                        margin-top:12px;
                    `
                }
            );


        const cancel =
            createElement(
                'button',
                {
                    id:
                        '__auction_cancel',

                    type:
                        'button',

                    text:
                        '취소',

                    style: `
                        flex:1;

                        height:54px;

                        border:
                            1px solid
                            rgba(255,255,255,.11);

                        border-radius:12px;

                        background:
                            rgba(255,255,255,.06);

                        color:
                            rgba(255,255,255,.75);

                        cursor:pointer;

                        font-size:15px;

                        font-weight:700;
                    `
                }
            );


        const send =
            createElement(
                'button',
                {
                    id:
                        '__auction_send',

                    type:
                        'button',

                    text:
                        '입력',

                    style: `
                        flex:1;

                        height:54px;

                        border:0;

                        border-radius:12px;

                        background:#ffcc00;

                        color:#161616;

                        cursor:pointer;

                        font-size:15px;

                        font-weight:850;
                    `
                }
            );


        buttonArea.appendChild(
            cancel
        );

        buttonArea.appendChild(
            send
        );

        modal.appendChild(
            buttonArea
        );


        // =====================================================
        // STATUS
        // =====================================================

        const status =
            createElement(
                'div',
                {
                    id:
                        '__auction_status',

                    style: `
                        margin-top:8px;

                        min-height:16px;

                        text-align:center;

                        color:
                            rgba(255,255,255,.35);

                        font-size:11px;
                    `
                }
            );


        modal.appendChild(
            status
        );


        // =====================================================
        // 삽입
        // =====================================================

        const mountTarget = getChatMountTarget();

        mountTarget.appendChild(
            backdrop
        );

        mountTarget.appendChild(
            modal
        );

        // 스크롤 체이닝 방지 (전체 창 / 부모 창 스크롤 전파 차단)
        modal.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        backdrop.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });


        // =====================================================
        // 금액 입력
        // =====================================================

        input.addEventListener(
            'input',
            function () {

                // 쉼표(,)를 소수점(.)으로 변환하여 "13,3" 입력 시 "13.3"으로 처리
                let value =
                    input.value
                        .replace(/,/g, '.')
                        .replace(
                            /[^0-9.]/g,
                            ''
                        );

                const parts =
                    value.split('.');

                if (
                    parts.length > 2
                ) {

                    value =
                        parts[0] +
                        '.' +
                        parts
                            .slice(1)
                            .join('');
                }

                input.value =
                    value;
            }
        );


        // =====================================================
        // 제출
        // =====================================================

        async function submit() {

            const price =
                normalizePrice(
                    input.value
                );

            if (!price) {

                status.textContent =
                    '낙찰가를 입력하세요.';

                input.focus();

                return;
            }

            // 🛑 [같은 블록 내 낙찰자 변경 확인 (가상 키패드 제출)]
            const existingWinner = getExistingWinnerInBlock(targetChatItem, document);
            if (existingWinner && (existingWinner.element !== targetChatItem || (nickname && existingWinner.nickname && existingWinner.nickname.trim() !== nickname.trim()))) {
                const prevLabel = existingWinner.nickname ? `@${existingWinner.nickname}님${existingWinner.price ? ` (${existingWinner.price}만)` : ''}` : '기존 낙찰자';
                const newLabel = nickname ? `@${nickname}님 (${price}만)` : `${price}만`;
                const confirmChange = `[낙찰자 변경 확인]\n현재 경매 회차에 이미 낙찰자가 선정되어 있습니다.\n\n- 기존 낙찰자: ${prevLabel}\n- 변경할 낙찰자: ${newLabel}\n\n정말 낙찰자를 변경하시겠습니까?`;
                if (!confirm(confirmChange)) {
                    return;
                }
            }

            const message =
                createMessage(
                    nickname,
                    price
                );


            const chatInput =
                findChatInput();


            if (chatInput) {
                const success =
                    setChatInput(
                        chatInput,
                        message
                    );

                if (success) {
                    chatInput.focus();
                }
            } else {
                console.log(
                    PREFIX,
                    '가상 키패드 -> 채팅 입력창 없음 (다시보기 환경): 낙찰 기록 및 하이라이트 진행'
                );
            }


            // ✅ 낙찰 내역 기록 (수동 키패드 입력은 항상 독립 신규 낙찰로 100% 저장)
            const blockKey = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            addBidRecord(
                nickname,
                price,
                lastChatMessage || '',
                message,
                blockKey
            );

            // 🏆 채팅창에서 낙찰자 하이라이트 적용 (단 1명만 표시)
            highlightWinnerChatMessage(targetChatItem || null, {
                nickname: nickname,
                priceStr: price,
                originalChat: lastChatMessage || ''
            });

            console.log(
                PREFIX,
                '가상 키패드 -> 낙찰 기록 및 하이라이트 완료:',
                message
            );


            removeAuctionUI();

            console.log(
                PREFIX,
                '가상 키패드 -> 인풋창 입력 및 하이라이트 완료:',
                message
            );


            removeAuctionUI();
        }


        send.addEventListener(
            'click',
            submit
        );


        cancel.addEventListener(
            'click',
            removeAuctionUI
        );


        backdrop.addEventListener(
            'click',
            function (event) {

                if (
                    event.target ===
                    backdrop
                ) {

                    removeAuctionUI();
                }
            }
        );


        input.addEventListener(
            'keydown',
            function (event) {

                if (
                    event.key ===
                    'Enter'
                ) {

                    event.preventDefault();

                    submit();

                    return;
                }


                if (
                    event.key ===
                    'Escape'
                ) {

                    event.preventDefault();

                    removeAuctionUI();
                }
            }
        );


        setTimeout(
            function () {

                input.focus();

                if (parsedPrice) {
                    input.select();
                }

            },
            20
        );
    }


    // =========================================================
    // YouTube 채팅 입력창 찾기
    // =========================================================

    function findChatInput() {

        const selectors = [

            'yt-live-chat-text-input-field-renderer #input',

            'yt-live-chat-text-input-field-renderer [contenteditable="true"]',

            '#input[contenteditable="true"]'
        ];


        for (
            const selector
            of selectors
        ) {

            const elements =
                document.querySelectorAll(
                    selector
                );


            for (
                const element
                of elements
            ) {

                const rect =
                    element.getBoundingClientRect();


                if (
                    rect.width > 0 &&
                    rect.height > 0
                ) {

                    return element;
                }
            }
        }


        try {
            const iframe =
                document.querySelector(
                    'iframe#chatframe'
                );

            if (
                iframe &&
                iframe.contentDocument
            ) {
                for (
                    const selector
                    of selectors
                ) {
                    const elements =
                        iframe.contentDocument.querySelectorAll(
                            selector
                        );

                    for (
                        const element
                        of elements
                    ) {
                        const rect =
                            element.getBoundingClientRect();

                        if (
                            rect.width > 0 &&
                            rect.height > 0
                        ) {
                            return element;
                        }
                    }
                }
            }
        } catch (e) {}


        return null;
    }


    // =========================================================
    // 전송 버튼 찾기
    // =========================================================

    function findSendButton() {

        const selectors = [

            '#send-button',

            '#send-button button',

            '#send-button yt-icon-button'
        ];


        for (
            const selector
            of selectors
        ) {

            const elements =
                document.querySelectorAll(
                    selector
                );


            for (
                const element
                of elements
            ) {

                const rect =
                    element.getBoundingClientRect();


                if (
                    rect.width > 0 &&
                    rect.height > 0
                ) {

                    return element;
                }
            }
        }


        try {
            const iframe =
                document.querySelector(
                    'iframe#chatframe'
                );

            if (
                iframe &&
                iframe.contentDocument
            ) {
                for (
                    const selector
                    of selectors
                ) {
                    const elements =
                        iframe.contentDocument.querySelectorAll(
                            selector
                        );

                    for (
                        const element
                        of elements
                    ) {
                        const rect =
                            element.getBoundingClientRect();

                        if (
                            rect.width > 0 &&
                            rect.height > 0
                        ) {
                            return element;
                        }
                    }
                }
            }
        } catch (e) {}


        return null;
    }


    // =========================================================
    // 채팅 입력
    // =========================================================

    function setChatInput(
        input,
        message
    ) {

        if (!input) {
            return false;
        }


        input.focus();


        try {

            const selection =
                window.getSelection();

            const range =
                document.createRange();

            range.selectNodeContents(
                input
            );

            selection.removeAllRanges();

            selection.addRange(
                range
            );

        } catch (error) {}


        try {

            document.execCommand(
                'delete',
                false,
                null
            );

        } catch (error) {}


        let inserted =
            false;


        try {

            inserted =
                document.execCommand(
                    'insertText',
                    false,
                    message
                );

        } catch (error) {

            console.warn(
                PREFIX,
                'insertText 실패',
                error
            );
        }


        if (!inserted) {

            try {

                input.textContent =
                    message;

            } catch (error) {

                console.error(
                    PREFIX,
                    '텍스트 입력 실패',
                    error
                );

                return false;
            }
        }


        try {

            input.dispatchEvent(
                new InputEvent(
                    'input',
                    {
                        bubbles:true,

                        composed:true,

                        inputType:
                            'insertText',

                        data:
                            message
                    }
                )
            );

        } catch (error) {

            input.dispatchEvent(
                new Event(
                    'input',
                    {
                        bubbles:true,

                        composed:true
                    }
                )
            );
        }


        return true;
    }


    /**
     * 채팅 입력창 내용 비우기 (YouTube Live 채팅 입력창 완전 초기화)
     */
    function clearChatInput(input = null) {

        const inputs = [];
        if (input) {
            inputs.push(input);
        } else {
            const found = findChatInput();
            if (found) inputs.push(found);
        }

        const docs = typeof getTargetDocs === 'function' ? getTargetDocs() : [document];
        for (const doc of docs) {
            try {
                if (!doc) continue;
                const els = doc.querySelectorAll('yt-live-chat-text-input-field-renderer #input, #input[contenteditable="true"]');
                els.forEach(el => {
                    if (el && !inputs.includes(el)) inputs.push(el);
                });
            } catch (e) {}
        }

        for (const inp of inputs) {
            try {
                inp.focus();
                try {
                    const sel = (inp.ownerDocument && inp.ownerDocument.defaultView ? inp.ownerDocument.defaultView.getSelection() : window.getSelection());
                    if (sel) {
                        const range = (inp.ownerDocument || document).createRange();
                        range.selectNodeContents(inp);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                } catch (e) {}
                try {
                    (inp.ownerDocument || document).execCommand('delete', false, null);
                } catch (e) {}
                inp.textContent = '';
                inp.innerText = '';
                try {
                    inp.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }));
                } catch (e) {
                    inp.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                }
            } catch (e) {}
        }
    }


    // =========================================================
    // 채팅 전송
    // =========================================================

    async function sendChatMessage(
        message
    ) {

        console.log(
            PREFIX,
            '채팅 입력 시작'
        );


        const input =
            findChatInput();


        if (!input) {

            throw new Error(
                '라이브 채팅 입력창을 찾지 못했습니다.'
            );
        }


        const success =
            setChatInput(
                input,
                message
            );


        if (!success) {

            throw new Error(
                '채팅 입력에 실패했습니다.'
            );
        }


        await wait(150);


        let button =
            null;


        for (
            let i = 0;
            i < 20;
            i++
        ) {

            button =
                findSendButton();


            if (button) {

                const disabled =
                    button.disabled;

                const ariaDisabled =
                    button.getAttribute(
                        'aria-disabled'
                    );


                if (
                    !disabled &&
                    ariaDisabled !==
                        'true'
                ) {

                    break;
                }
            }


            button =
                null;


            await wait(30);
        }


        if (!button) {

            throw new Error(
                'YouTube 전송 버튼을 찾지 못했습니다.'
            );
        }


        console.log(
            PREFIX,
            'YouTube 전송 버튼 발견'
        );


        button.click();


        console.log(
            PREFIX,
            'YouTube 전송 완료'
        );
    }


    // =========================================================
    // 채팅 메시지 좌클릭 핸들러 (수식키 없이 좌클릭만으로 동작)
    // =========================================================

    function handleChatMessageClick(
        event
    ) {

        // 🛑 좌클릭(button === 0)만 허용 (우클릭/휠클릭 무시)
        if (
            event.button !== undefined &&
            event.button !== 0
        ) {
            return;
        }

        // 🛑 가드 1: 버튼, 입력창, 링크, 메뉴, 안내 패널, 모달 내부 클릭은 무시
        const ignoreSelectors = [
            'button',
            'input',
            'textarea',
            'a',
            'yt-icon-button',
            '#menu',
            '#__auction_guide_panel',
            '#__auction_separator_button',
            '#__auction_bid_list_btn',
            '#__auction_floating_bid_btn',
            '#__auction_auto_modal',
            '#__auction_bid_list_modal',
            'yt-live-chat-message-input-renderer',
            'yt-live-chat-text-input-field-renderer',
            '#action-buttons',
            '#picker-buttons'
        ].join(', ');

        if (
            event.target &&
            typeof event.target.closest === 'function' &&
            event.target.closest(ignoreSelectors)
        ) {
            return;
        }

        // 🛑 가드 2: 반드시 실제 채팅 메시지 렌더러 내부를 클릭했을 때만 동작
        const messageItem =
            findChatMessageItem(event.target);

        if (!messageItem) {
            return;
        }

        // 🛑 가드 3: 진행자, 운영자 또는 시스템 메시지는 낙찰 대상에서 제외
        if (isHostOrSystemElement(messageItem)) {
            console.log(PREFIX, '진행자/운영자 메시지는 낙찰 처리 대상이 아닙니다.');
            return;
        }

        // 🛑 [낙찰 취소 확인] 이미 낙찰자로 하이라이트된 메시지를 다시 클릭한 경우 낙찰 취소 확인 및 실행
        const isWinner = messageItem.classList.contains('auction-winner-highlight') || Boolean(messageItem.querySelector('.auction-winner-badge'));
        if (isWinner) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }

            const author = findAuthor(event.target, event) || messageItem.querySelector('#author-name');
            const nickname = author ? getNickname(author) : '';
            const nickLabel = nickname ? `@${nickname}님` : '해당 낙찰자';
            const confirmMsg = `[낙찰 취소 확인]\n${nickLabel}의 낙찰 처리를 취소하시겠습니까?\n\n- 채팅 하이라이트 해제\n- 채팅 입력창 내용 비우기\n- 낙찰 내역에서 삭제`;

            if (!confirm(confirmMsg)) {
                return;
            }

            const targetDoc = event.target.ownerDocument || document;

            // 1) 채팅창 하이라이트 및 뱃지 해제
            clearWinnerHighlightsInBlock(messageItem, targetDoc);
            messageItem.classList.remove('auction-winner-highlight');
            const badges = messageItem.querySelectorAll('.auction-winner-badge');
            badges.forEach(b => {
                if (b && typeof b.remove === 'function') {
                    b.remove();
                } else if (b && b.parentNode) {
                    b.parentNode.removeChild(b);
                }
            });

            // 2) 인풋창 내용 비우기
            clearChatInput();

            // 3) 낙찰 내역에서 해당 기록 삭제
            const blockKey = getAuctionBlockKey(messageItem, targetDoc);
            removeBidRecord(blockKey, nickname);

            showAuctionToast(`🚫 ${nickLabel} 낙찰이 취소되었습니다.`, 'separator');
            console.log(PREFIX, `🚫 ${nickLabel} 낙찰 취소 완료 (하이라이트, 인풋창, 낙찰내역 취소)`);
            return;
        }

        const author =
            findAuthor(
                event.target,
                event
            );

        if (!author) {
            return;
        }


        const nickname =
            getNickname(
                author
            );


        if (!nickname || isHostNickname(nickname)) {
            return;
        }


        event.preventDefault();

        event.stopPropagation();

        if (
            typeof event.stopImmediatePropagation === 'function'
        ) {
            event.stopImmediatePropagation();
        }


        const lastChatMessage =
            extractChatMessage(
                event.target,
                nickname,
                event
            );

        // 🛑 가드 4: 공지, 안내문구, 낙찰완료 메시지, 밑줄 등은 클릭 무시
        if (!lastChatMessage || isSystemOrNoticeMessage(lastChatMessage)) {
            console.log(PREFIX, '공지/시스템/낙찰완료 메시지는 낙찰 처리 대상이 아닙니다.');
            return;
        }


        console.log(
            PREFIX,
            '채팅 좌클릭 감지 성공:',
            nickname,
            '채팅:',
            lastChatMessage
        );

        const chatItem = findChatMessageItem(event.target);
        const parsedPrice =
            parseBidPriceWithContext(lastChatMessage, chatItem);

        // 🛑 [같은 블록 내 낙찰자 변경 확인 알림창]
        const existingWinner = getExistingWinnerInBlock(chatItem, event.target.ownerDocument || document);
        if (existingWinner && (existingWinner.element !== chatItem || (nickname && existingWinner.nickname && existingWinner.nickname.trim() !== nickname.trim()))) {
            const prevLabel = existingWinner.nickname ? `@${existingWinner.nickname}님${existingWinner.price ? ` (${existingWinner.price}만)` : ''}` : '기존 낙찰자';
            const newLabel = parsedPrice
                ? (nickname ? `@${nickname}님 (${parsedPrice}만)` : `${parsedPrice}만`)
                : (nickname ? `@${nickname}님` : '해당 입찰자');
            const confirmChange = `[낙찰자 변경 확인]\n현재 경매 회차에 이미 낙찰자가 선정되어 있습니다.\n\n- 기존 낙찰자: ${prevLabel}\n- 변경 대상: ${newLabel}\n\n정말 낙찰자를 변경하시겠습니까?`;
            if (!confirm(confirmChange)) {
                return;
            }
        }

        if (parsedPrice) {

            removeAuctionUI();

            const message =
                createMessage(
                    nickname,
                    parsedPrice
                );

            const input =
                findChatInput();

            if (input) {
                setChatInput(
                    input,
                    message
                );
                input.focus();
                console.log(
                    PREFIX,
                    '숫자 감지 -> 인풋창 자동 입력 완료:',
                    message
                );
            } else {
                console.log(
                    PREFIX,
                    '숫자 감지 -> 채팅 입력창 없음 (다시보기 환경/입력창 숨김): 낙찰 기록 및 하이라이트 진행'
                );
            }

            // ✅ 낙찰 내역 기록 (수동 채팅 클릭은 항상 독립 신규 낙찰로 100% 저장)
            const blockKey = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            addBidRecord(
                nickname,
                parsedPrice,
                lastChatMessage || '',
                message,
                blockKey
            );

            // 🏆 채팅창에서 낙찰자 하이라이트 적용
            highlightWinnerChatMessage(chatItem, {
                nickname: nickname,
                priceStr: parsedPrice,
                originalChat: lastChatMessage || ''
            });

        } else {

            openAuctionModal(
                nickname,
                lastChatMessage,
                chatItem
            );
        }
    }


    // =========================================================
    // 안내문구
    // =========================================================

    const GUIDE_MESSAGES = {

        member:
            '👤 회원등록 ┃ 📝 성함·주소·닉네임을 해담분재경매장 010 - 8392 - 9241로 보내주세요. ┃ 📢 회원정보 변경 시 변경된 회원정보를 문자로 남겨주세요. ┃ ⚠️ 잦은 닉네임 변경은 회원확인 / 구매이력 / 배송관리 등의 업무처리에 혼선을 초래하게 됩니다.',

        price:
            '💰 호가 ┃ 💵 10만원 이상 → 1만원 단위 ┃ 💵 100만원 이상 → 5만원 단위 ┃ 💵 500만원 이상 → 10만원 단위',

        place:
            '📍 경매장 ┃ 🏠 전북 익산시 번영로 8길 52 ┃ 📍 전북 익산시 목천동 750-2 ┃ 🌳 해담분재원',

        cancel:
            '🚫 낙찰 취소 ┃ ❌ 낙찰 후 단순변심 취소 불가 ┃ 💸 취소 시 위약금(수수료) 30% 청구 ┃ ⚠️ 신중한 참여 부탁드립니다.',

        chat:
            '💬 채팅 안내 ┃ ⚠️ 유튜브 딜레이로 본인의 채팅이 먼저 보일 수 있습니다. ┃ 🔄 나갔다가 다시 들어오시면 채팅이 재배열되어 정확하게 확인할 수 있습니다.',

        delivery:
            '📦 택배 ┃ 📏 분포함 수고 50cm 내외까지 발송 가능 ┃ ⚠️ 세심하게 포장하지만 유통 과정에서 배송 사고가 발생할 수 있습니다. ┃ 💰 기본 택배비 6,000원',

        bid:
            '🔨 입찰 안내 ┃ ⏱️ 실시간 방송 특성상 입찰 시 딜레이 및 시차가 있을 수 있습니다. ┃ 🏆 낙찰 우선순위는 경매장 화면에 표시되는 채팅창을 기준으로 합니다. ┃ 👀 입찰 시 경매장 화면을 기준으로 확인해주세요.',

        support:
            '❤️ 많은 응원 부탁드립니다 ┃ 👍 좋아요 ┃ 🔔 구독 ┃ 💬 댓글'
    };


    // =========================================================
    // 안내 버튼 색상 테마
    // =========================================================

    const GUIDE_COLORS = {

        '📐 규격입력': {
            bg: 'rgba(6,182,212,.12)',
            border: 'rgba(6,182,212,.38)',
            text: '#38bdf8',
            hoverBg: 'rgba(6,182,212,.24)',
            hoverBorder: 'rgba(6,182,212,.60)',
            hoverText: '#bae6fd'
        },

        '💰 가격입력': {
            bg: 'rgba(234,179,8,.12)',
            border: 'rgba(234,179,8,.38)',
            text: '#facc15',
            hoverBg: 'rgba(234,179,8,.24)',
            hoverBorder: 'rgba(234,179,8,.60)',
            hoverText: '#fef08a'
        },

        '👤 회원등록': {
            bg: 'rgba(80,140,220,.10)',
            border: 'rgba(80,140,220,.28)',
            text: '#8db8ee',
            hoverBg: 'rgba(80,140,220,.20)',
            hoverBorder: 'rgba(80,140,220,.45)',
            hoverText: '#a8ccfc'
        },

        '💰 호가': {
            bg: 'rgba(220,170,50,.10)',
            border: 'rgba(220,170,50,.28)',
            text: '#e8c56d',
            hoverBg: 'rgba(220,170,50,.20)',
            hoverBorder: 'rgba(220,170,50,.45)',
            hoverText: '#f5dc94'
        },

        '💰 호가 안내': {
            bg: 'rgba(220,170,50,.10)',
            border: 'rgba(220,170,50,.28)',
            text: '#e8c56d',
            hoverBg: 'rgba(220,170,50,.20)',
            hoverBorder: 'rgba(220,170,50,.45)',
            hoverText: '#f5dc94'
        },

        '🏠 경매장': {
            bg: 'rgba(70,180,120,.10)',
            border: 'rgba(70,180,120,.28)',
            text: '#83d2a5',
            hoverBg: 'rgba(70,180,120,.20)',
            hoverBorder: 'rgba(70,180,120,.45)',
            hoverText: '#a4e8c1'
        },

        '🚫 낙찰 취소': {
            bg: 'rgba(220,70,70,.10)',
            border: 'rgba(220,70,70,.28)',
            text: '#ee9292',
            hoverBg: 'rgba(220,70,70,.20)',
            hoverBorder: 'rgba(220,70,70,.45)',
            hoverText: '#fca5a5'
        },

        '💬 채팅 안내': {
            bg: 'rgba(150,110,230,.10)',
            border: 'rgba(150,110,230,.28)',
            text: '#c4a5f8',
            hoverBg: 'rgba(150,110,230,.20)',
            hoverBorder: 'rgba(150,110,230,.45)',
            hoverText: '#dec5fd'
        },

        '📦 택배': {
            bg: 'rgba(235,130,50,.10)',
            border: 'rgba(235,130,50,.28)',
            text: '#f2a668',
            hoverBg: 'rgba(235,130,50,.20)',
            hoverBorder: 'rgba(235,130,50,.45)',
            hoverText: '#ffc396'
        },

        '🔨 입찰 안내': {
            bg: 'rgba(40,185,185,.10)',
            border: 'rgba(40,185,185,.28)',
            text: '#6ee0e0',
            hoverBg: 'rgba(40,185,185,.20)',
            hoverBorder: 'rgba(40,185,185,.45)',
            hoverText: '#98eeee'
        },

        '❤️ 응원문구': {
            bg: 'rgba(220,80,130,.10)',
            border: 'rgba(220,80,130,.28)',
            text: '#ef91b1',
            hoverBg: 'rgba(220,80,130,.20)',
            hoverBorder: 'rgba(220,80,130,.45)',
            hoverText: '#fbb3d0'
        },

        '📁': {
            bg: 'rgba(255,255,255,.06)',
            border: 'rgba(255,255,255,.16)',
            text: 'rgba(255,255,255,.85)',
            hoverBg: 'rgba(255,255,255,.14)',
            hoverBorder: 'rgba(255,255,255,.30)',
            hoverText: '#fff'
        }
    };


    // =========================================================
    // 📐 규격 입력 모달
    // =========================================================

    function openSpecModal() {
        removeCustomModals();

        const mountTarget = getChatMountTarget();
        if (!mountTarget) return;

        const backdrop = createElement('div', {
            id: '__auction_spec_backdrop',
            style: `
                position:fixed !important;
                inset:0 !important;
                width:100% !important;
                height:100% !important;
                background:rgba(0,0,0,.62) !important;
                backdrop-filter:blur(5px) !important;
                -webkit-backdrop-filter:blur(5px) !important;
                z-index:2147483646 !important;
                opacity:1 !important;
                visibility:visible !important;
                pointer-events:auto !important;
                overscroll-behavior:contain !important;
            `
        });

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                removeCustomModals();
            }
        });

        const modal = createElement('div', {
            id: '__auction_spec_modal',
            style: `
                position:fixed !important;
                left:50% !important;
                top:50% !important;
                transform:translate(-50%,-50%) !important;
                width:300px !important;
                max-width:calc(100% - 24px) !important;
                max-height:calc(100% - 24px) !important;
                box-sizing:border-box !important;
                padding:16px 18px !important;
                background:linear-gradient(145deg, rgba(30,32,38,.98), rgba(18,20,24,.99)) !important;
                color:#fff !important;
                border:1px solid rgba(56,189,248,.32) !important;
                border-radius:16px !important;
                box-shadow:0 25px 80px rgba(0,0,0,.8), 0 0 20px rgba(56,189,248,.12) !important;
                z-index:2147483647 !important;
                display:flex !important;
                flex-direction:column !important;
                gap:12px !important;
                font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                overflow:hidden !important;
                overscroll-behavior:contain !important;
            `
        });

        // Header
        const header = createElement('div', {
            style: `
                display:flex !important;
                align-items:center !important;
                justify-content:space-between !important;
                padding-bottom:10px !important;
                border-bottom:1px solid rgba(255,255,255,.1) !important;
            `
        });

        const title = createElement('div', {
            text: '📐 규격 입력',
            style: `
                font-size:15px !important;
                font-weight:800 !important;
                color:#7dd3fc !important;
                letter-spacing:-0.3px !important;
            `
        });

        const closeBtn = createElement('button', {
            type: 'button',
            text: '✕',
            style: `
                background:transparent !important;
                border:none !important;
                color:rgba(255,255,255,.6) !important;
                font-size:16px !important;
                cursor:pointer !important;
                padding:2px 6px !important;
                border-radius:6px !important;
                line-height:1 !important;
                transition:all .15s ease !important;
            `
        });
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.color = '#fff';
            closeBtn.style.background = 'rgba(255,255,255,.1)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.color = 'rgba(255,255,255,.6)';
            closeBtn.style.background = 'transparent';
        });
        closeBtn.addEventListener('click', () => removeCustomModals());

        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Fields Container
        const formContainer = createElement('div', {
            style: `
                display:flex !important;
                flex-direction:column !important;
                gap:8px !important;
            `
        });

        const specFields = [
            { key: '수고', placeholder: '수고 (예: 50)' },
            { key: '폭',   placeholder: '폭 (예: 30)' },
            { key: '높이', placeholder: '높이 (예: 20)' },
            { key: '목대', placeholder: '목대 (예: 15)' },
            { key: '근장', placeholder: '근장 (예: 8)' }
        ];

        const inputs = [];

        // 전송 / 주입 핸들러
        const submitSpec = () => {
            const values = inputs.map(item => ({
                key: item.key,
                val: item.input.value.trim()
            }));

            const combined = values
                .filter(item => item.val !== '')
                .map(item => `${item.key}${item.val}`)
                .join(' · ');

            if (combined) {
                const chatInput = findChatInput();
                if (chatInput) {
                    setChatInput(chatInput, combined);
                    chatInput.focus();
                } else {
                    console.warn(PREFIX, '채팅 입력창을 찾지 못했습니다.');
                }
            }
            removeCustomModals();
        };

        specFields.forEach((field) => {
            const row = createElement('div', {
                style: `
                    display:flex !important;
                    align-items:center !important;
                    justify-content:space-between !important;
                    gap:10px !important;
                `
            });

            const label = createElement('span', {
                text: field.key,
                style: `
                    width:42px !important;
                    font-size:13px !important;
                    font-weight:700 !important;
                    color:#e2e8f0 !important;
                `
            });

            const inputEl = createElement('input', {
                type: 'text',
                inputmode: 'decimal',
                placeholder: field.placeholder,
                style: `
                    flex:1 !important;
                    height:34px !important;
                    box-sizing:border-box !important;
                    padding:0 10px !important;
                    background:rgba(255,255,255,.07) !important;
                    border:1px solid rgba(255,255,255,.16) !important;
                    border-radius:8px !important;
                    color:#fff !important;
                    font-size:13.5px !important;
                    font-weight:600 !important;
                    outline:none !important;
                    transition:border-color .15s ease, background .15s ease !important;
                `
            });

            inputEl.addEventListener('input', () => {
                const cleaned = sanitizeDecimalInput(inputEl.value);
                if (inputEl.value !== cleaned) {
                    inputEl.value = cleaned;
                }
            });

            inputEl.addEventListener('focus', () => {
                inputEl.style.borderColor = '#38bdf8';
                inputEl.style.background = 'rgba(56,189,248,.12)';
            });

            inputEl.addEventListener('blur', () => {
                inputEl.style.borderColor = 'rgba(255,255,255,.16)';
                inputEl.style.background = 'rgba(255,255,255,.07)';
            });

            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitSpec();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    removeCustomModals();
                }
            });

            row.appendChild(label);
            row.appendChild(inputEl);
            formContainer.appendChild(row);

            inputs.push({ key: field.key, input: inputEl });
        });

        modal.appendChild(formContainer);

        // Submit Button
        const submitBtn = createElement('button', {
            type: 'button',
            text: '📤 규격 전송',
            style: `
                width:100% !important;
                height:38px !important;
                margin-top:4px !important;
                background:linear-gradient(135deg, rgba(6,182,212,.3), rgba(14,165,233,.4)) !important;
                border:1px solid rgba(56,189,248,.45) !important;
                border-radius:10px !important;
                color:#e0f2fe !important;
                font-size:13px !important;
                font-weight:750 !important;
                cursor:pointer !important;
                transition:all .15s ease !important;
                letter-spacing:-0.2px !important;
            `
        });

        submitBtn.addEventListener('mouseenter', () => {
            submitBtn.style.background = 'linear-gradient(135deg, rgba(6,182,212,.45), rgba(14,165,233,.6))';
            submitBtn.style.borderColor = '#38bdf8';
            submitBtn.style.color = '#fff';
            submitBtn.style.transform = 'translateY(-1px)';
        });
        submitBtn.addEventListener('mouseleave', () => {
            submitBtn.style.background = 'linear-gradient(135deg, rgba(6,182,212,.3), rgba(14,165,233,.4))';
            submitBtn.style.borderColor = 'rgba(56,189,248,.45)';
            submitBtn.style.color = '#e0f2fe';
            submitBtn.style.transform = 'translateY(0)';
        });
        submitBtn.addEventListener('mousedown', () => {
            submitBtn.style.transform = 'scale(.98)';
        });
        submitBtn.addEventListener('mouseup', () => {
            submitBtn.style.transform = 'scale(1)';
        });
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            submitSpec();
        });

        modal.appendChild(submitBtn);

        mountTarget.appendChild(backdrop);
        mountTarget.appendChild(modal);

        modal.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        backdrop.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        // 첫 번째 입력칸(수고) 자동 포커스
        setTimeout(() => {
            if (inputs[0] && inputs[0].input) {
                inputs[0].input.focus();
            }
        }, 40);
    }


    // =========================================================
    // 💰 가격 입력 선택 모달 (최고가 / 이상 / 일반)
    // =========================================================

    function openPriceChoiceModal() {
        removeCustomModals();

        const mountTarget = getChatMountTarget();
        if (!mountTarget) return;

        const backdrop = createElement('div', {
            id: '__auction_price_choice_backdrop',
            style: `
                position:fixed !important;
                inset:0 !important;
                width:100% !important;
                height:100% !important;
                background:rgba(0,0,0,.62) !important;
                backdrop-filter:blur(5px) !important;
                -webkit-backdrop-filter:blur(5px) !important;
                z-index:2147483646 !important;
                opacity:1 !important;
                visibility:visible !important;
                pointer-events:auto !important;
                overscroll-behavior:contain !important;
            `
        });

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                removeCustomModals();
            }
        });

        const modal = createElement('div', {
            id: '__auction_price_choice_modal',
            style: `
                position:fixed !important;
                left:50% !important;
                top:50% !important;
                transform:translate(-50%,-50%) !important;
                width:280px !important;
                max-width:calc(100% - 24px) !important;
                max-height:calc(100% - 24px) !important;
                box-sizing:border-box !important;
                padding:16px 18px !important;
                background:linear-gradient(145deg, rgba(30,32,38,.98), rgba(18,20,24,.99)) !important;
                color:#fff !important;
                border:1px solid rgba(234,179,8,.32) !important;
                border-radius:16px !important;
                box-shadow:0 25px 80px rgba(0,0,0,.8), 0 0 20px rgba(234,179,8,.12) !important;
                z-index:2147483647 !important;
                display:flex !important;
                flex-direction:column !important;
                gap:12px !important;
                font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                overflow:hidden !important;
                overscroll-behavior:contain !important;
            `
        });

        // Header
        const header = createElement('div', {
            style: `
                display:flex !important;
                align-items:center !important;
                justify-content:space-between !important;
                padding-bottom:10px !important;
                border-bottom:1px solid rgba(255,255,255,.1) !important;
            `
        });

        const title = createElement('div', {
            text: '💰 가격 입력 선택',
            style: `
                font-size:15px !important;
                font-weight:800 !important;
                color:#fde047 !important;
                letter-spacing:-0.3px !important;
            `
        });

        const closeBtn = createElement('button', {
            type: 'button',
            text: '✕',
            style: `
                background:transparent !important;
                border:none !important;
                color:rgba(255,255,255,.6) !important;
                font-size:16px !important;
                cursor:pointer !important;
                padding:2px 6px !important;
                border-radius:6px !important;
                line-height:1 !important;
                transition:all .15s ease !important;
            `
        });
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.color = '#fff';
            closeBtn.style.background = 'rgba(255,255,255,.1)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.color = 'rgba(255,255,255,.6)';
            closeBtn.style.background = 'transparent';
        });
        closeBtn.addEventListener('click', () => removeCustomModals());

        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Choice Buttons List
        const btnList = createElement('div', {
            style: `
                display:flex !important;
                flex-direction:column !important;
                gap:8px !important;
            `
        });

        const createChoiceBtn = (label, desc, colors, onClick) => {
            const btn = createElement('button', {
                type: 'button',
                style: `
                    width:100% !important;
                    height:44px !important;
                    padding:0 14px !important;
                    box-sizing:border-box !important;
                    display:flex !important;
                    align-items:center !important;
                    justify-content:space-between !important;
                    background:${colors.bg} !important;
                    border:1px solid ${colors.border} !important;
                    border-radius:10px !important;
                    color:${colors.text} !important;
                    cursor:pointer !important;
                    transition:all .15s ease !important;
                `
            });

            const lblSpan = createElement('span', {
                text: label,
                style: `
                    font-size:14px !important;
                    font-weight:750 !important;
                `
            });

            const descSpan = createElement('span', {
                text: desc,
                style: `
                    font-size:11.5px !important;
                    font-weight:500 !important;
                    color:rgba(255,255,255,.5) !important;
                `
            });

            btn.appendChild(lblSpan);
            btn.appendChild(descSpan);

            btn.addEventListener('mouseenter', () => {
                btn.style.background = colors.hoverBg;
                btn.style.borderColor = colors.hoverBorder;
                btn.style.transform = 'translateY(-1px)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = colors.bg;
                btn.style.borderColor = colors.border;
                btn.style.transform = 'translateY(0)';
            });
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                onClick();
            });

            return btn;
        };

        // 1. 👑 최고가 (즉시 입력창 주입)
        btnList.appendChild(
            createChoiceBtn(
                '👑 최고가',
                '즉시 "최고가" 입력',
                {
                    bg: 'rgba(234,179,8,.12)',
                    border: 'rgba(234,179,8,.35)',
                    text: '#fde047',
                    hoverBg: 'rgba(234,179,8,.25)',
                    hoverBorder: 'rgba(234,179,8,.6)'
                },
                () => {
                    const chatInput = findChatInput();
                    if (chatInput) {
                        setChatInput(chatInput, '최고가');
                        chatInput.focus();
                    }
                    removeCustomModals();
                }
            )
        );

        // 2. ⬆️ 이상 (숫자 입력 모달)
        btnList.appendChild(
            createChoiceBtn(
                '⬆️ 이상',
                '숫자 입력 → "OO만이상"',
                {
                    bg: 'rgba(6,182,212,.12)',
                    border: 'rgba(6,182,212,.35)',
                    text: '#67e8f9',
                    hoverBg: 'rgba(6,182,212,.25)',
                    hoverBorder: 'rgba(6,182,212,.6)'
                },
                () => {
                    openPriceAmountModal('이상');
                }
            )
        );

        // 3. 📋 일반 (숫자 입력 모달)
        btnList.appendChild(
            createChoiceBtn(
                '📋 일반',
                '숫자 입력 → "OO만"',
                {
                    bg: 'rgba(34,197,94,.12)',
                    border: 'rgba(34,197,94,.35)',
                    text: '#86efac',
                    hoverBg: 'rgba(34,197,94,.25)',
                    hoverBorder: 'rgba(34,197,94,.6)'
                },
                () => {
                    openPriceAmountModal('일반');
                }
            )
        );

        modal.appendChild(btnList);

        mountTarget.appendChild(backdrop);
        mountTarget.appendChild(modal);

        modal.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        backdrop.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                removeCustomModals();
                window.removeEventListener('keydown', escHandler, true);
            }
        };
        window.addEventListener('keydown', escHandler, true);
    }


    // =========================================================
    // 💰 가격 숫자 입력 모달 (이상 / 일반)
    // =========================================================

    function openPriceAmountModal(type) {
        removeCustomModals();

        const mountTarget = getChatMountTarget();
        if (!mountTarget) return;

        const isSang = type === '이상';
        const titleText = isSang ? '⬆️ 가격 입력 (이상)' : '📋 가격 입력 (일반)';
        const accentColor = isSang ? '#67e8f9' : '#86efac';
        const guideSuffix = isSang ? '만이상' : '만';

        const backdrop = createElement('div', {
            id: '__auction_price_amount_backdrop',
            style: `
                position:fixed !important;
                inset:0 !important;
                width:100% !important;
                height:100% !important;
                background:rgba(0,0,0,.62) !important;
                backdrop-filter:blur(5px) !important;
                -webkit-backdrop-filter:blur(5px) !important;
                z-index:2147483646 !important;
                opacity:1 !important;
                visibility:visible !important;
                pointer-events:auto !important;
                overscroll-behavior:contain !important;
            `
        });

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                removeCustomModals();
            }
        });

        const modal = createElement('div', {
            id: '__auction_price_amount_modal',
            style: `
                position:fixed !important;
                left:50% !important;
                top:50% !important;
                transform:translate(-50%,-50%) !important;
                width:290px !important;
                max-width:calc(100% - 24px) !important;
                max-height:calc(100% - 24px) !important;
                box-sizing:border-box !important;
                padding:16px 18px !important;
                background:linear-gradient(145deg, rgba(30,32,38,.98), rgba(18,20,24,.99)) !important;
                color:#fff !important;
                border:1px solid ${isSang ? 'rgba(6,182,212,.35)' : 'rgba(34,197,94,.35)'} !important;
                border-radius:16px !important;
                box-shadow:0 25px 80px rgba(0,0,0,.8) !important;
                z-index:2147483647 !important;
                display:flex !important;
                flex-direction:column !important;
                gap:12px !important;
                font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                overflow:hidden !important;
                overscroll-behavior:contain !important;
            `
        });

        // Header
        const header = createElement('div', {
            style: `
                display:flex !important;
                align-items:center !important;
                justify-content:space-between !important;
                padding-bottom:10px !important;
                border-bottom:1px solid rgba(255,255,255,.1) !important;
            `
        });

        const title = createElement('div', {
            text: titleText,
            style: `
                font-size:15px !important;
                font-weight:800 !important;
                color:${accentColor} !important;
                letter-spacing:-0.3px !important;
            `
        });

        const closeBtn = createElement('button', {
            type: 'button',
            text: '✕',
            style: `
                background:transparent !important;
                border:none !important;
                color:rgba(255,255,255,.6) !important;
                font-size:16px !important;
                cursor:pointer !important;
                padding:2px 6px !important;
                border-radius:6px !important;
                line-height:1 !important;
                transition:all .15s ease !important;
            `
        });
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.color = '#fff';
            closeBtn.style.background = 'rgba(255,255,255,.1)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.color = 'rgba(255,255,255,.6)';
            closeBtn.style.background = 'transparent';
        });
        closeBtn.addEventListener('click', () => removeCustomModals());

        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Guide text
        const guideText = createElement('div', {
            text: `숫자 입력 시 자동으로 "${guideSuffix}"이 붙습니다. (단위: 만원)`,
            style: `
                font-size:11.5px !important;
                color:rgba(255,255,255,.6) !important;
                line-height:1.4 !important;
            `
        });
        modal.appendChild(guideText);

        // Input & Submit
        const inputWrap = createElement('div', {
            style: `
                display:flex !important;
                align-items:center !important;
                gap:8px !important;
            `
        });

        const inputEl = createElement('input', {
            type: 'text',
            inputmode: 'decimal',
            placeholder: '예: 15, 25.5, 34',
            style: `
                flex:1 !important;
                height:38px !important;
                box-sizing:border-box !important;
                padding:0 12px !important;
                background:rgba(255,255,255,.08) !important;
                border:1px solid rgba(255,255,255,.18) !important;
                border-radius:8px !important;
                color:#fff !important;
                font-size:15px !important;
                font-weight:700 !important;
                outline:none !important;
                transition:border-color .15s ease !important;
            `
        });

        const submitPrice = () => {
            const val = inputEl.value.trim();
            if (val) {
                const resultText = `${val}${guideSuffix}`;
                const chatInput = findChatInput();
                if (chatInput) {
                    setChatInput(chatInput, resultText);
                    chatInput.focus();
                } else {
                    console.warn(PREFIX, '채팅 입력창을 찾지 못했습니다.');
                }
            }
            removeCustomModals();
        };

        inputEl.addEventListener('input', () => {
            const cleaned = sanitizeDecimalInput(inputEl.value);
            if (inputEl.value !== cleaned) {
                inputEl.value = cleaned;
            }
        });

        inputEl.addEventListener('focus', () => {
            inputEl.style.borderColor = accentColor;
        });
        inputEl.addEventListener('blur', () => {
            inputEl.style.borderColor = 'rgba(255,255,255,.18)';
        });
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitPrice();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                removeCustomModals();
            }
        });

        const confirmBtn = createElement('button', {
            type: 'button',
            text: '확인',
            style: `
                width:64px !important;
                height:38px !important;
                background:${isSang ? 'rgba(6,182,212,.3)' : 'rgba(34,197,94,.3)'} !important;
                border:1px solid ${isSang ? 'rgba(6,182,212,.5)' : 'rgba(34,197,94,.5)'} !important;
                border-radius:8px !important;
                color:#fff !important;
                font-size:13px !important;
                font-weight:750 !important;
                cursor:pointer !important;
                transition:all .15s ease !important;
            `
        });

        confirmBtn.addEventListener('click', (e) => {
            e.preventDefault();
            submitPrice();
        });

        inputWrap.appendChild(inputEl);
        inputWrap.appendChild(confirmBtn);
        modal.appendChild(inputWrap);

        mountTarget.appendChild(backdrop);
        mountTarget.appendChild(modal);

        modal.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        backdrop.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        setTimeout(() => {
            inputEl.focus();
        }, 40);
    }


    // =========================================================
    // 기타 안내 패널 닫기 헬퍼
    // =========================================================

    function closeMorePanel() {
        _isMorePanelOpen = false;
        const docs = getTargetDocs();
        docs.forEach(doc => {
            try {
                if (!doc) return;
                const container = doc.getElementById('__auction_more_container');
                if (container) {
                    container.style.display = 'none';
                }
                const btn = doc.getElementById('__auction_more_toggle_btn');
                if (btn) {
                    btn.textContent = '📁';
                    btn.title = '기타 안내 문구 열기';
                    btn.style.background = 'rgba(255,255,255,.06)';
                    btn.style.borderColor = 'rgba(255,255,255,.16)';
                    btn.style.color = 'rgba(255,255,255,.85)';
                }
            } catch (e) {}
        });
    }


    // =========================================================
    // 안내 버튼 스타일 생성
    // =========================================================

    function createGuideButton(
        label,
        message,
        onClick = null,
        autoCloseMore = false
    ) {

        const colors =
            GUIDE_COLORS[label] || {
                bg: 'rgba(255,255,255,.055)',
                border: 'rgba(255,255,255,.10)',
                text: 'rgba(255,255,255,.82)',
                hoverBg: 'rgba(255,255,255,.11)',
                hoverBorder: 'rgba(255,255,255,.20)',
                hoverText: '#fff'
            };

        const button =
            createElement(
                'button',
                {
                    type:
                        'button',

                    text:
                        label,

                    style: `
                        flex:1 1 0 !important;

                        min-width:0 !important;

                        height:32px !important;

                        padding:
                            0 4px !important;

                        box-sizing:
                            border-box !important;

                        border:
                            1px solid
                            ${colors.border}
                            !important;

                        border-radius:
                            8px !important;

                        background:
                            ${colors.bg}
                            !important;

                        color:
                            ${colors.text}
                            !important;

                        cursor:
                            pointer !important;

                        font-family:
                            -apple-system,
                            BlinkMacSystemFont,
                            "Segoe UI",
                            Roboto,
                            Arial,
                            sans-serif
                            !important;

                        font-size:
                            11px !important;

                        font-weight:
                            700 !important;

                        line-height:
                            32px !important;

                        letter-spacing:
                            -0.2px !important;

                        white-space:
                            nowrap !important;

                        overflow:
                            hidden !important;

                        text-overflow:
                            ellipsis !important;

                        transition:
                            background .15s ease,
                            border-color .15s ease,
                            color .15s ease,
                            transform .08s ease
                            !important;
                    `
                }
            );


        button.addEventListener(
            'mouseenter',
            function () {

                button.style.background =
                    colors.hoverBg ||
                    colors.bg;

                button.style.borderColor =
                    colors.hoverBorder ||
                    colors.border;

                button.style.color =
                    colors.hoverText ||
                    '#fff';
            }
        );


        button.addEventListener(
            'mouseleave',
            function () {

                button.style.background =
                    colors.bg;

                button.style.borderColor =
                    colors.border;

                button.style.color =
                    colors.text;
            }
        );


        button.addEventListener(
            'mousedown',
            function () {

                button.style.transform =
                    'scale(.97)';
            }
        );


        button.addEventListener(
            'mouseup',
            function () {

                button.style.transform =
                    'scale(1)';
            }
        );


        button.addEventListener(
            'click',
            function (event) {

                event.preventDefault();

                event.stopPropagation();

                if (typeof onClick === 'function') {
                    onClick(event);
                    if (autoCloseMore) {
                        closeMorePanel();
                    }
                    return;
                }

                const input =
                    findChatInput();

                if (!input) {

                    console.warn(
                        PREFIX,
                        '채팅 입력창을 찾지 못했습니다.'
                    );

                    return;
                }

                setChatInput(
                    input,
                    message
                );

                input.focus();

                console.log(
                    PREFIX,
                    '안내문구 입력:',
                    label
                );

                if (autoCloseMore) {
                    closeMorePanel();
                }
            }
        );


        return button;
    }


    // =========================================================
    // 안내 버튼 영역 생성 (메인: 규격/가격/정사각형 토글 + 펼침: 기타 8종)
    // =========================================================

    let _isMorePanelOpen = false;

    function createGuidePanel() {

        const input =
            findChatInput();

        if (!input) {
            return;
        }

        const targetDoc =
            input.ownerDocument ||
            document;

        // 중복 패널이 이미 있으면 모두 정리하고 1개만 남기거나 조기 반환
        const existingPanels =
            targetDoc.querySelectorAll(
                '#__auction_guide_panel'
            );

        if (existingPanels.length > 0) {
            for (let i = 1; i < existingPanels.length; i++) {
                existingPanels[i].remove();
            }
            return;
        }


        // -----------------------------------------------------
        // YouTube 채팅 입력 컴포넌트 찾기
        // -----------------------------------------------------

        const inputRenderer =
            input.closest(
                'yt-live-chat-text-input-field-renderer'
            );

        const messageInputRenderer =
            input.closest(
                'yt-live-chat-message-input-renderer'
            );

        let host =
            messageInputRenderer ||
            inputRenderer ||
            input.parentElement;

        if (!host) {
            return;
        }

        if (
            host.querySelector(
                '#__auction_guide_panel'
            )
        ) {
            return;
        }


        // =====================================================
        // 안내 패널
        // =====================================================

        const panel =
            createElement(
                'div',
                {
                    id:
                        '__auction_guide_panel',

                    style: `
                        width:100% !important;

                        box-sizing:border-box
                            !important;

                        padding:
                            7px 0 6px 0
                            !important;

                        margin:
                            0 0 3px 0
                            !important;

                        display:flex !important;

                        flex-direction:column !important;

                        gap:5px !important;

                        background:
                            transparent !important;

                        font-family:
                            -apple-system,
                            BlinkMacSystemFont,
                            "Segoe UI",
                            Roboto,
                            Arial,
                            sans-serif
                            !important;
                    `
                }
            );


        // =====================================================
        // 버튼 구성:
        // 0행: 낙찰 내역 관리 버튼 (full-width, 고정) [미사용 주석 처리됨]
        // 1행: 메인 상시 노출 (📐 규격입력, 💰 가격입력, 📁 정사각형 토글 버튼)
        // 펼침 영역: 8종 안내 버튼 (클릭 시 자동 닫힘)
        // =====================================================

        /*
        // 0행: 낙찰 내역 버튼 (full-width, 고정) - 미사용 주석 처리
        const bidListBtn = createElement(
            'button',
            {
                id: '__auction_bid_list_btn',
                type: 'button',
                style: `
                    width:100% !important;
                    height:30px !important;
                    padding:0 10px !important;
                    box-sizing:border-box !important;
                    border:1px solid rgba(255,204,0,.28) !important;
                    border-radius:8px !important;
                    background:rgba(255,204,0,.09) !important;
                    color:#e8c56d !important;
                    cursor:pointer !important;
                    font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                    font-size:11px !important;
                    font-weight:700 !important;
                    line-height:30px !important;
                    white-space:nowrap !important;
                    overflow:hidden !important;
                    text-overflow:ellipsis !important;
                    transition:background .15s ease, border-color .15s ease, color .15s ease !important;
                `
            }
        );
        const initCount = getTodayBidRecords().length;
        bidListBtn.textContent = `📋 낙찰 내역 (${initCount}건)`;

        bidListBtn.addEventListener('mouseenter', () => {
            bidListBtn.style.background = 'rgba(255,204,0,.18)';
            bidListBtn.style.borderColor = 'rgba(255,204,0,.45)';
            bidListBtn.style.color = '#f5dc94';
        });
        bidListBtn.addEventListener('mouseleave', () => {
            bidListBtn.style.background = 'rgba(255,204,0,.09)';
            bidListBtn.style.borderColor = 'rgba(255,204,0,.28)';
            bidListBtn.style.color = '#e8c56d';
        });
        bidListBtn.addEventListener('mousedown', () => {
            bidListBtn.style.transform = 'scale(.98)';
        });
        bidListBtn.addEventListener('mouseup', () => {
            bidListBtn.style.transform = 'scale(1)';
        });

        const handleBidListBtnClick = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            openBidListModal();
        };

        bidListBtn.addEventListener('click', handleBidListBtnClick);
        panel.appendChild(bidListBtn);
        */


        // 1행: 메인 상시 노출 버튼 (📐 규격입력, 💰 가격입력, 📁 정사각형 토글)
        const row1 = createElement('div', {
            style: `
                width:100% !important;
                display:flex !important;
                align-items:center !important;
                gap:5px !important;
            `
        });

        row1.appendChild(
            createGuideButton('📐 규격입력', null, () => openSpecModal())
        );

        row1.appendChild(
            createGuideButton('💰 가격입력', null, () => openPriceChoiceModal())
        );

        // 기타 안내 접기/펼치기 컨테이너 사전 생성
        const moreContainer = createElement('div', {
            id: '__auction_more_container',
            style: `
                width:100% !important;
                display:${_isMorePanelOpen ? 'flex' : 'none'} !important;
                flex-wrap:wrap !important;
                gap:5px !important;
                padding-top:2px !important;
            `
        });

        // 기타 영역 내 8종 안내 버튼 (클릭 시 메시지 주입 + 자동으로 기타 닫힘)
        const moreButtons = [
            { label: '👤 회원등록', msg: GUIDE_MESSAGES.member },
            { label: '🚫 낙찰 취소', msg: GUIDE_MESSAGES.cancel },
            { label: '🔨 입찰 안내', msg: GUIDE_MESSAGES.bid },
            { label: '📦 택배', msg: GUIDE_MESSAGES.delivery },
            { label: '🏠 경매장', msg: GUIDE_MESSAGES.place },
            { label: '💬 채팅 안내', msg: GUIDE_MESSAGES.chat },
            { label: '❤️ 응원문구', msg: GUIDE_MESSAGES.support },
            { label: '💰 호가 안내', msg: GUIDE_MESSAGES.price }
        ];

        moreButtons.forEach(b => {
            const btn = createGuideButton(b.label, b.msg, null, true);
            btn.style.flex = '1 1 calc(25% - 4px)';
            moreContainer.appendChild(btn);
        });

        // 📁 정사각형 토글 버튼 (텍스트 없이 아이콘만)
        const moreBtn = createGuideButton(
            '📁',
            null,
            () => {
                _isMorePanelOpen = !_isMorePanelOpen;
                if (moreContainer) {
                    moreContainer.style.display = _isMorePanelOpen ? 'flex' : 'none';
                }
                moreBtn.title = _isMorePanelOpen ? '기타 안내 문구 닫기' : '기타 안내 문구 열기';
                moreBtn.style.background = _isMorePanelOpen ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)';
                moreBtn.style.borderColor = _isMorePanelOpen ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.16)';
            }
        );
        moreBtn.id = '__auction_more_toggle_btn';
        moreBtn.title = '기타 안내 문구 열기';
        // 정사각형 모양 스타일 강제 지정
        moreBtn.style.flex = '0 0 32px';
        moreBtn.style.width = '32px';
        moreBtn.style.minWidth = '32px';
        moreBtn.style.maxWidth = '32px';
        moreBtn.style.height = '32px';
        moreBtn.style.padding = '0';
        moreBtn.style.fontSize = '14px';
        moreBtn.style.display = 'flex';
        moreBtn.style.alignItems = 'center';
        moreBtn.style.justifyContent = 'center';

        row1.appendChild(moreBtn);
        panel.appendChild(row1);
        panel.appendChild(moreContainer);


        // =====================================================
        // 삽입 위치
        // =====================================================

        if (
            messageInputRenderer
        ) {
            const children =
                Array.from(
                    messageInputRenderer.children
                );

            const firstChild =
                children[0];

            if (firstChild) {
                messageInputRenderer.insertBefore(
                    panel,
                    firstChild
                );
            } else {
                messageInputRenderer.appendChild(
                    panel
                );
            }

        } else if (
            inputRenderer
        ) {
            inputRenderer.parentElement.insertBefore(
                panel,
                inputRenderer
            );

        } else {
            host.parentElement.insertBefore(
                panel,
                host
            );
        }

        console.log(
            PREFIX,
            '안내 버튼 영역 생성 완료'
        );
    }


    // =========================================================
    // 밑줄 버튼
    // =========================================================

    function createSeparatorButton() {

        const input =
            findChatInput();

        if (!input) {
            return;
        }

        const targetDoc =
            input.ownerDocument ||
            document;

        const existingSeparators =
            targetDoc.querySelectorAll(
                '#__auction_separator_button'
            );

        if (existingSeparators.length > 0) {
            for (let i = 1; i < existingSeparators.length; i++) {
                existingSeparators[i].remove();
            }
            return;
        }

        const parent =
            input.parentElement;

        if (!parent) {
            return;
        }

        if (
            parent.querySelector(
                '#__auction_separator_button'
            )
        ) {
            return;
        }


        const button =
            createElement(
                'button',
                {
                    id:
                        '__auction_separator_button',

                    type:
                        'button',

                    text:
                        '밑줄',

                    style: `
                        flex-shrink:0 !important;

                        width:58px !important;

                        min-width:58px !important;

                        height:32px !important;

                        padding:
                            0 !important;

                        margin:
                            0 0 0 6px !important;

                        box-sizing:
                            border-box !important;

                        border:
                            1px solid
                            rgba(220,80,80,.30)
                            !important;

                        border-radius:
                            8px !important;

                        background:
                            rgba(190,60,60,.14)
                            !important;

                        color:
                            #f08a8a
                            !important;

                        cursor:
                            pointer !important;

                        font-family:
                            -apple-system,
                            BlinkMacSystemFont,
                            "Segoe UI",
                            Roboto,
                            Arial,
                            sans-serif
                            !important;

                        font-size:
                            11px !important;

                        font-weight:
                            700 !important;

                        line-height:
                            32px !important;

                        text-align:
                            center !important;

                        white-space:
                            nowrap !important;

                        transition:
                            background .15s ease,
                            border-color .15s ease,
                            color .15s ease,
                            transform .08s ease
                            !important;
                    `
                }
            );


        button.addEventListener(
            'mouseenter',
            function () {
                button.style.background =
                    'rgba(190,60,60,.25)';

                button.style.borderColor =
                    'rgba(220,80,80,.45)';

                button.style.color =
                    '#ffb0b0';
            }
        );

        button.addEventListener(
            'mouseleave',
            function () {
                button.style.background =
                    'rgba(190,60,60,.14)';

                button.style.borderColor =
                    'rgba(220,80,80,.30)';

                button.style.color =
                    '#f08a8a';
            }
        );

        button.addEventListener(
            'mousedown',
            function () {
                button.style.transform =
                    'scale(.97)';
            }
        );

        button.addEventListener(
            'mouseup',
            function () {
                button.style.transform =
                    'scale(1)';
            }
        );

        button.addEventListener(
            'click',
            function (event) {
                event.preventDefault();
                event.stopPropagation();

                const currentInput =
                    findChatInput();

                if (!currentInput) {
                    console.warn(
                        PREFIX,
                        '채팅 입력창을 찾지 못했습니다.'
                    );
                    return;
                }

                setChatInput(
                    currentInput,
                    EXACT_AUCTION_SEPARATOR
                );

                currentInput.focus();

                console.log(
                    PREFIX,
                    '구분선 입력 완료 (채팅 전송 대기)'
                );
            }
        );


        // -----------------------------------------------------
        // 입력창 부모의 flex를 건드리지 않도록 최소한만 수정
        // -----------------------------------------------------

        const computed =
            window.getComputedStyle(
                parent
            );

        if (
            computed.display ===
            'flex'
        ) {
            input.style.flex =
                '1 1 auto';

            input.style.minWidth =
                '0';

        } else {
            parent.style.display =
                'flex';

            parent.style.alignItems =
                'center';

            input.style.flex =
                '1 1 auto';

            input.style.minWidth =
                '0';
        }

        parent.appendChild(
            button
        );

        console.log(
            PREFIX,
            '밑줄 버튼 생성 완료'
        );
    }


    // =========================================================
    // UI 전체 생성
    // =========================================================

    function createAllUI() {

        // 플로팅 낙찰내역 버튼 동기화 (미사용 주석 처리)
        /*
        try {
            updateFloatingBidButton();
        } catch (e) {}
        */

        const input =
            findChatInput();

        if (!input) {
            return;
        }

        const targetDoc =
            input.ownerDocument ||
            document;

        // 중복 요소 청소
        const existingPanels =
            targetDoc.querySelectorAll(
                '#__auction_guide_panel'
            );

        if (existingPanels.length > 1) {
            for (let i = 1; i < existingPanels.length; i++) {
                existingPanels[i].remove();
            }
        }

        const existingSeparators =
            targetDoc.querySelectorAll(
                '#__auction_separator_button'
            );

        if (existingSeparators.length > 1) {
            for (let i = 1; i < existingSeparators.length; i++) {
                existingSeparators[i].remove();
            }
        }

        const guidePanel =
            targetDoc.getElementById(
                '__auction_guide_panel'
            );

        const separatorButton =
            targetDoc.getElementById(
                '__auction_separator_button'
            );

        if (
            guidePanel &&
            separatorButton
        ) {
            return;
        }

        if (!guidePanel) {
            createGuidePanel();
        }

        if (!separatorButton) {
            createSeparatorButton();
        }
    }


    // =========================================================
    // 실시간 채팅 감시 (새 밑줄 채팅 자동 감지)
    // =========================================================

    const _activeChatObservers = new WeakMap();

    function setupChatObserver() {
        const docs = getTargetDocs();

        docs.forEach(doc => {
            if (!doc) return;

            // 채팅 아이템 컨테이너 탐색
            const itemContainers = doc.querySelectorAll(
                '#items.yt-live-chat-item-list-renderer, ' +
                'yt-live-chat-item-list-renderer #items, ' +
                '#chat-messages'
            );

            itemContainers.forEach(container => {
                if (!container || _activeChatObservers.has(container)) {
                    return;
                }

                const observer = new MutationObserver(mutations => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (!node || node.nodeType !== Node.ELEMENT_NODE) {
                                return;
                            }

                            let chatItem = null;
                            if (
                                typeof node.matches === 'function' &&
                                node.matches(
                                    'yt-live-chat-text-message-renderer, ' +
                                    'yt-live-chat-paid-message-renderer, ' +
                                    'yt-live-chat-membership-item-renderer'
                                )
                            ) {
                                chatItem = node;
                            } else if (typeof node.querySelector === 'function') {
                                chatItem = node.querySelector(
                                    'yt-live-chat-text-message-renderer, ' +
                                    'yt-live-chat-paid-message-renderer, ' +
                                    'yt-live-chat-membership-item-renderer'
                                );
                            }

                            if (chatItem && !chatItem.dataset.auctionProcessed) {
                                const msgEl = chatItem.querySelector('#message');
                                const text = msgEl ? msgEl.textContent.trim() : '';

                                if (text && isSeparatorMessage(text)) {
                                    console.log(PREFIX, isReplayMode() ? '다시보기 밑줄 감지:' : '실시간 새 밑줄 감지:', text);
                                    // DOM이 완전히 업데이트될 시간을 위해 미세 딜레이 후 선별 처리
                                    setTimeout(() => {
                                        processSeparatorElement(chatItem, doc);
                                    }, 80);
                                }
                            }
                        });
                    });
                });

                observer.observe(container, {
                    childList: true,
                    subtree: true
                });

                _activeChatObservers.set(container, observer);
                console.log(PREFIX, '실시간 채팅 감시 옵저버 부착 완료');

                // 다시보기 환경: 이미 DOM에 렌더링되어 있던 미처리 밑줄 메시지 초기 선별 및 하이라이트
                if (isReplayMode()) {
                    try {
                        const existingItems = container.querySelectorAll(
                            'yt-live-chat-text-message-renderer, ' +
                            'yt-live-chat-paid-message-renderer, ' +
                            'yt-live-chat-membership-item-renderer'
                        );
                        existingItems.forEach(item => {
                            if (item && !item.dataset.auctionProcessed) {
                                const msgEl = item.querySelector('#message');
                                const text = msgEl ? msgEl.textContent.trim() : '';
                                if (text && isSeparatorMessage(text)) {
                                    processSeparatorElement(item, doc);
                                }
                            }
                        });
                    } catch (e) {}
                }
            });
        });
    }


    // =========================================================
    // UI 감시 (쓰로틀링/디바운스 적용)
    // =========================================================

    function startUIObserver() {

        createAllUI();
        setupChatObserver();

        let debounceTimer = null;

        const observer =
            new MutationObserver(
                function () {

                    const input =
                        findChatInput();

                    const targetDoc =
                        input
                            ? (input.ownerDocument || document)
                            : document;

                    if (
                        targetDoc.getElementById(
                            '__auction_guide_panel'
                        ) &&
                        targetDoc.getElementById(
                            '__auction_separator_button'
                        )
                    ) {
                        return;
                    }

                    if (debounceTimer) {
                        clearTimeout(debounceTimer);
                    }

                    debounceTimer =
                        setTimeout(
                            function () {

                                createAllUI();
                                setupChatObserver();

                                debounceTimer = null;

                            },
                            250
                        );
                }
            );


        function startObserve() {

            if (!document.body) {
                return;
            }

            observer.observe(
                document.body,
                {
                    childList:true,
                    subtree:true
                }
            );

            setupChatObserver();
        }


        if (document.body) {
            startObserve();
        } else {
            document.addEventListener(
                'DOMContentLoaded',
                startObserve,
                {
                    once:true
                }
            );
        }


        // -----------------------------------------------------
        // YouTube 채팅 재생성 및 프레임 감지
        // -----------------------------------------------------

        setInterval(
            function () {

                createAllUI();
                setupChatObserver();

                attachChatFrameListener();

            },
            2000
        );
    }


    // =========================================================
    // iframe#chatframe 내부 리스너 부착
    // =========================================================

    function handleGlobalClick(event) {

        // 1) 낙찰 내역 버튼 클릭 위임 (미사용 주석 처리)
        /*
        try {
            if (event.target && typeof event.target.closest === 'function') {
                const btn = event.target.closest('#__auction_bid_list_btn, #__auction_floating_bid_btn');
                if (btn) {
                    event.preventDefault();
                    event.stopPropagation();
                    openBidListModal();
                    return;
                }
            }
        } catch (e) {}
        */

        // 2) 채팅 클릭 (채팅 닉네임/금액 감지 -> 다이렉트 입력 또는 모달 팝업)
        handleChatMessageClick(event);
    }


    function attachChatFrameListener() {

        try {

            const iframe =
                document.querySelector(
                    'iframe#chatframe'
                );

            if (
                iframe &&
                iframe.contentDocument
            ) {

                iframe.contentDocument.removeEventListener(
                    'click',
                    handleGlobalClick,
                    true
                );

                iframe.contentDocument.addEventListener(
                    'click',
                    handleGlobalClick,
                    true
                );

                setupChatObserver();
            }

        } catch (e) {
            // cross-origin 보호 환경일 경우 무시
        }
    }


    // =========================================================
    // 시작
    // =========================================================

    function boot() {

        document.addEventListener(
            'click',
            handleGlobalClick,
            true
        );

        window.addEventListener(
            'click',
            handleGlobalClick,
            true
        );

        // 부모-iframe 간 실시간 동기화 리스너
        window.addEventListener('storage', (e) => {
            if (e.key === BID_STORAGE_KEY || e.key === '__auction_active_video_id') {
                updateBidBadge();
            }
        });

        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === '__AUCTION_BID_UPDATED') {
                updateBidBadge();
            }
        });

        // 유튜브 SPA 페이지 이동 이벤트
        window.addEventListener('yt-navigate-finish', () => {
            getCurrentVideoId();
            createAllUI();
            updateFloatingBidButton();
            setupChatObserver();
            updateBidBadge();
        });
        window.addEventListener('popstate', () => {
            getCurrentVideoId();
            createAllUI();
            updateFloatingBidButton();
            setupChatObserver();
            updateBidBadge();
        });

        attachChatFrameListener();

        startUIObserver();
        setupChatObserver();
        updateBidBadge();

        console.log(
            PREFIX,
            '준비 완료 (채팅 좌클릭 및 밑줄 자동 선별 대기 중)'
        );
    }


    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            boot,
            {
                once:true
            }
        );

    } else {

        boot();
    }

})();