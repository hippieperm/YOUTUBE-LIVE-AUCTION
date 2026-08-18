// ==UserScript==
// @name         YouTube Live 낙찰 자동화
// @namespace    https://youtube.com/
// @version      2.4
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
            if (pop && pop !== 'live_chat' && pop !== 'live_chat_replay' && pop !== 'watch') {
                try { localStorage.setItem(ACTIVE_VIDEO_ID_KEY, pop); } catch (e) {}
                return pop;
            }

            // 7) 🛑 iframe 내부에서 부모 창이 저장해 둔 활성 Video ID 동기화 (다시보기 완벽 연동)
            try {
                const cachedVid = localStorage.getItem(ACTIVE_VIDEO_ID_KEY);
                if (cachedVid && cachedVid !== 'unknown' && cachedVid !== 'live_chat' && cachedVid !== 'live_chat_replay') {
                    return cachedVid;
                }
            } catch (e) {}

            return 'unknown';
        } catch (e) {
            try {
                const fallbackVid = localStorage.getItem(ACTIVE_VIDEO_ID_KEY);
                if (fallbackVid && fallbackVid !== 'unknown') return fallbackVid;
            } catch (err) {}
            return 'unknown';
        }
    }


    /** 다시보기 (YouTube Live Replay / VOD) 환경 여부 판별 */
    function isReplayMode() {
        try {
            // 1) 현재 창 URL 확인
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

            // 5) 다시보기 전용 DOM 요소 확인
            const checkDom = (doc) => {
                try {
                    if (doc.querySelector('yt-live-chat-replay-header-renderer')) return true;
                    if (doc.querySelector('yt-live-chat-renderer[replay]')) return true;
                    if (doc.querySelector('ytd-live-chat-frame[is-replay]')) return true;
                    if (doc.querySelector('#chat[replay]')) return true;
                } catch (e) {}
                return false;
            };
            if (checkDom(document)) return true;
            try {
                if (window.top && checkDom(window.top.document)) return true;
            } catch (e) {}

            // 6) YouTube 플레이어(movie_player) API를 통한 라이브 여부 확인
            const getPlayer = (w) => {
                try { return w.document.getElementById('movie_player'); } catch (e) { return null; }
            };
            const player = getPlayer(window) ||
                (window.top && window.top !== window && getPlayer(window.top)) ||
                (window.parent && window.parent !== window && getPlayer(window.parent));
            if (player && typeof player.getVideoData === 'function') {
                const data = player.getVideoData();
                if (data && typeof data.isLive === 'boolean' && data.isLive === false) {
                    const host = window.location.hostname || '';
                    if (host.includes('youtube.com')) {
                        return true;
                    }
                }
            }
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
     * 낙찰 1건 기록 추가 또는 동일 경매 블록 내 기존 기록 1건으로 갱신(대체)
     * @param {string} nickname - 낙찰자 닉네임
     * @param {string} price    - 낙찰가 (만원 단위 문자열, 예: "15", "1.5")
     * @param {string} [originalChat] - 원문 채팅 (자동감지 시)
     * @param {string} message  - 전송된 낙찰 메시지
     * @param {string} [blockKey] - 경매 블록 키 (예: "round_1", "round_2")
     */
    function addBidRecord(nickname, price, originalChat, message, blockKey = null) {

        // 🛑 다시보기 환경: 낙찰자 추가 및 수정 완전 차단
        if (isReplayMode()) {
            console.log(PREFIX, '🛑 다시보기 환경: 낙찰자 추가/수정이 차단되었습니다.');
            return;
        }

        const records = loadBidRecords();
        const currentVideoId = getCurrentVideoId();

        const now = new Date();
        const realTimeStr =
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');
        const videoTimeStr = getCurrentVideoTime();

        const newRecord = {
            id:          Date.now(),
            blockKey:    blockKey || null,
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

        // 🛑 동일 경매 블록(동일 회차 blockKey)의 기존 기록이 있는지 확인하여 교체(덮어쓰기)
        let replaced = false;
        if (blockKey) {
            for (let i = records.length - 1; i >= 0; i--) {
                const r = records[i];
                if (r && r.blockKey === blockKey && (r.videoId === currentVideoId || r.date === getTodayString())) {
                    records[i] = {
                        ...r,
                        ...newRecord,
                        id: r.id // 고유 ID 유지
                    };
                    replaced = true;
                    console.log(PREFIX, `🔁 [경매 ${blockKey}] 낙찰 기록 교체 완료:`, nickname, price + '만');
                    break;
                }
            }
        }

        if (!replaced) {
            records.push(newRecord);
            console.log(PREFIX, `✅ [경매 ${blockKey || '신규'}] 낙찰 기록 저장:`, nickname, price + '만 (영상시간: ' + (videoTimeStr || realTimeStr) + ')');
        }

        saveBidRecords(records);
        updateBidBadge();
    }


    /** 현재 방송/영상 기록 필터링 (현재 영상 videoId 또는 당일 기준 필터링) */
    function getTodayBidRecords() {

        const videoId = getCurrentVideoId();
        const records = loadBidRecords();
        const today = getTodayString();

        return records.filter(r => {
            if (!r) return false;
            // 1) 현재 방송/다시보기의 videoId가 명확히 확인된 경우
            if (
                videoId && videoId !== 'unknown' && videoId !== 'live_chat' && videoId !== 'live_chat_replay'
            ) {
                // 해당 영상의 videoId와 일치하거나, 당일 기록 중 videoId가 누락/unknown인 레코드도 유연하게 허용
                return r.videoId === videoId || (!r.videoId || r.videoId === 'unknown' ? r.date === today : false);
            }
            // 2) videoId를 특정하기 어려운 환경(로컬 테스트 파일, 시뮬레이터 등)인 경우:
            // 당일(오늘) 날짜의 기록 반환
            if (r.date === today) {
                return true;
            }
            // 3) Fallback: unknown/live_chat 계열 기록 반환
            return !r.videoId || r.videoId === 'unknown' || r.videoId === 'live_chat' || r.videoId === 'live_chat_replay';
        });
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

        // 1) author-type 속성 확인 (YouTube 표준: "owner", "moderator")
        const authorType = (el.getAttribute('author-type') || '').toLowerCase();
        if (authorType === 'owner' || authorType === 'moderator') return true;

        // 2) message renderer 내부 author-chip 확인
        const authorChip = el.closest('yt-live-chat-author-chip') || el.querySelector('yt-live-chat-author-chip');
        if (authorChip) {
            const chipType = (authorChip.getAttribute('type') || '').toLowerCase();
            if (chipType === 'owner' || chipType === 'moderator') return true;
            if (authorChip.querySelector('[type="owner"], [type="moderator"], .host-badge')) return true;
        }

        // 3) 배지 렌더러 확인 (YouTube 표준 뱃지)
        if (el.querySelector('yt-live-chat-author-badge-renderer[type="owner"], yt-live-chat-author-badge-renderer[type="moderator"], .host-badge')) {
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
    // 스마트 금액 파싱 (입찰 채팅에서 만원 단위 추출)
    // - 첫 번째 등장하는 숫자/단위를 우선 추출하여 자동 낙찰 지원
    // - .5, .3 등 소수점 시작 형태 지원 (.5 ➔ 0.5만원 = 5천원)
    // - 3,5, 15,5, ,5 등 쉼표 소수점 형태 지원 (3,5 ➔ 3.5만원)
    // - 15만, 15.5만, 15만 5천, 150000, 150,000, 5000, 3천, 3천원, 20 등 자동 변환
    // - 문장형 채팅(예: '15만 부탁드립니다', '3천으로', '15.5 갑니다') 지원
    // =========================================================

    function parseBidPrice(text) {

        if (
            !text ||
            typeof text !== 'string'
        ) {
            return null;
        }

        let clean =
            text.trim();

        // 0-1. ",5", ",3", ",5만" 등 쉼표로 바로 시작하는 소수점 형태 -> 0.5, 0.3 (0.5만원 = 5천원)
        clean =
            clean
                .replace(/(?:^|[^\d])\,(\d+)/g, ' 0.$1');

        // 0-2. ".5", ".3", ".5만" 등 점으로 바로 시작하는 소수점 형태 -> 0.5, 0.3 (0.5만원 = 5천원)
        clean =
            clean
                .replace(/(?:^|[^\d])\.(\d+)/g, ' 0.$1');

        // 0-3. "3,5", "15,5", "3,25", "3, 5" 등 쉼표 뒤 1~2자리 숫자가 오는 소수점 쉼표 -> "3.5", "15.5"
        clean =
            clean
                .replace(/(\d+)\s*,\s*(\d{1,2})(?!\d)/g, '$1.$2');

        // 0-4. "150,000", "15,000", "1,000,000" 등 3자리 단위 구분 쉼표 -> 쉼표 제거 ("150000", "15000")
        clean =
            clean
                .replace(/(\d+)\s*,\s*(\d{3})/g, '$1$2');

        // 0-5. 기타 남아있는 쉼표 제거
        clean =
            clean
                .replace(/,/g, '');

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

                return normalizePrice(man + sub);
            } else if (
                unit === '백' ||
                unit === '00'
            ) {
                if (sub >= 100) {
                    sub = sub / 10000;
                } else if (sub < 10) {
                    sub = sub / 100;
                }

                return normalizePrice(man + sub);
            } else if (sub > 0 && sub < 10000) {
                return normalizePrice(man + (sub / 10000));
            }
        }

        // 2. "15만", "15만원", "15.5만", "0.5만", ".5만", "15만으로"
        const manMatch =
            clean.match(
                /(\d+(?:\.\d+)?)\s*만/
            );

        if (manMatch) {
            return normalizePrice(manMatch[1]);
        }

        // 3. "5천", "5천원", "3천", "3천원", "3천으로", "3.5천"
        const chonMatch =
            clean.match(
                /(\d+(?:\.\d+)?)\s*천/
            );

        if (chonMatch) {
            const chon =
                parseFloat(chonMatch[1]);

            return normalizePrice(chon / 10);
        }

        // 4. 원 단위 숫자가 명시된 경우 (예: "150000원", "150,000원", "15000원", "5000원", "3000원")
        const wonMatch =
            clean.match(
                /(\d{3,9})\s*원/
            );

        if (wonMatch) {
            const num =
                parseFloat(wonMatch[1]);

            return normalizePrice(num / 10000);
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

                return normalizePrice(num / 10000);
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

            return normalizePrice(num / 10000);
        }

        // 7. 천 단위 4자리 숫자 (예: "5000", "3000", "3500", "7500" -> 0.5, 0.3, 0.35, 0.75)
        const fourDigitChonMatch =
            clean.match(
                /(?:^|[^\d.])([1-9]\d{3})(?:[^\d.]|$)/
            );

        if (fourDigitChonMatch) {
            const num =
                parseFloat(fourDigitChonMatch[1]);

            return normalizePrice(num / 10000);
        }

        // 8. 일반 숫자 (예: "15", "20", "15.5", "3.5", "0.5", "2", "35", "100")
        const numMatch =
            clean.match(
                /(\d+(?:\.\d+)?)/
            );

        if (numMatch) {
            return normalizePrice(numMatch[1]);
        }

        return null;
    }


    // =========================================================
    // 밑줄(구분선) 메시지 감지
    // - 정확히 "===================" (등호 19개) 일치할 때만 기준 밑줄로 인정
    // =========================================================

    const EXACT_AUCTION_SEPARATOR = '===================';

    function isSeparatorMessage(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        const clean = text.trim();
        return clean === EXACT_AUCTION_SEPARATOR;
    }


    // =========================================================
    // 밑줄 위 최고가 입찰자 자동 선별 (동일가 선착순 우선)
    // =========================================================

    function findTopBidAboveSeparator(separatorEl = null, targetDoc = null) {
        const doc = targetDoc || (separatorEl && separatorEl.ownerDocument) || document;

        // 채팅 메시지 엘리먼트 목록 수집
        const chatItems = Array.from(
            doc.querySelectorAll(
                'yt-live-chat-text-message-renderer, ' +
                'yt-live-chat-paid-message-renderer, ' +
                'yt-live-chat-membership-item-renderer'
            )
        );

        if (!chatItems.length) {
            return null;
        }

        let targetItems = [];

        if (separatorEl) {
            const sepIndex = chatItems.indexOf(separatorEl);
            if (sepIndex <= 0) {
                return null;
            }

            // separatorEl 이전(위쪽) 메시지들 탐색
            // 이전 밑줄(직전 경매의 밑줄)이 있는지 확인하여 직전 밑줄 이후부터만 슬라이스
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
            return null;
        }

        // 각 메시지에서 작성자와 입찰가 파싱
        const validBids = [];

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

            const parsedPrice = parseBidPrice(chatText);
            if (parsedPrice) {
                const numPrice = parseFloat(parsedPrice);
                if (Number.isFinite(numPrice) && numPrice > 0) {
                    validBids.push({
                        element: item,
                        nickname: nickname,
                        price: numPrice,
                        priceStr: parsedPrice,
                        originalChat: chatText,
                        index: index // DOM 순서 (먼저 올라온 채팅이 낮은 index = 선착순 1위)
                    });
                }
            }
        });

        if (!validBids.length) {
            return null;
        }

        // 최고가 탐색
        let maxPrice = -Infinity;
        validBids.forEach(b => {
            if (b.price > maxPrice) {
                maxPrice = b.price;
            }
        });

        // 최고가 입찰자들 필터링
        const topBids = validBids.filter(b => b.price === maxPrice);

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
        // 🛑 다시보기 환경: 밑줄 감지로 인한 낙찰자 자동 추가/수정 완전 차단
        if (isReplayMode()) {
            return;
        }

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

        removeAuctionUI();

        const message = createMessage(winner.nickname, winner.priceStr);
        const input = findChatInput();

        if (input) {
            setChatInput(input, message);
            input.focus();
            console.log(PREFIX, '인풋창 자동 입력 완료:', message);
        } else {
            console.log(PREFIX, '채팅 입력창 없음 (다시보기 환경/입력창 숨김): 낙찰 기록 및 하이라이트 진행');
        }

        // 낙찰 내역 기록 (실시간/다시보기 무관하게 항상 100% 저장)
        const blockKey = getAuctionBlockKey(winner.element || separatorEl, targetDoc || (separatorEl && separatorEl.ownerDocument) || document);
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
    // 플로팅 낙찰 내역 버튼 (방송 종료 후 / 채팅창 숨김 시에도 언제든 접근 가능)
    // =========================================================

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


    // =========================================================
    // 낙찰 내역 모달 (현재 방송 전용)
    // =========================================================

    function openBidListModal() {

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

            // 정렬 상태 관리
            const SORT_STORAGE_KEY = '__auction_bid_sort';
            let currentSort = 'newest';
            try {
                currentSort = localStorage.getItem(SORT_STORAGE_KEY) || 'newest';
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
                        // 🛑 다시보기 환경: 실수로 인한 삭제 방지 확인 가드
                        if (isReplayMode()) {
                            const nick = record.nickname ? `@${record.nickname}` : '해당';
                            const priceStr = record.price ? ` (${record.price}만)` : '';
                            if (!confirm(`[다시보기] ${nick}${priceStr} 낙찰 내역을 정말 삭제하시겠습니까?`)) {
                                return;
                            }
                        }

                        const all = loadBidRecords();
                        const updated = all.filter(r => r && r.id !== record.id);
                        saveBidRecords(updated);
                        updateBidBadge();
                        updateStats();
                        renderBidList();
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

    // 외부 디버깅용 전역 바인딩
    window.__openAuctionBidListModal = openBidListModal;
    try {
        if (window.top && window.top !== window) {
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
                ? parseBidPrice(lastChatMessage)
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


            // ✅ 낙찰 내역 기록 (실시간/다시보기 무관하게 항상 100% 저장)
            const blockKey = getAuctionBlockKey(targetChatItem, document);
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

        // 🛑 다시보기 환경: 채팅 클릭을 통한 낙찰자 추가/수정 완전 차단
        if (isReplayMode()) {
            return;
        }

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


        const parsedPrice =
            parseBidPrice(lastChatMessage);


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

            const chatItem = findChatMessageItem(event.target);
            const blockKey = getAuctionBlockKey(chatItem, event.target.ownerDocument || document);

            // ✅ 낙찰 내역 기록 (실시간/다시보기 무관하게 항상 100% 저장)
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

            const chatItem = findChatMessageItem(event.target);
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
        // 0행: 낙찰 내역 관리 버튼 (full-width, 고정)
        // 1행: 메인 상시 노출 (📐 규격입력, 💰 가격입력, 📁 정사각형 토글 버튼)
        // 펼침 영역: 8종 안내 버튼 (클릭 시 자동 닫힘)
        // =====================================================

        // 0행: 낙찰 내역 버튼 (full-width, 고정)
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

        // 플로팅 낙찰내역 버튼 동기화 (스트리밍 종료 후에도 낙찰 내역 항시 접근 가능)
        try {
            updateFloatingBidButton();
        } catch (e) {}

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
            separatorButton &&
            targetDoc.getElementById('__auction_bid_list_btn')
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
                                    if (isReplayMode()) {
                                        chatItem.dataset.auctionProcessed = 'true';
                                        return;
                                    }
                                    console.log(PREFIX, '실시간 새 밑줄 감지:', text);
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
                        ) &&
                        targetDoc.getElementById(
                            '__auction_bid_list_btn'
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

        // 1) 낙찰 내역 버튼 클릭 위임 (수식키 무관)
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
