// ==UserScript==
// @name         YouTube Live 낙찰 자동화
// @namespace    https://youtube.com/
// @version      2.0
// @description  YouTube Live 낙찰 자동화 + 스마트 입찰 금액 추출 + 정사각형 가상 키패드 + 실시간 플로팅 토스트 알림 + 안내 버튼 + 밑줄 버튼 + 낙찰 내역 관리 & CSV 다운로드
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube.com/live_chat*
// @match        https://www.youtube.com/live_chat_replay*
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

    /** 현재 방송의 YouTube Video ID 추출 */
    function getCurrentVideoId() {

        try {
            // 1) ytcfg 글로벌 객체 확인 (YouTube 페이지 내부 환경)
            try {
                if (typeof window.ytcfg !== 'undefined' && typeof window.ytcfg.get === 'function') {
                    const v = window.ytcfg.get('VIDEO_ID');
                    if (v && v !== 'live_chat' && v !== 'live_chat_replay' && v !== 'unknown') return v;
                }
            } catch (e) {}

            // 2) 현재 window URL 파라미터 확인
            const url = new URL(window.location.href);
            const v = url.searchParams.get('v');
            if (v && v !== 'live_chat' && v !== 'live_chat_replay') return v;

            if (url.pathname.startsWith('/live/')) {
                const parts = url.pathname.split('/').filter(Boolean);
                if (parts[1] && parts[1] !== 'live_chat') return parts[1];
            }

            // 3) 부모 창(parent/top) URL 확인 (iframe 내부 환경 대응)
            try {
                if (window.top && window.top !== window && window.top.location.href) {
                    const topUrl = new URL(window.top.location.href);
                    const tv = topUrl.searchParams.get('v');
                    if (tv) return tv;
                    if (topUrl.pathname.startsWith('/live/')) {
                        const tparts = topUrl.pathname.split('/').filter(Boolean);
                        if (tparts[1] && tparts[1] !== 'live_chat') return tparts[1];
                    }
                }
            } catch (e) {}

            try {
                if (window.parent && window.parent !== window && window.parent.location.href) {
                    const parentUrl = new URL(window.parent.location.href);
                    const pv = parentUrl.searchParams.get('v');
                    if (pv) return pv;
                    if (parentUrl.pathname.startsWith('/live/')) {
                        const pparts = parentUrl.pathname.split('/').filter(Boolean);
                        if (pparts[1] && pparts[1] !== 'live_chat') return pparts[1];
                    }
                }
            } catch (e) {}

            // 4) document.referrer 확인
            if (document.referrer) {
                try {
                    const refUrl = new URL(document.referrer);
                    const rv = refUrl.searchParams.get('v');
                    if (rv && rv !== 'live_chat') return rv;
                    if (refUrl.pathname.startsWith('/live/')) {
                        const rparts = refUrl.pathname.split('/').filter(Boolean);
                        if (rparts[1] && rparts[1] !== 'live_chat') return rparts[1];
                    }
                } catch (e) {}
            }

            // 5) DOM의 canonical link 또는 video-id 속성 확인
            const canonical = document.querySelector('link[rel="canonical"]');
            if (canonical && canonical.href) {
                try {
                    const cUrl = new URL(canonical.href);
                    const cv = cUrl.searchParams.get('v');
                    if (cv) return cv;
                } catch (e) {}
            }

            const flexy = document.querySelector('ytd-watch-flexy[video-id]');
            if (flexy) {
                const fv = flexy.getAttribute('video-id');
                if (fv) return fv;
            }

            // 6) watch 또는 live URL의 pathname 마지막 부분
            const pop = url.pathname.split('/').filter(Boolean).pop();
            if (pop && pop !== 'live_chat' && pop !== 'live_chat_replay' && pop !== 'watch') {
                return pop;
            }

            return 'unknown';
        } catch (e) {
            return 'unknown';
        }
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


    /**
     * 낙찰 1건 기록 추가
     * @param {string} nickname - 낙찰자 닉네임
     * @param {string} price    - 낙찰가 (만원 단위 문자열, 예: "15", "1.5")
     * @param {string} [originalChat] - 원문 채팅 (자동감지 시)
     * @param {string} message  - 전송된 낙찰 메시지
     */
    function addBidRecord(nickname, price, originalChat, message) {

        const records = loadBidRecords();

        const now = new Date();
        const timeStr =
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');

        records.push({
            id:          Date.now(),
            date:        getTodayString(),
            time:        timeStr,
            videoId:     getCurrentVideoId(),
            nickname:    nickname,
            price:       price,
            originalChat: originalChat || '',
            message:     message
        });

        saveBidRecords(records);
        updateBidBadge();

        console.log(PREFIX, '낙찰 기록 저장:', nickname, price + '만');
    }


    /** 현재 방송 기록 필터링 (현재 방송 videoId 또는 당일 기준 필터링) */
    function getTodayBidRecords() {

        const videoId = getCurrentVideoId();
        const records = loadBidRecords();
        const today = getTodayString();

        return records.filter(r => {
            if (!r) return false;
            // 1) 현재 방송의 videoId가 명확히 확인된 경우
            if (
                videoId && videoId !== 'unknown' && videoId !== 'live_chat' && videoId !== 'live_chat_replay'
            ) {
                return r.videoId === videoId;
            }
            // 2) videoId를 특정하기 어려운 환경(일부 iframe 환경 등)인 경우:
            // 당일(오늘) 날짜의 기록 중 unknown/live_chat 이거나 videoId가 없는 기록만 반환 (과거 다른 날짜 누적 방지)
            if (r.date === today) {
                return !r.videoId || r.videoId === 'unknown' || r.videoId === 'live_chat' || r.videoId === 'live_chat_replay';
            }
            return false;
        });
    }


    /** 낙찰 배지 업데이트 */
    function updateBidBadge() {

        const count = getTodayBidRecords().length;
        const totalAll = loadBidRecords().length;
        const text = `📋 낙찰 내역 (${count}건)`;

        // 메인 document에서 탐색
        const btn = document.getElementById('__auction_bid_list_btn');
        if (btn) {
            btn.textContent = text;
        }

        // iframe 내부에서도 탐색
        try {
            const iframe = document.querySelector('iframe#chatframe');
            if (iframe && iframe.contentDocument) {
                const iframeBtn = iframe.contentDocument.getElementById('__auction_bid_list_btn');
                if (iframeBtn) {
                    iframeBtn.textContent = text;
                }
            }
        } catch (e) {}

        // 플로팅 버튼 업데이트
        try {
            updateFloatingBidButton();
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
    // 닉네임 추출
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

            text =
                nameEl.innerText ||
                nameEl.textContent ||
                nameEl.getAttribute('aria-label') ||
                '';

        } else if (typeof author === 'string') {
            text = author;
        }

        const nickname =
            text
                .trim()
                .replace(/^@+/, '')
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

        let price =
            String(value)
                .trim()
                .replace(/,/g, '');

        if (!price) {
            return null;
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

        return String(number);
    }


    // =========================================================
    // 스마트 금액 파싱 (입찰 채팅에서 만원 단위 추출)
    // - .5, .3 등 소수점 시작 형태 지원 (.5 ➔ 0.5만원 = 5천원)
    // - 15만, 15.5만, 15만 5천, 150000, 5000, 20 등 자동 변환
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

        // 0. ".5", ".3", ".5만" 등 소수점으로 바로 시작하는 경우 -> 0.5, 0.3 (0.5만원 = 5천원)
        clean =
            clean
                .replace(/,/g, '')
                .replace(/(?:^|[^\d])\.(\d+)/g, ' 0.$1');

        // 1. "15만 5천", "15만5000", "15만 3천원", "15만 5" 등 만+천 복합 단위
        const manChonMatch =
            clean.match(
                /(\d+(?:\.\d+)?)\s*만\s*(\d+(?:\.\d+)?)\s*(천|000|원)?/i
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
            }
        }

        // 2. "15만", "15만원", "15.5만", "0.5만", ".5만"
        const manMatch =
            clean.match(
                /(\d+(?:\.\d+)?)\s*만/
            );

        if (manMatch) {
            return normalizePrice(manMatch[1]);
        }

        // 3. "5천", "5천원", "5000원", "3천"
        const chonMatch =
            clean.match(
                /(\d+(?:\.\d+)?)\s*천\s*원?/
            );

        if (chonMatch) {
            const chon =
                parseFloat(chonMatch[1]);

            return normalizePrice(chon * 0.1);
        }

        // 4. 원 단위 숫자가 명시된 경우 (예: "150000원", "150,000원", "15000원", "5000원")
        const wonMatch =
            clean.match(
                /(\d{4,9})\s*원/
            );

        if (wonMatch) {
            const num =
                parseFloat(wonMatch[1]);

            return normalizePrice(num / 10000);
        }

        // 5. 콤마가 포함되어 있던 원 단위 숫자 (예: "150,000" -> 15)
        if (/,/.test(text)) {
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

        // 6. 단독 큰 숫자 (10,000 이상, 예: 150000, 200000)
        const largeNumMatch =
            clean.match(
                /(?:^|[^\d.])(\d{5,9})(?:[^\d.]|$)/
            );

        if (largeNumMatch) {
            const num =
                parseFloat(largeNumMatch[1]);

            return normalizePrice(num / 10000);
        }

        // 7. 천 단위 4자리 숫자 (예: "5000", "3000" 등 단독으로 쓰인 4자리 천원 단위 -> 0.5, 0.3)
        const fourDigitChonMatch =
            clean.match(
                /(?:^|[^\d.])([1-9]000)(?:[^\d.]|$)/
            );

        if (fourDigitChonMatch) {
            const num =
                parseFloat(fourDigitChonMatch[1]);

            return normalizePrice(num / 10000);
        }

        // 8. 일반 숫자 (예: "15", "20", "15.5", "0.5", "2", "35")
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

        if (options.inputMode) {
            element.inputMode =
                options.inputMode;
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
    // UI 제거
    // =========================================================

    function removeAuctionUI() {

        const modal =
            document.getElementById(
                '__auction_auto_modal'
            );

        const backdrop =
            document.getElementById(
                '__auction_auto_backdrop'
            );

        if (modal) {
            modal.remove();
        }

        if (backdrop) {
            backdrop.remove();
        }
    }


    // =========================================================
    // 낙찰 내역 UI 제거
    // =========================================================

    let _bidListKeydownHandler = null;
    let _lastOpenBidListModalTime = 0;

    function getTargetDocs() {
        const docs = [document];
        const input = findChatInput();
        if (input && input.ownerDocument && !docs.includes(input.ownerDocument)) {
            docs.push(input.ownerDocument);
        }
        try {
            if (window.top && window.top.document && !docs.includes(window.top.document)) {
                docs.push(window.top.document);
            }
        } catch (e) {}
        try {
            if (window.parent && window.parent.document && !docs.includes(window.parent.document)) {
                docs.push(window.parent.document);
            }
        } catch (e) {}
        return docs;
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
                        max-width:calc(100vw - 20px) !important;
                        max-height:calc(100vh - 30px) !important;
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

            // CSV 다운로드
            actionRow.appendChild(makeActionBtn(
                '📥', 'CSV',
                'rgba(80,160,255,.14)', 'rgba(80,160,255,.35)', '#8db8ee',
                () => {
                    const rawRecords = getTodayBidRecords();
                    if (rawRecords.length === 0) {
                        showAuctionToast('저장할 낙찰 내역이 없습니다.', 'auction');
                        return;
                    }
                    const allRecords = sortBidRecords(rawRecords, currentSort);
                    const BOM = '\uFEFF';
                    const csvHeader = '번호,시간,낙찰자,낙찰가(만원),원문채팅,전송문구';
                    const rows = allRecords.map((r, i) =>
                        [
                            i + 1,
                            r.time || '',
                            `"${String(r.nickname || '').replace(/"/g, '""')}"`,
                            r.price || '',
                            `"${String(r.originalChat || '').replace(/"/g, '""')}"`,
                            `"${String(r.message || '').replace(/"/g, '""')}"`
                        ].join(',')
                    );
                    const csv = BOM + csvHeader + '\n' + rows.join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `유튜브경매_낙찰목록_${getTodayString().replace(/-/g, '')}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    showAuctionToast('📥 CSV 다운로드 완료!', 'success');
                }
            ));

            // 클립보드 복사
            actionRow.appendChild(makeActionBtn(
                '📋', '복사',
                'rgba(150,110,230,.14)', 'rgba(150,110,230,.35)', '#c4a5f8',
                () => {
                    const rawRecords = getTodayBidRecords();
                    if (rawRecords.length === 0) {
                        showAuctionToast('복사할 내역이 없습니다.', 'auction');
                        return;
                    }
                    const allRecords = sortBidRecords(rawRecords, currentSort);
                    let sum = 0;
                    allRecords.forEach(r => {
                        const p = parseFloat(r && r.price);
                        if (!isNaN(p)) sum += p;
                    });
                    const sumStr = Number.isInteger(sum) ? String(sum) : sum.toFixed(1).replace(/\.0$/, '');

                    const lines = allRecords.map((r, i) => {
                        const datePrefix = (r.date && r.date !== getTodayString()) ? `${r.date} ` : '';
                        return `${i + 1}. ${datePrefix}${r.time || ''} | @${r.nickname || ''} | ${r.price || ''}만원`;
                    });
                    const text =
                        `[낙찰 내역]\n` +
                        lines.join('\n') +
                        `\n\n총 ${allRecords.length}건 / ${sumStr}만원`;

                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(() => {
                            showAuctionToast('📋 클립보드 복사 완료!', 'success');
                        }).catch(() => {
                            fallbackCopy(text);
                        });
                    } else {
                        fallbackCopy(text);
                    }

                    function fallbackCopy(str) {
                        try {
                            const ta = document.createElement('textarea');
                            ta.value = str;
                            ta.style.position = 'fixed';
                            ta.style.opacity = '0';
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            ta.remove();
                            showAuctionToast('📋 클립보드 복사 완료!', 'success');
                        } catch (e) {
                            showAuctionToast('❌ 복사 실패', 'auction');
                        }
                    }
                }
            ));

            // 현재 방송 내역 전체 삭제
            actionRow.appendChild(makeActionBtn(
                '🗑️', '삭제',
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


            // -- 닉네임 검색 바 --
            let searchQuery = '';

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
                    placeholder: '닉네임 검색...',
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
                    filteredList = rawList.filter(r => {
                        if (!r) return false;
                        const nick = String(r.nickname || '').toLowerCase().replace(/^@/, '');
                        const origChat = String(r.originalChat || '').toLowerCase();
                        return nick.includes(q) || origChat.includes(q);
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


            // -- DOM 삽입 (최상위 창 우선 지원) --

            let targetDoc = document;
            try {
                if (window.top && window.top.document && window.top.document.body) {
                    targetDoc = window.top.document;
                }
            } catch (e) {
                targetDoc = document;
            }

            const mountTarget = targetDoc.body || targetDoc.documentElement || document.body;
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

        // 낙찰 내역 모달이 열려있는지 확인
        const docsToCheck = [document];
        try {
            if (window.top && window.top.document && !docsToCheck.includes(window.top.document)) {
                docsToCheck.push(window.top.document);
            }
        } catch (e) {}
        try {
            if (window.parent && window.parent.document && !docsToCheck.includes(window.parent.document)) {
                docsToCheck.push(window.parent.document);
            }
        } catch (e) {}

        for (const doc of docsToCheck) {
            try {
                const found = doc.getElementById('__auction_bid_list_modal');
                if (found && found.isConnected) {
                    bidListModal = found;
                    targetDoc = doc;
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
        lastChatMessage = null
    ) {

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
                        '전송',

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

        const mountTarget =
            document.body ||
            document.documentElement;

        mountTarget.appendChild(
            backdrop
        );

        mountTarget.appendChild(
            modal
        );


        // =====================================================
        // 금액 입력
        // =====================================================

        input.addEventListener(
            'input',
            function () {

                let value =
                    input.value
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


            send.disabled =
                true;

            cancel.disabled =
                true;


            send.style.opacity =
                '.55';

            cancel.style.opacity =
                '.55';


            status.textContent =
                '전송 중...';


            try {

                await sendChatMessage(
                    message
                );

                // ✅ 낙찰 내역 기록 (수동 입력)
                addBidRecord(
                    nickname,
                    price,
                    lastChatMessage || '',
                    message
                );

                removeAuctionUI();

            } catch (error) {

                console.error(
                    PREFIX,
                    '전송 오류:',
                    error
                );


                status.textContent =
                    error.message ||
                    '전송 실패';


                send.disabled =
                    false;

                cancel.disabled =
                    false;


                send.style.opacity =
                    '1';

                cancel.style.opacity =
                    '1';
            }
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
    // ⌘ + 클릭 / Alt + 클릭
    // =========================================================

    function handleModifierClick(
        event
    ) {

        if (
            !isModifierPressed(event)
        ) {
            return;
        }

        // 🛑 가드 1: 버튼, 입력창, 안내 패널, 모달 내부 클릭은 수식키 클릭 무시
        const ignoreSelectors = [
            'button',
            'input',
            'textarea',
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


        if (!nickname) {
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


        console.log(
            PREFIX,
            '수식키 + 클릭 성공:',
            nickname,
            '채팅:',
            lastChatMessage
        );


        const parsedPrice =
            lastChatMessage
                ? parseBidPrice(lastChatMessage)
                : null;


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

                // ✅ 낙찰 내역 기록 (자동 감지)
                addBidRecord(
                    nickname,
                    parsedPrice,
                    lastChatMessage || '',
                    message
                );

                console.log(
                    PREFIX,
                    '숫자 감지 -> 인풋창 자동 입력 완료:',
                    message
                );

            } else {

                console.warn(
                    PREFIX,
                    '채팅 입력창을 찾지 못했습니다.'
                );
            }

        } else {

            openAuctionModal(
                nickname,
                lastChatMessage
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
        }
    };


    // =========================================================
    // 안내 버튼 스타일
    // =========================================================

    function createGuideButton(
        label,
        message
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
                        flex:1 1 calc(25% - 6px) !important;

                        min-width:0 !important;

                        height:32px !important;

                        padding:
                            0 8px !important;

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
            }
        );


        return button;
    }


    // =========================================================
    // 안내 버튼 영역 생성
    // =========================================================

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

                        flex-wrap:wrap !important;

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
        // 버튼 (경매 흐름 및 연관성 순서)
        // 0행: 낙찰 내역 관리 버튼 (full-width)
        // 1행: 경매 참여 & 입찰 규칙 (회원등록 -> 입찰 안내 -> 호가 -> 낙찰 취소)
        // 2행: 사후 처리 & 방송 안내 (택배 -> 경매장 -> 채팅 안내 -> 응원문구)
        // =====================================================

        // 낙찰 내역 버튼 (full-width)
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

        panel.appendChild(
            createGuideButton(
                '👤 회원등록',
                GUIDE_MESSAGES.member
            )
        );

        panel.appendChild(
            createGuideButton(
                '🔨 입찰 안내',
                GUIDE_MESSAGES.bid
            )
        );

        panel.appendChild(
            createGuideButton(
                '💰 호가',
                GUIDE_MESSAGES.price
            )
        );

        panel.appendChild(
            createGuideButton(
                '🚫 낙찰 취소',
                GUIDE_MESSAGES.cancel
            )
        );

        panel.appendChild(
            createGuideButton(
                '📦 택배',
                GUIDE_MESSAGES.delivery
            )
        );

        panel.appendChild(
            createGuideButton(
                '🏠 경매장',
                GUIDE_MESSAGES.place
            )
        );

        panel.appendChild(
            createGuideButton(
                '💬 채팅 안내',
                GUIDE_MESSAGES.chat
            )
        );

        panel.appendChild(
            createGuideButton(
                '❤️ 응원문구',
                GUIDE_MESSAGES.support
            )
        );


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
                    '==================='
                );

                currentInput.focus();

                console.log(
                    PREFIX,
                    '구분선 입력 완료'
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
    // UI 감시 (쓰로틀링/디바운스 적용)
    // =========================================================

    function startUIObserver() {

        createAllUI();

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

        // 2) 수식키 + 클릭 (채팅 닉네임/금액 감지)
        handleModifierClick(event);
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

        // 유튜브 SPA 페이지 이동 이벤트
        window.addEventListener('yt-navigate-finish', () => {
            createAllUI();
            updateFloatingBidButton();
        });
        window.addEventListener('popstate', () => {
            createAllUI();
            updateFloatingBidButton();
        });

        attachChatFrameListener();

        startUIObserver();

        console.log(
            PREFIX,
            '준비 완료 (수식키 + 클릭 대기 중)'
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
