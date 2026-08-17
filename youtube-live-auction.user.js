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
            const url = new URL(window.location.href);
            return url.searchParams.get('v') || url.pathname.split('/').pop() || 'unknown';
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


    /** 오늘 날짜의 현재 방송 기록 필터링 */
    function getTodayBidRecords() {

        const today   = getTodayString();
        const videoId = getCurrentVideoId();
        const records = loadBidRecords();

        return records.filter(
            r => r.date === today && r.videoId === videoId
        );
    }


    /** 낙찰 배지 업데이트 */
    function updateBidBadge() {

        // 메인 document와 iframe 양쪽 모두에서 버튼을 탐색
        let btn = document.getElementById('__auction_bid_list_btn');

        if (!btn) {
            try {
                const iframe =
                    document.querySelector('iframe#chatframe');

                if (iframe && iframe.contentDocument) {
                    btn =
                        iframe.contentDocument.getElementById(
                            '__auction_bid_list_btn'
                        );
                }
            } catch (e) {}
        }

        if (!btn) return;

        const count = getTodayBidRecords().length;
        btn.textContent = `📋 낙찰 내역 (${count}건)`;
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

    function removeBidListUI() {

        const input = findChatInput();
        const targetDoc = input ? (input.ownerDocument || document) : document;

        const modal = targetDoc.getElementById('__auction_bid_list_modal');
        const backdrop = targetDoc.getElementById('__auction_bid_list_backdrop');

        if (modal) modal.remove();
        if (backdrop) backdrop.remove();

        // 혹시 document에도 남아있는 경우 정리
        const rootModal = document.getElementById('__auction_bid_list_modal');
        const rootBackdrop = document.getElementById('__auction_bid_list_backdrop');
        if (rootModal) rootModal.remove();
        if (rootBackdrop) rootBackdrop.remove();
    }


    // =========================================================
    // 낙찰 내역 모달
    // =========================================================

    function openBidListModal() {

        removeBidListUI();

        const input = findChatInput();
        const targetDoc = input ? (input.ownerDocument || document) : document;
        const mountTarget = targetDoc.body || targetDoc.documentElement;

        if (!mountTarget) {
            console.error(PREFIX, '낙찰 내역 모달 마운트 대상을 찾지 못했습니다.');
            return;
        }

        const records = getTodayBidRecords();
        const totalCount = records.length;
        const totalPrice = records.reduce(
            (sum, r) => sum + (parseFloat(r.price) || 0), 0
        );
        const totalPriceStr =
            Number.isInteger(totalPrice)
                ? String(totalPrice)
                : totalPrice.toFixed(1).replace(/\.0$/, '');


        // -- Backdrop --

        const backdrop = targetDoc.createElement('div');
        backdrop.id = '__auction_bid_list_backdrop';
        backdrop.setAttribute('style', `
            position:fixed !important;
            inset:0 !important;
            width:100vw !important;
            height:100vh !important;
            background:rgba(0,0,0,.65) !important;
            backdrop-filter:blur(5px) !important;
            -webkit-backdrop-filter:blur(5px) !important;
            z-index:2147483646 !important;
            pointer-events:auto !important;
            opacity:1 !important;
            visibility:visible !important;
        `);


        // -- Modal (Compact Layout - 낙찰 모달과 동일한 330px) --

        const modal = targetDoc.createElement('div');
        modal.id = '__auction_bid_list_modal';
        modal.setAttribute('style', `
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
            border:1px solid rgba(255,255,255,.12) !important;
            border-radius:18px !important;
            box-shadow:0 25px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.05) !important;
            z-index:2147483647 !important;
            display:flex !important;
            flex-direction:column !important;
            gap:10px !important;
            font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
            overflow:hidden !important;
            opacity:1 !important;
            visibility:visible !important;
            pointer-events:auto !important;
        `);


        // -- Header --

        const header = targetDoc.createElement('div');
        header.setAttribute('style', `
            display:flex;
            align-items:center;
            justify-content:space-between;
        `);

        const title = targetDoc.createElement('div');
        title.setAttribute('style', `
            display:flex; align-items:center; gap:8px;
            font-size:15px; font-weight:800; color:#fff;
        `);
        title.innerHTML = `
            <div style="
                width:26px; height:26px;
                display:flex; align-items:center; justify-content:center;
                border-radius:8px; background:rgba(255,204,0,.14);
                color:#ffcc00; font-size:14px; font-weight:800;
            ">📋</div>
            <span>오늘 낙찰 내역</span>
        `;

        const closeBtn = targetDoc.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('style', `
            width:26px; height:26px; padding:0; border:0; border-radius:8px;
            background:rgba(255,255,255,.06); color:rgba(255,255,255,.65);
            font-size:19px; line-height:24px; cursor:pointer;
        `);
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(255,255,255,.14)';
            closeBtn.style.color = '#fff';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'rgba(255,255,255,.06)';
            closeBtn.style.color = 'rgba(255,255,255,.65)';
        });
        closeBtn.addEventListener('click', removeBidListUI);

        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);


        // -- 통계 카드 --

        const statsCard = targetDoc.createElement('div');
        statsCard.setAttribute('style', `
            display:flex; gap:6px;
        `);

        function makeStatBox(label, value, color) {
            const box = targetDoc.createElement('div');
            box.setAttribute('style', `
                flex:1; padding:8px 10px; border-radius:10px;
                background:rgba(255,255,255,.04);
                border:1px solid rgba(255,255,255,.08);
            `);
            box.innerHTML = `
                <div style="font-size:10px; color:rgba(255,255,255,.40); font-weight:600; margin-bottom:2px;">${label}</div>
                <div style="font-size:16px; font-weight:800; color:${color};">${value}</div>
            `;
            return box;
        }

        statsCard.appendChild(makeStatBox('총 낙찰', `${totalCount}건`, '#ffcc00'));
        statsCard.appendChild(makeStatBox('합계 금액', `${totalPriceStr}만`, '#6ee0a0'));
        modal.appendChild(statsCard);


        // -- 액션 버튼 행 --

        const actionRow = targetDoc.createElement('div');
        actionRow.setAttribute('style', `display:flex; gap:5px;`);

        function makeActionBtn(emoji, label, bg, borderC, textC, onClick) {
            const btn = targetDoc.createElement('button');
            btn.type = 'button';
            btn.innerHTML = `${emoji} ${label}`;
            btn.setAttribute('style', `
                flex:1; height:30px; padding:0 4px;
                border:1px solid ${borderC}; border-radius:8px;
                background:${bg}; color:${textC};
                font-size:11px; font-weight:700; cursor:pointer;
                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                transition:opacity .15s;
            `);
            btn.addEventListener('mouseenter', () => { btn.style.opacity = '.8'; });
            btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
            btn.addEventListener('click', onClick);
            return btn;
        }

        // CSV 다운로드
        actionRow.appendChild(makeActionBtn(
            '📥', 'CSV',
            'rgba(80,160,255,.12)', 'rgba(80,160,255,.30)', '#8db8ee',
            () => {
                const allRecords = getTodayBidRecords();
                if (allRecords.length === 0) {
                    showAuctionToast('저장할 낙찰 내역이 없습니다.', 'auction');
                    return;
                }
                const BOM = '\uFEFF';
                const csvHeader = '번호,시간,낙찰자,낙찰가(만원),원문채팅,전송문구';
                const rows = allRecords.map((r, i) =>
                    [
                        i + 1,
                        r.time,
                        `"${r.nickname}"`,
                        r.price,
                        `"${(r.originalChat || '').replace(/"/g, '""')}"`,
                        `"${(r.message || '').replace(/"/g, '""')}"`
                    ].join(',')
                );
                const csv = BOM + csvHeader + '\n' + rows.join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = targetDoc.createElement('a');
                a.href = url;
                a.download = `유튜브경매_낙찰목록_${getTodayString().replace(/-/g, '')}.csv`;
                targetDoc.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                showAuctionToast('📥 CSV 다운로드 완료!', 'success');
            }
        ));

        // 클립보드 복사
        actionRow.appendChild(makeActionBtn(
            '📋', '복사',
            'rgba(150,110,230,.12)', 'rgba(150,110,230,.30)', '#c4a5f8',
            () => {
                const allRecords = getTodayBidRecords();
                if (allRecords.length === 0) {
                    showAuctionToast('복사할 내역이 없습니다.', 'auction');
                    return;
                }
                const lines = allRecords.map((r, i) =>
                    `${i + 1}. ${r.time} | @${r.nickname} | ${r.price}만원`
                );
                const text =
                    `[낙찰 내역 ${getTodayString()}]\n` +
                    lines.join('\n') +
                    `\n\n총 ${allRecords.length}건 / ${totalPriceStr}만원`;
                navigator.clipboard.writeText(text).then(() => {
                    showAuctionToast('📋 클립보드 복사 완료!', 'success');
                }).catch(() => {
                    showAuctionToast('❌ 복사 실패', 'auction');
                });
            }
        ));

        // 전체 삭제
        actionRow.appendChild(makeActionBtn(
            '🗑️', '삭제',
            'rgba(220,70,70,.10)', 'rgba(220,70,70,.28)', '#ee9292',
            () => {
                const cur = getTodayBidRecords();
                if (cur.length === 0) {
                    showAuctionToast('삭제할 내역이 없습니다.', 'auction');
                    return;
                }
                if (!confirm(`오늘 낙찰 내역 ${cur.length}건을 모두 삭제할까요?`)) return;
                const allRecords = loadBidRecords();
                const today = getTodayString();
                const videoId = getCurrentVideoId();
                const filtered = allRecords.filter(
                    r => !(r.date === today && r.videoId === videoId)
                );
                saveBidRecords(filtered);
                updateBidBadge();
                removeBidListUI();
                showAuctionToast('🗑️ 낙찰 내역이 삭제되었습니다.', 'separator');
            }
        ));

        modal.appendChild(actionRow);


        // -- 낙찰 목록 --

        const listWrap = targetDoc.createElement('div');
        listWrap.setAttribute('style', `
            flex:1;
            overflow-y:auto;
            max-height:240px;
            display:flex;
            flex-direction:column;
            gap:5px;
            padding-right:2px;
        `);

        if (records.length === 0) {
            const empty = targetDoc.createElement('div');
            empty.setAttribute('style', `
                text-align:center;
                padding:28px 0;
                color:rgba(255,255,255,.30);
                font-size:12px;
            `);
            empty.textContent = '오늘 낙찰 내역이 없습니다.';
            listWrap.appendChild(empty);
        } else {
            records.forEach((record, idx) => {
                const item = targetDoc.createElement('div');
                item.setAttribute('style', `
                    display:flex;
                    align-items:center;
                    gap:6px;
                    padding:7px 9px;
                    border-radius:8px;
                    background:rgba(255,255,255,.04);
                    border:1px solid rgba(255,255,255,.07);
                `);

                item.innerHTML = `
                    <div style="
                        flex-shrink:0; width:18px; height:18px;
                        border-radius:5px; background:rgba(255,204,0,.12);
                        color:#ffcc00; font-size:10px; font-weight:800;
                        display:flex; align-items:center; justify-content:center;
                    ">${idx + 1}</div>
                    <div style="flex:1; min-width:0; overflow:hidden;">
                        <div style="
                            font-size:12.5px; font-weight:800; color:#fff;
                            overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                        ">@${record.nickname}</div>
                        <div style="font-size:10px; color:rgba(255,255,255,.40); margin-top:1px;">
                            ${record.time}
                            ${record.originalChat ? ` · "${record.originalChat.slice(0, 15)}${record.originalChat.length > 15 ? '…' : ''}"` : ''}
                        </div>
                    </div>
                    <div style="
                        flex-shrink:0;
                        font-size:14px; font-weight:800; color:#6ee0a0;
                        white-space:nowrap;
                    ">${record.price}만</div>
                `;

                // 개별 삭제 버튼
                const delBtn = targetDoc.createElement('button');
                delBtn.type = 'button';
                delBtn.textContent = '×';
                delBtn.setAttribute('style', `
                    flex-shrink:0; width:18px; height:18px; padding:0; border:0;
                    border-radius:5px; background:rgba(255,255,255,.06);
                    color:rgba(255,255,255,.40); font-size:13px; line-height:16px;
                    cursor:pointer;
                `);
                delBtn.addEventListener('mouseenter', () => {
                    delBtn.style.background = 'rgba(220,70,70,.20)';
                    delBtn.style.color = '#ee9292';
                });
                delBtn.addEventListener('mouseleave', () => {
                    delBtn.style.background = 'rgba(255,255,255,.06)';
                    delBtn.style.color = 'rgba(255,255,255,.40)';
                });
                delBtn.addEventListener('click', () => {
                    const all = loadBidRecords();
                    const updated = all.filter(r => r.id !== record.id);
                    saveBidRecords(updated);
                    item.remove();
                    updateBidBadge();

                    // 통계 재갱신
                    const remaining = getTodayBidRecords();
                    const newTotal = remaining.reduce(
                        (s, r) => s + (parseFloat(r.price) || 0), 0
                    );
                    const newTotalStr =
                        Number.isInteger(newTotal)
                            ? String(newTotal)
                            : newTotal.toFixed(1).replace(/\.0$/, '');
                    statsCard.querySelector('div:nth-child(1) div:nth-child(2)').textContent =
                        `${remaining.length}건`;
                    statsCard.querySelector('div:nth-child(2) div:nth-child(2)').textContent =
                        `${newTotalStr}만`;

                    if (remaining.length === 0) {
                        const empty = targetDoc.createElement('div');
                        empty.setAttribute('style', `
                            text-align:center;
                            padding:28px 0;
                            color:rgba(255,255,255,.30);
                            font-size:12px;
                        `);
                        empty.textContent = '오늘 낙찰 내역이 없습니다.';
                        listWrap.appendChild(empty);
                    }
                });

                item.appendChild(delBtn);
                listWrap.appendChild(item);
            });
        }

        modal.appendChild(listWrap);


        // -- 마운트 --

        mountTarget.appendChild(backdrop);
        mountTarget.appendChild(modal);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                removeBidListUI();
            }
        });
    }


    // =========================================================
    // 멋진 토스트 메시지 알림 (채팅창 영역 위 표시)
    // =========================================================

    function showAuctionToast(
        text,
        type = 'auction',
        duration = 2600
    ) {

        const input =
            findChatInput();

        const targetDoc =
            input
                ? (input.ownerDocument || document)
                : document;

        const mountTarget =
            targetDoc.body ||
            targetDoc.documentElement;

        if (!mountTarget) {
            return;
        }

        // 기존 토스트 정리
        const existingToasts =
            targetDoc.querySelectorAll(
                '.__auction_toast_notification'
            );

        existingToasts.forEach(el => el.remove());

        const toast =
            targetDoc.createElement('div');

        toast.className =
            '__auction_toast_notification';

        let iconBg =
            'rgba(255,204,0,.20)';

        let iconColor =
            '#ffcc00';

        let iconText =
            '⚡';

        let borderCol =
            'rgba(255,204,0,.40)';

        let glowCol =
            'rgba(255,204,0,.15)';

        if (type === 'guide') {
            iconBg =
                'rgba(80,160,255,.20)';
            iconColor =
                '#6eb4ff';
            iconText =
                '📢';
            borderCol =
                'rgba(80,160,255,.40)';
            glowCol =
                'rgba(80,160,255,.15)';
        } else if (type === 'separator') {
            iconBg =
                'rgba(235,90,90,.20)';
            iconColor =
                '#ff8f8f';
            iconText =
                '📏';
            borderCol =
                'rgba(235,90,90,.40)';
            glowCol =
                'rgba(235,90,90,.15)';
        } else if (type === 'success') {
            iconBg =
                'rgba(70,200,120,.20)';
            iconColor =
                '#6ee0a0';
            iconText =
                '✓';
            borderCol =
                'rgba(70,200,120,.40)';
            glowCol =
                'rgba(70,200,120,.15)';
        }

        toast.setAttribute(
            'style',
            `
                position:fixed !important;
                bottom:78px !important;
                left:50% !important;
                transform:translateX(-50%) translateY(20px) !important;
                background:linear-gradient(135deg, rgba(32,32,38,.96), rgba(18,18,22,.98)) !important;
                border:1px solid ${borderCol} !important;
                box-shadow:0 12px 36px rgba(0,0,0,.70), 0 0 22px ${glowCol} !important;
                border-radius:14px !important;
                padding:10px 18px !important;
                display:flex !important;
                align-items:center !important;
                gap:10px !important;
                color:#fff !important;
                font-size:13px !important;
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
            `
        );

        toast.innerHTML = `
            <div style="
                width:26px;
                height:26px;
                display:flex;
                align-items:center;
                justify-content:center;
                border-radius:8px;
                background:${iconBg};
                color:${iconColor};
                font-size:13.5px;
                font-weight:800;
                flex-shrink:0;
            ">${iconText}</div>
            <div style="
                color:#fff;
                line-height:1.3;
                overflow:hidden;
                text-overflow:ellipsis;
                letter-spacing:-.2px;
            ">${text}</div>
        `;

        mountTarget.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.transform =
                'translateX(-50%) translateY(0)';
            toast.style.opacity =
                '1';
        });

        setTimeout(() => {
            toast.style.transform =
                'translateX(-50%) translateY(10px)';
            toast.style.opacity =
                '0';
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

                        font-size:21px !important;

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

                        font-size:13px;

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
                isFn ? '12.5px' : (isDelOrClear ? '15px' : '17px');

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

                showAuctionToast(
                    `✓ @${nickname}님 ${price}만 낙찰 전송 완료!`,
                    'success'
                );

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

                showAuctionToast(
                    `⚡ @${nickname}님 ${parsedPrice}만 낙찰 문구 입력 완료!`,
                    'auction'
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

                showAuctionToast(
                    `📢 [${label}] 문구 입력 완료`,
                    'guide'
                );

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
        bidListBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openBidListModal();
        });

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

                showAuctionToast(
                    `📏 밑줄 구분선 입력 완료`,
                    'separator'
                );

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
                    handleModifierClick,
                    true
                );

                iframe.contentDocument.addEventListener(
                    'click',
                    handleModifierClick,
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
            handleModifierClick,
            true
        );

        window.addEventListener(
            'click',
            handleModifierClick,
            true
        );

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
