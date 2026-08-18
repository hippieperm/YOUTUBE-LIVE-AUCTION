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
     * 낙찰 내역 더미 데이터 일괄 생성 및 추가 (테스트 & 시뮬레이터 전용)
     * @param {number} count - 생성할 더미 데이터 건수 (기본 5)
     * @returns {Array} 생성되어 추가된 더미 레코드 배열
     */
    function addDummyBidRecords(count = 5) {
        const records = loadBidRecords();
        const currentVideoId = getCurrentVideoId();
        const today = getTodayString();
        const numCount = Math.max(1, parseInt(count, 10) || 5);

        // 실전 경매 더미 데이터 풀 (품목명, 닉네임, 가격(만원), 원본채팅, 수량)
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
            { nick: '초록정원', price: '5.5', chat: '.55', item: '석곡 착생목' },
            { nick: '푸른언덕', price: '28', chat: '28만', item: '해송 취목 대작' },
            { nick: '백년송', price: '14', chat: '140000원', item: '소사나무 분재' },
            { nick: '청솔마니아', price: '9.5', chat: '9.5만', item: '철쭉 분재 명품' },
            { nick: '도예가', price: '50', chat: '50만', item: '특선 괴목 탁자' },
            { nick: '소나무장인', price: '32.5', chat: '325', item: '진백 명품 반현애' }
        ];

        const baseTimestamp = Date.now() - (numCount * 90000);
        const createdRecords = [];

        for (let i = 0; i < numCount; i++) {
            const sample = DUMMY_SAMPLES[i % DUMMY_SAMPLES.length];
            const recordTimestamp = baseTimestamp + (i * 90000) + Math.floor(Math.random() * 20000);
            
            // 영상 시간 (예: 00:03:20, 00:05:10 ...)
            const videoSec = (i + 1) * 90 + Math.floor(Math.random() * 40);
            const videoTimeStr = formatVideoTime(videoSec);
            
            const recordDate = new Date(recordTimestamp);
            const realTimeStr = 
                String(recordDate.getHours()).padStart(2, '0') + ':' +
                String(recordDate.getMinutes()).padStart(2, '0') + ':' +
                String(recordDate.getSeconds()).padStart(2, '0');

            const itemText = sample.item ? `[${sample.item}] ` : '';
            const newRecord = {
                id: recordTimestamp,
                blockKey: `dummy_bid_${recordTimestamp}_${i + 1}`,
                date: today,
                time: videoTimeStr || realTimeStr,
                videoTime: videoTimeStr || realTimeStr,
                realTime: realTimeStr,
                videoId: currentVideoId,
                nickname: sample.nick,
                price: sample.price,
                qty: 1,
                originalChat: sample.chat,
                message: `👉 @${sample.nick} ${sample.price}만 ${itemText}낙찰입니다. 축하드립니다!😄`
            };

            records.push(newRecord);
            createdRecords.push(newRecord);
        }

        saveBidRecords(records);
        updateBidBadge();

        console.log(PREFIX, `📥 [더미 데이터 추가 완료] +${numCount}건 (총 ${records.length}건)`);
        
        // 토스트 알림
        if (typeof showAuctionToast === 'function') {
            showAuctionToast(`📥 더미 낙찰 데이터 ${numCount}건이 추가되었습니다. (총 ${records.length}건)`, 'success');
        }

        // 모달이 열려 있다면 즉시 갱신
        const modal = document.getElementById('__auction_bid_modal');
        if (modal) {
            openBidListModal();
        }

        return createdRecords;
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


    /** 낙찰 내역 버튼 내부 콘텐츠 (iOS 스타일 배지 포함) 렌더링 */
    function renderBidButtonContent(btn, count = 0) {
        if (!btn) return;
        injectAuctionHighlightStyles(btn.ownerDocument || document);

        const num = Number(count) || 0;
        const prevCountAttr = btn.getAttribute('data-bid-count');
        const hasPrev = prevCountAttr !== null && prevCountAttr !== '';
        const prevNum = hasPrev ? Number(prevCountAttr) : null;
        const isChanged = hasPrev && prevNum !== num;

        btn.setAttribute('data-bid-count', String(num));

        const animBadgeStyle = isChanged
            ? 'animation: auctionBadgePop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both !important;'
            : '';

        btn.innerHTML = `<span>📋 낙찰 내역</span><span class="__auction_badge" style="
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: 18px !important;
            height: 18px !important;
            padding: 0 5.5px !important;
            box-sizing: border-box !important;
            background: linear-gradient(180deg, #ff453a 0%, #ff3b30 100%) !important;
            color: #ffffff !important;
            border-radius: 9999px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', Roboto, 'Segoe UI', sans-serif !important;
            font-size: 11px !important;
            font-weight: 800 !important;
            line-height: 1 !important;
            letter-spacing: -0.2px !important;
            box-shadow: 0 1.5px 3px rgba(0,0,0,0.35), inset 0 0.5px 0.5px rgba(255,255,255,0.4) !important;
            vertical-align: middle !important;
            margin-left: 2px !important;
            flex-shrink: 0 !important;
            transform-origin: center center !important;
            will-change: transform, box-shadow !important;
            ${animBadgeStyle}
        ">${num}</span>`;

        if (isChanged) {
            btn.style.animation = 'none';
            void btn.offsetHeight; // reflow
            btn.style.animation = 'auctionBtnPulse 0.6s ease-out';
            setTimeout(() => {
                try {
                    btn.style.animation = '';
                } catch (e) {}
            }, 650);
        }
    }


    /** 낙찰 배지 업데이트 (메인창 + iframe + 플로팅 버튼 전역 동기화) */
    function updateBidBadge() {

        const count = getTodayBidRecords().length;

        // 1) 현재 document에서 탐색
        const btn = document.getElementById('__auction_bid_list_btn');
        if (btn) {
            renderBidButtonContent(btn, count);
        }

        // 2) iframe 내부에서도 탐색
        try {
            const iframe = document.querySelector('iframe#chatframe');
            if (iframe && iframe.contentDocument) {
                const iframeBtn = iframe.contentDocument.getElementById('__auction_bid_list_btn');
                if (iframeBtn) {
                    renderBidButtonContent(iframeBtn, count);
                }
            }
        } catch (e) {}

        // 3) 부모 창(top/parent)에서도 탐색 (iframe 내부에서 실행 중일 때)
        try {
            if (window.top && window.top !== window && window.top.document) {
                const topBtn = window.top.document.getElementById('__auction_bid_list_btn');
                if (topBtn) renderBidButtonContent(topBtn, count);
                const topFloatBtn = window.top.document.getElementById('__auction_floating_bid_btn');
                if (topFloatBtn) renderBidButtonContent(topFloatBtn, count);
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

            // [케이스 1] 2자리 숫자 (55, 65, 75 등)
            if (raw >= 25 && raw <= 95 && raw % 10 === 5 && isLowScale) {
                const candidate = raw / 10;
                if (underTenAvg !== null && Math.abs(candidate - underTenAvg) < Math.abs(raw - underTenAvg)) {
                    console.log(
                        PREFIX,
                        `💡 [문맥 보정 파싱 (2자리)] "${text}" (${raw}) ➔ ${normalizePrice(candidate)}만 으로 보정됨`
                    );
                    return normalizePrice(candidate);
                }
            }
            // [케이스 2] 3자리 숫자 (105, 125, 155, 205, 255, 355 등)
            else if (raw >= 105 && raw <= 995 && raw % 10 === 5) {
                const candidate = raw / 10;
                const avg = baselineAvg !== null ? baselineAvg : 20;
                if (Math.abs(candidate - avg) < Math.abs(raw - avg)) {
                    console.log(
                        PREFIX,
                        `💡 [문맥 보정 파싱 (3자리)] "${text}" (${raw}) ➔ ${normalizePrice(candidate)}만 으로 보정됨`
                    );
                    return normalizePrice(candidate);
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
            // 3) 끝자리가 5인 정수 (2자리: 55, 65, 75 등 / 3자리: 105, 125, 155, 205, 255, 355 등)
            if (!b.detail.hasExplicitUnit && b.detail.isRawInteger) {
                const raw = b.detail.rawNum;

                // [케이스 1] 2자리 숫자 (55, 65, 75, 85, 95 등): 10미만 경매에서 5.5만, 6.5만 등으로 보정
                if (raw >= 25 && raw <= 95 && raw % 10 === 5 && isLowScaleAuction) {
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
                // [케이스 2] 3자리 숫자 중 끝자리가 5인 숫자 (105, 115, 125, 155, 205, 255, 355 등):
                // 10~100만원대 경매에서 10.5만, 15.5만, 25.5만 등으로 보정 (255만 -> 25.5만)
                else if (raw >= 105 && raw <= 995 && raw % 10 === 5) {
                    const candidate = raw / 10; // 예: 255 -> 25.5
                    const avg = baselineAvg !== null ? baselineAvg : 20;

                    // candidate(25.5)가 raw(255)보다 기준 호가대(예: 15~30만)와 훨씬 가까운 경우
                    if (Math.abs(candidate - avg) < Math.abs(raw - avg)) {
                        finalPrice = candidate;
                        finalPriceStr = normalizePrice(candidate);
                        console.log(
                            PREFIX,
                            `💡 [스마트 문맥 보정 (3자리)] "${b.originalChat}" (${raw}) ➔ ${finalPriceStr}만 으로 자동 보정됨 (작성자: ${b.nickname})`
                        );
                    }
                }
            }

            return {
                ...b,
                price: finalPrice,
                priceStr: finalPriceStr
            };
        });

        // 4단계: 최고가 탐색 및 동일가 선착순 우선 선별
        let maxPrice = -Infinity;
        resolvedBids.forEach(b => {
            if (b.price > maxPrice) {
                maxPrice = b.price;
            }
        });

        // 최고가 입찰자들 필터링
        const topBids = resolvedBids.filter(b => b.price === maxPrice);

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

            @keyframes auctionBadgePop {
                0% {
                    transform: scale(1);
                    box-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.35);
                    filter: brightness(1);
                }
                30% {
                    transform: scale(1.48);
                    box-shadow: 0 0 16px #ff3b30, 0 0 28px rgba(255, 59, 48, 0.75);
                    filter: brightness(1.35);
                }
                60% {
                    transform: scale(0.86);
                    box-shadow: 0 0 8px rgba(255, 59, 48, 0.4);
                }
                80% {
                    transform: scale(1.14);
                }
                100% {
                    transform: scale(1);
                    box-shadow: 0 1.5px 3px rgba(0, 0, 0, 0.35);
                    filter: brightness(1);
                }
            }

            @keyframes auctionBtnPulse {
                0% {
                    box-shadow: 0 0 0 rgba(255, 204, 0, 0);
                    border-color: rgba(255, 204, 0, 0.28);
                }
                35% {
                    box-shadow: 0 0 16px rgba(255, 204, 0, 0.6);
                    border-color: rgba(255, 204, 0, 0.85);
                }
                100% {
                    box-shadow: 0 0 0 rgba(255, 204, 0, 0);
                    border-color: rgba(255, 204, 0, 0.28);
                }
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
        renderBidButtonContent(btn, displayCount);

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
        renderBidButtonContent(btn, todayRecords.length);

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


            // =========================================================
            // 경매양식 원본(경매양식원본.xls) 내보내기 엔진 (BIFF8 / OLE2)
            // =========================================================

            const AUCTION_TEMPLATE_GZIP_B64 = 'H4sIAAAAAAAC/+zdB1QV1/o3/jkHxEMvKoIFAUFRQIqgICqIvffeC3bFgh272HvvvYuK2BVbjDG50SSmaHo1iYm5Nz25yU3Cu/cpw3y/Z4bf9f3d/7vWf60LC+U8s2fPnM8855k9c+YMr73q//G+M5U+UeirseKi/FXsrrhpYuXFz4fu9gd+ipheXCx/dfz/NzHtZfFzT/zcFz+viJ9Xxc9r4ueB+Hld/Lwhft4UP2+Jn4fi55H4eVv8vCN+3hU/74mf98XPB+Kn+L9f/59/uVvEhnQro/TpeL/sO4pZcbMoyifi/wLXW+JfRflU/PRTJihlFWVY1vDBU8bmhP4/+cq0rsNgk1yHmyZFaWSyKCYRc1FclSsmX8VLUbqNHDW5Z/akMUOys8fsFJP8lWDrKgdY/y1n/fe0tYMi67+NxJTiucVzy0Qd9kkRnSni5zNThrXdKuu/4dZ/fcS/JuWidZ53rZEEkfrvi/+L566Vs7nMV8yml8/efOE/F69kjVsUR7yM6cHljLuhysf5Fc47prqXOtWjlKkmMW+R2XiqxWBqeVorsynnZNFlR9xdJy4jevHvDPoJMunHR5qM2mvXFpdr0V0f/fYjDeJGW23vv7k1bf3YVJNKMVfs62w0tWEpU81KxVLnTSp1amPDqdIkxXCdY0qd6lrqVKmRUqqGf6nZm24wb23lHPh7m9org5WxyghlijJeCVVaKtlKjjJSGaUMVUJco5UyoiqYwpVjoeFKdSVG/FRX4pU0Ud9iFY6GuCaLfV+QXvO+ShclSxmm9DeYsb4olsHOM9YRP0ZLs00LcW0ikjLEeNbSl+zoJEu4xCumgWqT2oKipJmMa9dCbyrOG259VDIlw/pviGuMUkupqSgDY2uHVo+pXj1+YGxaP83vMh4eG279LWNgbIjrFLGUFOMVs61/6aunbaO3kuni23lFk5RoJU6zonXiYV1tD+2rm55essKVxCutgtj/RdieUq20flH23/vVCnGtJtKjknZq3y5Zw/pDk1CRCJXVJnI5mj7EQ9kmUnQSSm2wJ3tDL6VA7oZtSwsNcY1Tzoi1M81QbN/hSrMz4QIuVBknfn/zBdvvw8TvuXfDBUiGgKigFIoMMznnrI9yVtRtpV9sv9D4fqH9YmXTc3KMF947a3J4mv3fDtnhEuW8RAnvNmlKlojZ/2sxeOzkLDG1vHJB8RVTO44XQds/w4eLeH/lolicqa8SoeSHxiqJ1hzW27K1KM+jlP9pnn5ino+tg1NF+bnYTzNgvRkK8Z/+G/9PxU0yN1wxXsbR/pw97OpuEI8ziNd+xn4qP2P/gQbxqgbx6GfsJ6bU9XFziicYxKsaxKMN4oHP2L/R+jQ2iHsYxFMN4hHPuD7J1nhZg3yr6Ihv9Pff4rnF0/F8g5z6ibXGyzviO/39Az0DRftK9ri7Lf5P7D/YwLmSwfpY1PUZPvxGtRvVFNf69v6jdfsvL+qTXryyo583lUHi10qOuHtJfLAYr1VzxKs4Odi2Y1WD9Qwp6aeT+FXtpxrGPR3x0JK4+HVekFOc+g8zeP2Ga9bT5hNod4gx8KmtG/cQB3smJVCxPnGnuGjvpRcvZ9w+xt8/IzQjFOP+iqmhXtxP8WsYRvECxd9Fb7kyHiAG7f4Buu114vb10Y83NAVkKNyPtf8wg/7DDPo3ai+jFBduDcMg7mnwfD1L1se6lk7L1fG5ZTZy09sutrihf4yfn+K0/vqetniAvoOOj3U9neJn7NtFb/318sdd9GP1obgcY8l4gFEe+mn9vQzy39NgfTwNXheeov4Eu4jy0hDdNHF/RSf/hYMf5on6vCiuvl504rK9LAkZOnH/cGcHEc8NsMXt9cQWF+uZ668TD9DEow3aR9Nyw2C5no72Df3CnR0q6aynYrAdHa8LvXyzxp1eL/Y8pLg9H3Ltzm5x/Hx14tb2tvVxbm8QD7e9XtySOR6Gccd29wtQdPM8LEA///3CDNob1B+D1+9Y8eSkkKs3elYxqsMBfs79W5drEDfajmFGcaPtG2qwXP14rj0PVWdbPTF8Xrl2H7e6lD/hRnml83xl3OSXoejGxUGiXj+mMP39USi9XhztQw3qc6i/fnuj/YIcYujWf+va68TDdPsfa18u5I91ffTbx4Tp7tf8Guo5W7e7WWwXvfGAQTzMIC5PNuvFw53a2+qYn1mhuL0+G7Q3ipvMGYpePFxnPaVnmH5ejZU7Db14uFN7+37WKW539jOoD/4GdVinblj3pwEG44oAg/1ymEE/BuMrrgP/Q93uZ09zp7pt3//+W3W71DpPyz3j2P/qjIf16qejPfsUOupPGNcf6/Zy7C/49TXW7uMWw/mgE1d01kcxGE8qpYzH9MZdatyg/uvtfzXby2l8YjRu8dcf/+Q6r4+ev7cjryjuY43768b19he+BuNwX4PxvK/B/tTPYH38DPrxM9wvKwbjQMfrl+uGGvfXtg90en3V1cS1ry+Kq+2T9OOG/SdR3PE6derfP6PUeJJ+3Hm5Ou21caPnVRedc5UhVje3QBzf5voNsa1/IOUnti+J67W3jquHZOj2YxQPg7i/Yz2r/Lt1Sd3PBhi8rgOebRyO9dy/ZP8bqs1DW9zsFA8o9fXrHC/3P43rdF932D7XUl7JtWgv0PhJ+fVKyJzZlihlNsT9rLquoh/5ltn7X/xQ7Dix7tzWH9r++P57pbQNgLZPv/+wlLbloO0XH/+9lLbloe17//ixlLYVoO2fX5e2voHQ9tK9z0tpWxHX99LFUtoGQdtHj4tKaRsMbe/dereUtpWg7cUPn5TStjK0/eOt86W0rQJtN599VErbqtD2nc0bS2kbAm1vP9xRSttq0Pbs/rultA2Ftuvvf1BK2zBo+/vNtaW0DYe2HedfK6VtdWh7s1P7UtpGQNsdV3uX0jYS2s4btr+UtjWgbdv8F0ppWxPa/rq5habtSmpbS+4gRa2ym81W1LaO+X/4QdQM+xtvZe2xuXPnFjveeLNoY/Y3Xd21Mfmmq/WKFE3M/jXb0pDWp7b4Mavrs1Nxc1qf4ruvqOsz2zKM5o+WJ54Vx3oWFhaq81u0Mfv87tqY/fl4aGP25+O8nrG4nlnObsVPd2rWk7dRHes28taaqNtoOrWNEz9l1O156NAhta3jeaanp6vLsmhj9ufkro3Zn5OHNmbfRs7PMxGepzY/HMspnmfSPE+ev651/rI6rzOLNqbOz889yfrcvdV1ner03K129Ny1+emuk58eOvnpvI2SYRtVaz1bs434edYDJ21b/efJ89f/H+c/cvPDUuZP+R/nt9Z6w3xMfYbn2gCWpQx2zv0XvtW+RrnmpEHNsebfv1FztPls0clnd518hhxXaw4/98nPsN/IeYa2U56h7dRnaDutlPrObac/Q9slz9B2GbQtvqmU0rbgGcYnZ56hbeEztD37DG3PPUPb88/Q9vIzmF19hvFf0TO0fVNt66Lca2e9etuw7VvP0Pahpm1i3dLbvv0Mbd95hnV49xnavvcM6/DBM7T98BnW4aNnaPuxpu0r3yiltv3kGdp++gxtP3uGto+foe3nz9D2C8O2G8zB4mjXQzEliseR4sAhVvxUyJ/w4ks3E5T1lnrip6SbMq4hxR6KXkvZvUnxUsoU2w6XZbf++t0m6nQbrtttInQrj6xltwH63dbV6baGbrd1oVt5EC67LaffbZJOt7V1u02CbuXxuuy2vH63yTrd1tHtNhm6lYf2stsK+t3W0+k2UbfbetCtPAsguw2U3Sb9W5lQTXSb9D9kgjxhILutqN+tXiZU1+0WM0GeW5DdBul3q5cJNXW7xUyQpyFkt8H63eplQrRut5gJ8oyF7LaSfrd6mRCn2y1mgtxhyW4r63erlwl1dbvFTJD7YtltFdltvX8rE0JFt/X+h0yQw2jZbVX9bvUyIUK3W8wEeXZFdhui361eJkTpdouZIE/EyG6r6Xerlwkxut1iJshzNrLbUP1u9TIhXrdbzAR5ekd2G6bfrV4mJOl2i5kgR9MbzN7iMMFVMZVs/drUVdViV90tLg/c5OzVS2ZP1Jk9TJ0dt6w8XyRnjyiZva7O7JHq7LgF5SkkOXtkyexJOrPXUmfHLSXPKsnZa5TMnqwze6w6O24ReaJJzl6zZPZ6OrMnqLOjvDyG2GD2FAdyLorpWv7H+SlX11uq4Mxmz2IXxTZNPt5gdldqyY9cPZ9fcHO9ZTQ1Diw2K3KKPIJ0LEUeLZZxbOvZSrGb4mP9XR7dm5Sy8MgCj9zhkVx0bbnorQUjxaITcdGmymLRcopi/UCYbXHyZJRj0fJklewiWk7vduXolfWWLrT2HqILOUWeo3KspTzPVLKWtkcWeOQOjzaYXZWYeWWKGdJUpoyATChadC3qrgMyVq7KT0XnHzg/mypiVeQUeDZPd5Y8myxFPBt/pY6EjriVdyVUaf/g4HOXXl9vqUPPKlmIa1vIDHB0I2VlAsXJBMq4Fap0fzj97nrLEOqiokggx1R5wsexRvJklwNKHsS7qVC2RxZ45A6PJFT8PBcBVYmgXMRzz32u35s2JlclYZ6baBVOrdxEH7JVqNJXFJj+iq21rxiCiPX77k5BfpVzoWKl11sa0JMJEogl0yWwNjsdT0CeN3OzbqW6chNsfGH2Hafy5hIs1lROkZ04HGQ9KkkY+cjWTZLsJu9u5KX1lgG0RuVFN3KKpHWsizyX9r95pSTLxVV58ZhI8xq01r5icXKKNhHkKSWZCPVkIsiJoYoswik0q59IBMdUrZycXfuUyyiys/olnSXqdOavdpZo2Jk8rWbrLKWks7o6nQWondU17EwODszWzlJLOtMp1y7l1M5s5RqV3JUGEnfFi+3uOr9wK4klyCnaF6483+boQp6Pk12kyek778t04CJaQXQhpxgVUdvrp+S1ZIJXnQledSZ41dnKU8N5rjqvOlex1PMPuj10vOoazSur86orK5YsW+GrzlXsyRTnPk2K6FO8jl+Sj1ZbeomfkqlrrW9p+ivdhMgQZaySpXRVcpQZ1t/aWz9QNEqZoowTm6qT+G2q9cOBJS3aidgIZaR4nCBydpD147954gDTv4v12naxN3t82fXhqId54sCo/0b5IQY3k98bjy+PPSniL/Z7M0+ofJNdznqqs+vIrKycRBlZNlETqbvdEqRs1z4fzf8HLH7iBz+Fv1IkVRfxfcrkKtPLtaL1w8klc5vEgURl+TaYybOkN+80+ar/wkWeDdVONjsmy+z7VUwua50cipPd0mQ3rq7y8g7tZHvnZdOsGSVPZ+nNXdY6t23yLZNF/ChK8tdm5akyXn4s7LvhtmV8Z32Xz0tRXOzv6prtS/C2/y7PjXRVPL+T7zLeEOlnUeabmiiK5YZJvsN905Qhfi+2fuY3Qwn53s82p0V0aKkofn4Vjf5Qaro2t7+fYZKDCzEgeXx55/3Bd8QvQc8FPXfvkot8uSx9c+1d8cvYk3l3B98RL6CVD197QfzX7PrHco5m1+XjEMWUcrXX3TjxbONP9b8UKl6t4gmcdX1xwouj3pJ5ceiumCLyJl7sgFNEoawvcixWvNJTrY/s3duX8/iydRVk6gy+4+5YF7/8wXf6vRWqVBUraHEEo0S3st3auxCydebuWLt7l2XtXFrU7834U2o7eV2I7cmJkfWtm6EKfqc8tK/C2ruush8Z+zjfVTqtfHFpUcpDWcyek9GlRWLnt61APL974jnLJqF34+99c2feNVc5bkq6mvFC4nOucrGy9UsXReulb9oWkndFxEe9JX99Pl/Ti3WZewtk/P2XXEuemahNUcqTQte7DZTXXqhlTfgXuz20r418pvalur547t6xK/0vlSl5ZikPy5Y8820F8ffW3i0j57FNfe2FMrYFvv+S3HYVxV7zSsotuaNfdzfh1vtizXu9tbVAOt65c+5e3pVmAvnmazl3O4t1H/TWwvyyShmZYjlv/VS46Fr+XdsWl3W0gvVtHNuXl61RqCKbhCqyUagyIX/rRduyuHk1W/O8u5ZTDnOZVavO+D+UO5xkkbgyl1KtWRQrNnCSmFnGUsXUUCXn7t57EU7rEOBYB1u6lqRkXTGbbeZE0VGCaMGzVrbN+seLK2/Z8tv1xfnXQpUpdwtuSqClRaYX+gnbFCXllFy3KFVDbiruzNsBFqr8VChFQhWbSagiVZzxzLYZ8m/+kc+TXG2TbMmcd8Vgsm2bO0/2Vlzl5PiE+NiUuqmJsamJSQncplg8X4vyeWPbFW2R6YrYFyjKq+L/X+SbV6LWDBGlZof4/znxf6SoQ+1EjbqVqShPRP0aagkUP3jhie0pbbbk+Wymit6prYur/AicxXr5wlcf+t6Qe/AqZttFM32bZo/PyRqfM7DbjAlZk/vXmT5ubP66lzvcjvdr/murPxZ+HttmZ2GGJfKrBXdX392fe/PFbRGBL71deKT7v35t93q3zKOhgWNj3qn76+60zyZdq1b2/O2tO4+0Of1DZnTE08ot+x/6qH7Hd072WDa/UlDDwYd8t/505XpRVP0l81ov297l0KwvJoxoV9ho9dpJ1dYefP33FPPLyVNrzPtzns/9KZ3fD3q6bF3KZy81ffS5y4WCqr0a/ePz37ZGfLr23JX0eh3y2zS1LDx7c/2b3xz9rcVLgZl1/na55s91DkYv23e/93PdfgsueDIgK/lB8tEPQ3/wXBlwu8Br2cBXR4QGx35xI233sm/ee9h7bNEHqwtX59YbcK/DreLyg35Of1LujXtz+841y/u/uJDXoYdHvrwp33w1WT+3pgyclDV2clwd+e+iNa+Ovh3vteTbvGsLH8zu/PrtoMipcYfWNo07MFv5JGruyPDK71V++l7Hu24eVy2LDn7767FGf51a8dsnG78MDdx+3O32p03TXx75ydRGN+YueCnv4JFIS9/pExYfmPXe+YFFnR4caHg/ofKhVhfiNwX4Ln2nY1GXU5nDHrzk93qb5u8lDYmYe2TdxIGPqm3dHfxxvXZv/BzY5VH9QafWHH2p+Ozt+Hu7O96aezrm8+au4+tvbDfq8ZB9R+M+63pt7dGs42+GvHb+0m8P/zTpPdExMzYHLhS/LbdfwZMzMmtcVpzm3/aDxw8ekTVJZojXvfYet0P9Mj6ZvW/a2nfqD70a1XxI4cunrv6iNN1Zqcndva/vee/R558trP/KR+Xf2tHWu3fMzrLey7Pu11l68bvcmCOVj77bqsqdmLGf3K3wxVfTg146t6rcR61fnNx5dvW31uadPP9B6MPz0W+FfRvzwYDLEaMbrWjZ88kbv9b6tPnT6Boe5hT9ld8VeWLrn+LXKzVtrwanlU+Qq/1Nn/tr3r9Q4UbFJ8WhTxp/+GDlF+VCyqYNvDAmu+jtbZdeXFd9YoufuuxvM2nqND/XqCrlLWv3Zzw49+RQRnZq+XHeERlx/xj4Wb3mTwP/qvh7qzaVJrbsevrvzRdGXF3Sf9nM3I++vdtyUvaNaf5dv/Sa3KRX4oRrfac8utX6Zub6fLd/lP1x1MmnDTL3RzTbGDn94/EFEz66+uPtau+3mB38SVBafLr/7KQJ1Wu98det+ZZBQcv6xtxxz+2bGFLd/XTuFL9JOT65Q2e+dvTRe2UTwpc9jYhyu7Bmc9uAQV+mp//rt5fjGk/59vH7Ncs3i+hydP68H7Z9uupkre31Gv5cPu/tpf6fvxK836Wia943uavjDj7tFBGRG3Rpyp+fhbx/efa839+JqP3rvdj7O77eM3ZAvbCG40Zuyz0ftWhm1xuPgiv+kWzadDVnw0vDkr73mLNdHA70Gp1T68efjvTP3vpjjP+2u/0/PDDzxD/e+ynyr/tVd826/UnBWy/nJLRLXjfjp2lPrv58Ye7bBU+S1+3L/vtr/7p9+8HRcQ/GhDf96MN9e6bOHPfR4UfN/CNf+srnvMeTnO0T41ptXvnhiYhvzTMu7l6XfSy08vJvuoRvjln3r0mxLToG7THPDz/Yav3z63aUj+usjGqY+f2Ccgdd9zZucShueJRfWtM2m6ubO3RJnTB3Y3jUstgbPV8t/ufXv2155cSXrw5o+OfXd964UfTPxxsqdiweO713uW/3Deu++58/rBj417+mpU/56+fPvx0456+no2d2Plz8rz2N//XewLnd21sqnHvrydOPGv7rbs9Xr//197i/flvyavSLvql9Nr70ZcQLz82otietZozbe+eGjr3//YIb76ycsWhpskvzm1cX/NysReAn/6rc7MSTxW9P/XCoz8edm0+f9ufzr08J/P58RIX11ZqdaT79+aCqiQO+mle2TY+Xbv84pfB44CuPsq6UW/TK8WFrOg3Jm1rYwZT848FzuenLCw59kdB8WbPonYO+Opr9TfnPPJ42jnj+h6f+7inlxtba5busbrODr0dOLiwIGJX2VciysDo7au8Ie3Nz9uqQtKYtTuSHfFZ3R4CH+YHH519u7TO+aMXDgDvdY76MOpy1JL1Z4vEuky580mTb+PCIZjPzak2uERa4f/Qr1X1+2bzgL8U0oPviP5eOH7JjfdtJfe78GDYkv13q8CMHLHdGVfj7yojO2365npJXvvkrCRu6P25575Tfzz4TM176cEJ6jbc9fn06/2OXwsJu79ZY+nvhFxXOFK3YtunGWe/+4fmd3UI/yPx6a0Sx54VapvfrBYwfNOvjkOfCe3Rv+Gud+T83vpId1mzNgwapL3SqcLXtm96ZH4We+9eulk9mn8/981JR3pCMUW+t3Tqg77QPv//whVmto3a95H3HN+8f18rEZHxS3u2thteePn+nRcyqjzt3T7QUPOlR5atUnxE/3G3W4qzl0GsXZ50aUhgQ/HTThC41Bt04uiR6RvTMJ38eemfchTcbPx+6JOOHpXnDLx1b/OPfW9xqMeb867Pe7depa8Kl4wXDaw71uHBtVXzHWlOyRu3u0X7h/siT8b0v9/r25Vuf542K7zW9XIPKZX8P+25S5V/+bJP0zTS/O/t+uLqsc0hg1bynXuuWdlp6NqjW1WlDH38V+vnlwqFLC29HLHw37foLYyJHNbrzS9WD/SNbZU38K2TijJ8+jGwzwy37gOv7dbZUb/+3O63LfZn78S99Vm1+6hpV9VLbt2vfHroz88280TX8+9+a3zX0cut/PQo8e+qHcUmzLg+e6j99wu+D/7g+tCDPpVbFSSubDevSdO7fusyr0Wb9gxsPzBcHbDFVGJmTHLu9f6vF2e08vztQtU9Rv08zNi/sX6nz9bqngzcWnn8+NzDvy1cWnPrNfcF3J7qVmZUZ/vHzTasvmDn/s9TPx/35ktuX+U/+tmTI9ldWVt/eImph3+77Z0RWnuTdKs/n95MHQ97ucexqvX/cb/8gcm77wxvf+Oes4cv7dPzYsj/4uMV1QsN76w7Uzvo4sU51t6iNLSK2ThpZJWlqxoWb/nG5iw8uaDr6zy2f1f350Zs7P9n3cqWp639YlF+lw6BG6/3v/jNoUOsRH43ZOuOdd7N6vb5y3StH118JTx4d913w4cl588edv3C1g+uxUw8iFpraT0st/ubX/AWB0W893vj0fmbhkL8nJ39X/I/cdgkLO9fzebq4xq9z9w15EDK2Z/e6Azu++ujDwrCvb1+4/8OPx5XBhw7t3bLpz77Hv1vc9mST/KorKp/sl7r001N34nslNatVJSL164r5cxeVLf80qYfn1zt3KRcaTJi7b2uTdzN6PGr32SdR85IWeo7ceW9v6xp3/nap3phdGx/9cOf37WkfZP4jckT0/VMB39bPmfpg5zuf5vcp6jBiRMiF3HEv/HKlUvisy80Gj9yWPSxn0E/de/+WuCJ2d8beuxPGFRz+Ymbbg98dfhra6ItXPq1Sz78gYf7t1ofPfjbkpaE/b4rd8kre4kvt3SYULO7fqua8Jr7bXYNErc5tUxAY0OFvP+XkuB3dP3lahS86Rv1tz4IVEXMf9w7ZXmXRRx8H/NP72JEDK3+v/ZVXQq++gevi83r2WfzVoeWm0KTqdwLyj2XMHnRwZdfF+anBl6r9/PW11tNe/3nMnAONjv328/eXpqZU/e38L28+PffC/e9HJv3SuMfq7/+Y0+w5v5ptRs4J/uq3tEfrJs5pMTt60Pem6f6nKv/o2frS6p++/qJBl7I3v27+8rglp88+uv/887dWb1ze9tWg79+Y0sfl2McJhaEbX1x1vThnV8qTjwbeOhPRp1OF0a8uORX0zb7peQvux3welBf+XK/VQVl/zAkYsnTi1U31U/rG+o6Ne7LSpeeAH44++u7p7Ran642blpY89+uLo691uNb3xKxrg0/3/3XWX9NHz/oprPXypx9c/PXJ1W9cYj6qvOi3FrO//fb3EI99M6Pn/77z5IZOI6a7rtsZsa/xt9Uuufc7ePVvsQk++4beeu3M0Zrta/nv67kvJq9f3rEGj5e80ePaZ/Wvnu9w5K383+63vlbvmw4tz99e92j8tBq3H0yYdGxpjSsXKz7q2rL5phPNYmZ+l/9t9oWZ3jejP5iR/Ob8xX3+fmHWc21P9LgTuNez4uU73cff+iAls+++hEOPj9y7cPKEsnrSk/ktTQUnyvcvmOCieBUHhFW7dToyy+/YvPXlM9121fxmwNzCFlXMrb6tOaHZ4ymV+/+zovuxgeXbfeG74o/BuzLPBt/KPDUxOLTT1vvlnu+74v6gPTXq/3PuwuL6/xzY+M1rt4pnRzd3fzT+uxvnruQ+/S594exe7lMvuipLqtw69nu7b1euGN43u8Y//qioN2DyfrB2zwV5DGayXcurHTDZhrg85rMPedt7PBdfftGvC6ZZsrPfuOK3rsYHS187+abLosfJ3vXSIzp/83fvUzGWOksGX9826uqWXS+VG5r4YcLI45UsDb7aNHH7rXGXvlmd0SWww7J30oYVDFqwOrv+3yuMWNc2qn2NiC5RdRK2TvKp2WbDzteWd/tt3qmUA2t6PA4/cLjJi1dfa/XrlNl7v99hyr0TcW2I36y3lODNnbYXn/0zpdKyEXHVAvv/1bnJ5HfyykTtf+Hex9V3HG/n+re+V648Ly9+sT11kzlWMT4Gwi+dIyLugA8KSr7iTXCIwDPyIFtz4b659CE398QjXs1lUmaj8S/3wUlQ8lXW699OiU5ty7jZTtCVUfqLjszyhJqyw+InfvC040oRW0kx6yevrDeE9IMbQnqa16rtvhKHvI0GKMpPSxWlSKxv3y8UpXp5k/JcU5OyfKJJ+dt+k3LyNZOSIOYtX8esbO1vVmatMCvFV8zKp0/MyvAgFyW7pYvyZIqL8vCgi9LxDRelkdlVuRDvqhwc6KpUXe2qeF5zVRY9dVUmVSqjPG1VRnlnWhmly+EySsZbZZTLLm5KIx95NantbLhZGab4Wn/3t5459BOcfxz7/vX2QzqlD7TGa1vj0dZ/F1gj85SSJx4pTzUrPqb5Ysot1/L285ELre0WWeepYWs9r/ypR+k1bb8PGj78YXqUvZdHBz5Or2X7PeP7/Ifp7ZXNArKVMlgZrwxVspVxSqjSSWmmtFCe5cvk6mJ6X7nk3vGGvO2lu5Jk2e5p20q9zHLdYqwnZJtY3074T32Z/s12s5RUJVOpp9QVz6m+9SxTrFiTetYT57bTnvK0lYzJ35qI35qL9nWVFNE6QUTqi9/riniCMlv579f//77+t7n936//fv33679f//3679d/v/7ffe1TwsVIsq31wgE51osxWUeR1lGr/KDr2f0P0k3KTksN8WPcy7n9jt+6i5GpRYzhbDeCaFj2unW8LB/L/j8xDVIfm8V3W7909bGL+B7ldlF9LC9vOORZMl0ev4yylDx2k3eN9LitPi4rvm97l0yXVwgomvbu4ntU2ZLHHvLYxqPksac8UtS0l99LNO29FR9o7yu+P7Gk2z5PJh77ie/b7iXT/cXg2TF9l4iK3s0+6vGS7dPzFrOf/U3av2wDbZOvNWbSidnuYz/NGssw+YbKmAvGrO1cddqVscZumbUxN51YWWuslyPmJ2MWjFmX4a4T89CJeerEvHRi3joxH52Yr07MTyfmrxML0ImV04mV14lV0IkF6sQq6sSCdGLBOrFKOrHKOrEqOrGqOrEQnVg1iv1p3WqK8qUSJf69br9fyJfi22x/5Ko0Ft9lxCO53LLWR87f/tbW8hU+QDwy2x9p5zWVMq/J7GY9tk4XLb2sOX1DGaj0FrE/rXcA8VCmWT8nf02su4vIqRmibZ2MmfZLLOTcLqKXDGtrV+vc1k/Ki7iraDlQZHpV8ZtZuWCdY97GLzLkBWsef5VVgsWrpMkH9hk9lOnWF4BcjKtYzCwxc0RGrn0xtjZyMRJRPpIvqgfW1LA9Mlnvsu14ZFaGWzep7ZGLMsK60W2PXJWR1qdpeyTKmjWxbY/clOetqWV7VFYZbYW3PbIoYzQt3UWfFdVHHuJRZfWRpzgY81YfeYlHPuojb7E8P/WRj+gzQn3kK3pR1Ed+4jmY1Ef+ylhr0bgunpeb9eNonyifiu/PlMfK5+Jb/iv/Okx18eNh/UCX+Fp6O0NROiuexd5KZFmluNgjwyMj2O+7xzJD3MRqPhbfXvaZvB0zZawRM33o4uuYyTvD2zqT3KTymsTH9hl8YQY3xc8xg2+Gr3UGWzM/R7PcO6LZY9/pf9qb+WX4iWa2VHETz+8LZY7Zw5oDr4uf79LdhGhZITDYcVVIsUU8di8W21qGi1wTxMMW8hLEjJryAhHTTbE9PIPNZeWLL9gSoFR0NcmrknLe+q0w2OKiZLqIl4HZU6alIyxpy4pkedN6NwDb4l2sn7r8Lt02zVVMi7Pnc1mxGR7aW7kpj6y8tlZllbeVeLWVRclRbCvvbr98Un7Jlfewrby7WPnm1pV3d1fqpcmV//NmiHXlI+WD3+0PyiiBwRYfpaLZeomXfA7h4jkEWywybntCbuJYX/Qrjv1LNvgkxVRcR2kmlnPTPmuJSgUZd7kp/nG7WaZJsFLST3/Rj6cyTNm+TX5dFrvOai4+xS1le495IVrZRBkrczPEJGPeSjXHHMEWP+0Dx9o6FtBTLMBLLEBzHlXxKW6is4AYGbPoLcDD1oC7ltbeDgORjhbF08XbZu0trIOsm8LbR3Hzkbwe88Q/f1mfvm1WH8es1s300MXLMavM4LIi0YdqEv2+yf7KEA1u+twM9lsqmoWJR36OZtZEF5Wi2NP63CS2700XW274K1nWhcr9+huOZYr1lX9dSSxUhotcy4nJ1vPEbu5Ku+JiRUq42OYyyVtDqatqKXk5XLfeCNusvKO8K1L2PeV95QNlqojYZnNXMmE2NRFl/oiHShPNZrEoXjJ/LAb5Y5H5Y3HKn+5iPk+lr6afOqLwpMv2tHlry5gjf9yVCFnugy1eSoSL9RfeuLJjzBuxazTu2KLt2MvRsZdu1kjmJprnXaTd9JWtV1lrJweZvLWZYREbWet2wlYzpa82MywiM7TNHph9ZWZYZGZYHJlhEZnR1LpQd01mWDJkZyZHZtgmYwp42CbbUiBQTDYrHyofaVIg076V3Wkru9u2srvBVnaXW9ldZyu701YWLyy5Mdx1Nob7M21ld9rK7rb00e/4WbayO21lD0f6e9sn41ZepsDr3522srttRycPaLRb2Z22chWx9p7WtZeM9q3srm5lD81W9pP1quT1b5uMW9kTt7KHwVaubD2uwudqfTIyXOSaIv5tpXh4KI3ryDpYrLfhRfy3m+KfP2jDy661G16uk4eta0/RdWtr156eSuN0W4mlTWbbq/2buSCXpc0F+TR8bMvyUpfl5VXKsv54hvTwoPQYKF7G1mXZdh1yWd7eSmO9XYcHpY6wsM3qo87q42M0qy/N6meb1VfMWtE6q6+v0tjbdhuVv24W2zNNzukHc4qhm21OPzFnBeucfn5KY0+buXU7W5PPQ00+T03ylbfufKDEeFLyeWHyeRomnycln2dJ8tkmcwJ5OxLINhm3uWfJNrdNxs30m6Nzb/tk3BRejuz0sU/2pVVTuW2T0XSsIwf8rGM6T5XOS0MXJOiO256Dg86L6LyRzsuQzovovJDOi+j6mLy0dF5E54V0XkT3yOSrpfMiOh+k8yI6L6TzIrqbJqDzUum8NXRVBN3zZqDzJjofLV0N69vLOLbJFIvtK552E/t3U7Ek2ZGPZjmhYjlZinWFfOxDKx+lvXXMRUMrH1q8L245H8Mt50Nbzteh52GfjFtuvyOzPO2Tccv54JbzoS33gRm2nA9tOU+zl3bL+dCW88Et50NbzsMMW85H3XK+GtHwDDmeURyitslI54d0voZ0vkTnh3S+ROerQNL7Ep0v0vkSXS+Tt5bO1ynpgc6X6HyRzpfoBitA56vS+WnoIjLkKA/o/IjOH+n8VLqH4njzbQ2dH9H5I50f0fk5bDztk5HugOPJe9knI90ZF6DzI7pVjjruY5/sS1sV6PyILglLrZ9K56+hqyHoApDOn+gCkM7fSveuTtb5O9FBqfUnOn/cS/kTnT9mnT/RBTi2i7d9sg8t21NL5090/kjnT3SvlOz5JZ2/ShegoYsSdOWQLoDoyiFdgJ3uQye6AKILcKy+h30y0gUgXQDRBSBdgBMd7OADiK487qUCiC4A6QKIrp8L0AWodOU0dLUz5GKArpwTHRyBl3Ois9hnwyPwctoj8MrWGwbhczNpXcuRazl0LUeu5dC1HLnOR9dy5FoOU7IcuZZD13LkugH3IeVU1/Ia1xjhWgFdy5NreXQtb+BanlwrODLZ3T6ZXSFfy5Nrt5IjGttkdC2PruWdDiuhSpYn10Mm2MGUJ9fy6FqeXBfhDqa86lpB41pHuAaiawVyrYCuFQxcKzi5Qr5WINcK6FqBXAMd6expn4yuFdC1Arned/HUulYgVwvmawVyrYCuFch1FJbQCqproMY1XrhWRNdAcg1E10AD10ByDUTXQHKtiHUgkFx9zJ5a10ByrYZ79UByzTNDvgaSayC6BpJrILoGkus9zNdA1bWixjVBuAaha0VyrYiuFQ1cK5JrRXStSK5B6FqRXCviQLMiuVbEfK1IrkF4dFWRXD9yAdeK5FoRXSuS60/oWlF1DdK4JgrXYHQNItcgdA0ycA0i1yB0DXJyhToQRK7BWAeCyDUIXYPINVAB1yByrYj5GkSuQegaRK4n8ag1SHUN1rjWFa6V0DWYXIPRNVh1lQP4Etdgcg1G12ByDUbXYHKthK7B5BqMrsHkOkeB+hpMrhXwwCiYXIPRNZhc/XF0H6y6VtK4JgnXyuhaiVwroWslg3ytRK6V0LUSuVbGOlDJyRXGWZXItRK6ViLXSjjOqsRvJqBrJXKthK6VyLUHulZSXStrXJOFaxV0rUyuldG1soFrZXKtjK6VybUKulYm18pYXyuTa2V0rUyuNXCcVZlc62IdqEyuldG1Mrl+i/W1supaReNaT7hWRdcq5FoFXasYuFYh1yroWoVcq6JrFXKtgq5VyLUKulYh1xFmH61rFXJ95JjsY5/sS5scXKuQayGOs6qorlU1rvWFawi6ViXXquha1cC1KrlWRdeq5BqCrlXJdQq6ViXXquhalVyr4n6rKrl2xXytSq5V0bUquf6CrlVV1xCNa0qGHAyCawi5hqBriIFrCLmGoGuIkyvst0LItRrut0LINQRdQ8j1Kp7QCyHX7/GsVAi5hqBrCLmexfoaorpW07imCtdQdK1GrtXQtZqBazVyrYau1ci1GrpWI9dQdK3mdFwArtWc8hX2W9XItRq6ViPXauhajVx3OM5Q21yrWV0fKc2UZbUUZay5jdJQPKfGyhjlD+HzpbmS+QvTbHOaKc00UuliSrN/9zL4lhfZhepceBemEwvXiVXXiUXoxCJ1YjV0YjV1YlE6sVo6sdo6sWidWIxOLFYnVkcnFqcTi9eJJejEEnVidXViSTqxZJ1YPZ1YfZ1Yik4sVSfWQCeWphNrqBNrpBNrrBNLp5ib7f5ran1oIOpDGNaHUKoPoVgfQg3qQyjVh1CsD6FUH0LxlHYo1Qcv2zo56kMo1YcwR/nwsk/2ptP9sD8LpfoQivuzUKoPoVgfQqk+bMbjsFC17oZpXNOEazi6hpFrGLqGGbiGkWsYuoaRaxjW3TByDcPjhTAnV6i7YeQa7mD3tk/2oQEW1N0wcg1D1zB+gwr3Z2Gqa7jGtaFwrY6u4eQajq7hcHz7tuoaTq7h6BpOrtVx/BVOruHoGk6u4ega7uQK+7Nwco1wpLOPfbIvzQ2u4eS6Cl3DVdfqGtdGGXIx4FqdXKuja3WDfK1OrtXRtTq5RqBrdXKtjuPa6uRaHV2rk2tNrAPVyXUXHt9WJ9fq6FqdXF9E1+qqa4TGtbFwjUTXCHKNQNcIA9cIco1A1wgnV6ivEeQagfkaQa4R6BpBrtMxXyPINdKxTX3sk31p1cA1glw/xeOFCNU1UuOaniGPssE1klwj0TXSwDWSXCPRNZJca2C+RpJrJLpGkusCPN8dye9im8A1klyHYL5GkmskukaS6+8mcI1UXWtoXDMy5KsGXGuQaw10rWHgWoNca6BrDXKtia41yLWqAu8j1CDXGpivNcg1FY/DapBrC3StQa410LUGuUZgHaihutYscZ0nXaPQtSa51kTXmgauNcm1JrrWJNcodK1JrjUxX2uSa010rUmuXdG1JrkW4fuJNcm1JrrWJNfp+P53TdU1SpOvTYRrLXSNItcodI0ycI0i1yh0jSLXWugaRa5RuN+KItcodI0i13/i+15R5BqM46woco1C1yhynYrvf0eprrU0+Spda6NrLXKtha61DFxrkWstdK1FrrXRtRa51kLXWuRaC11rkasJrxKqRa6TsA7UItda6FqLXA/jcUEt1bW2Jl8zhWs0utYm19roWtvAtTa51kbX2uQaja61ybWOCeprbXKt7Si/XvbJ6NoDz3fXJtfa6FqbXGuja21yrYb1tbbqGq3JV+kag67R5BqNrtEGxwXR5BqNrtHkGoOu0eQajfU1mlyjMV+jyTUax1nR5JphhjoQTa7R6BpNri+ha7TqGqPJ16bCNRZdY8g1Bl1jDPI1hlxj0DXGyRWOY2PINRbPH8aQawy6xpBrDB4XxDiNs+D8QAy5Lna8Pe5rn4yuj3GcFaO6xmryVbrWQddYco1F11gD11hyjUXXWHKtg/ka6+QK9TWWXGPRNZZcu+N+K9bpuADen4kl11jM11hytWB9jVVd62jytZlwjUPXOuRaB13rGLjWIdc66FqHXOPQtQ7XV3StQ6510LUOv++F46w65NoO87UOudZB1zp8NTzWgTqqa5wmX6VrPLrGkWscusYZuMaRaxy6xpFrPLrGkWscusaRaxy6xpHrdszXOKfzhJCvceQah65x5JqCrnGqa7wmX5sL1wR0jSfXeHSNN3CNJ9d4dI0n1wR0jSfXeHSNJ9d4dI0n178wX+PJdbgJ9lvx5BqPrvHk6oXvf8errgmafJWuieiaQK4J6Jpg4JpArgnomuDkCuddEsg1AccDCeSagK4J5JqI518TyDUB60ACuSagawK55phhv5WguiZq8rVFhrx8AVwTyTURXRMNXBPJNRFdE8m1LuZrIrkmomsiuSaia6KTK4yzEp3eT4Tzr4nkmoiuieR6HI+3ElXXupp8la5J6FqXXOuia10D17rkWhdd6zq5Qr7WJde66FqXXJPwfZi65FoXx1l1na7jhuOCuuQ6wzHZ1z4ZXVeia13VNUmTry2FazK6JpFrEromGRwXJJFrEromkWsy5msSuX6Hx1tJTq6Qr0nkugyv30wi1ySsA0nkmoT5mkSu/8T6mqS6JmvyVbrWQ9dkck1G12SDfE0m12R0TXZyhXxNJtf38XrjZHJNRtdkck3GfE0m13p4XjuZXJPRNZlc3fF8VrLqWk+Tr62Ea310rUeu9dC1noFrPXKth671yLU+5ms9cq2H44F65FoPXeuRaz10rUeuUTgeqEeu9dC1Hrl2xvcL6qmu9TX5Kl1T0LU+udZH1/oGrvXJtT661ifXFHStT6710bU+udZH1/rkWh9d6/N4AF3rk2t9dK1PridwPFBfdU3R5Gtr4ZqKrinkmoKuKQauKeSagq4pTq5wfiCFXFPx/EAKuaagawq5jsXPsKaQqzseF6SQawq6ppBrMB4XpKiuqZp8la4N0DWVXFPRNdXANZVcU9E1lVxTsb6mkqviAp/STCXXVHRNJdcD+DmZVHJtgPU1lVxT0TXV6bgA8jVVdW2gydc2wjUNXRuQawN0bWDg2oBcG6BrA3JNwzrQgFwb4DirAbk2QNcG5NoJj7ca8HWG+JnrBuTaAF0bkGsc5msD1TVNk6/StSG6ppFrGrqmGbimkWsauqY5uUK+ppFrOxwPpJFrGrqmkWsa1tc0cm2I+ZpGrmnomkau9TFf01TXhpp8bStcG6FrQ3JtiK4NDVwbkmtDdG1Iro0wXxuSa0PM14bk2hBdG5JrBH6eo6HT9fFQXxuSa0N0bUiuVXG/1VB1baTJV+naGF0bkWsjdG1kcFzQiFwboWsjcm2Mro3ItRGOBxqRayN0bUSu2/B8ViNy7YfvGzYi10bo2ohcF+DxViPVtbEmX9sJ13R0bUyujdG1sUG+NibXxujamFzT0bUxuTbGfG1Mro3RtTG5TsH3txqTawoexzYm18bo2phcR2C+NlZd0zX5Kl0z0DWdXNPRNd3ANZ1c09E1nVwz0DWdXNMxX9PJNR1d08m1LLqmk+ss/BxiOrmmo2s6ufbFfE1Xr+OeFyuv4+5l+t98y2trM3Sut22iE8vUiTXViTXTiTXXibXQibXUibXSibXWibXRibXVibXTibXXiXXQiXXUiXXSiXXWiXXRiXXViXXTiXXXifXQifXUifXSifXWifXRifXVifXTifXXiQ3QiQ3UuY47Q1N324v60ATrQwbVhwysDxkG9SGD6kMG1ocMp/oAx2EZVB+a4HFYBtWHDKwPGVQfauE4IcPpeAHqQwbVhwysDxl8HTeOvzLUuttEU3elaya6NiHXJujaxMC1Cbk2Qdcm5JqJdbcJud41Q91tQq5N0LUJuf6E44Qm5NoEXZuQaxN0bcLnu/F4oYnqmqnJ1w7CtSm6ZpJrJrpmGrhmkmsmumaSa1N0zSTXTBwnZJJrJrpmkmsmHi9kOuUrjBMyyTUTXTPJNVOBzyVlqq5NNfkqXZuha1NybYquTQ1cm5JrU3RtSq7N0LUpuTbFcUJTcm2Krk3JdQXma1NyTcN8bUquTdG1KX+uHsdfTVXXZpp87Shcm6NrM3Jthq7NDFybkWszdG3m5ArHt83ItRneNasZuTbH92eaketdPM/VjFwT0bUZuTZD12bkeh3HX81U1+aafJWuLdC1Obk2R9fmBq7NybU5ujYn1xaYr83JtTm6NndyhevhmpPreKwDzck1ButAc3Jtjq7NyfU5rK/NVdcWmnztJFxbomsLcm2Bri0Mjm9bkGsLdG1Bri3RtQW5tkDXFuQaiNfHt+DPfWK+tiDXPS7g2oJcW6BrC3KtjdcXtVBdW5a4ZkjXVujaklxb2lxb2m8A31JZ/Gw3gJcbo6VBkrekjdHStjFa2u/XLpfl7q5k/C/v1y6Xw1sVqlBL2qqtcJTXkrZqS6zuLWmrtsRXS0vaqi2xCrWkrdoSt2pL2qoXsbq3VLdqK00Vklu1NW7VVrRVW5VsVbmBWhlsoFa0gVqVbCDbZHRthaPnVuTaGl1bkWsrdG1Frq3wqoZW/O4QHl23ItdW6NqKXPPxKsdWqmvrEteb0rUNurYm19bo2trAtTW5tkbX1uTaxgbX2n5P6dbKUnlP6Yz/m3tKt3baJt62rm33lJZde3oqGf+Re0q3pg3c2raBW9vvKS2X5eVVyrKe5Z7SrSlbBtnOlLe231NaLsvbW8nQuzF0a8qk1rYXcGv7PaXlrD4+RrP60qx+tllt95SWs/r6Khk695RuTQnYWrGvr+2e0nJOPz8lw+me0q3VzGyj2T92FpnZFjOzDWVmG8zMNgaZ2YYysw1mZhunzPRyZKZtMmbXl2YvR3bZJmNCtClJCNtk3IYZJj/HNrRNxu3U1vGq8LFP9qVVU7eFbTKCZ5l9HeDStY3q2lazf5Su7dC1Lbm2Rde2Bq5tybUturYl13Ylr3jbZHRtq4BrW3Jti65t+XjZ8Zr3tk9G1y0unlrXtuTaFl3bkmtFE7i2VV3bafZQ0rU9urYj13bo2s7AtR25tkPXdk6ukK/t+P01B5ynfTK6tndsFS/7ZHR9xfHUve2T0TXPsWwf+2RfWjVwbUeu513AtZ3q2l6zh5KuHdC1Pbm2R9f2Bq7tybU9urYn1w6Yr+3JtX3JXsY2mV0hX9uTa3sHnLd9MrouVyBf25Nre3RtT66pCri2V107aOprF+Ha0eYqw/Ku5h2UVdYSQXc170DcHZC7gwF3B+LugNwdiLsjcnfg21K5QHnoQNwdkLsDcX+N5aEDcXdA7g7E3QG5OzhdNgbcHVTujpqyK7k7lXDbJqNrR3TtaHC415FcO6JrRydXKA8dyXWEY1DhaZ+Mrh3RtSO5ms3g2pFcO+HurCO5dkTXjuQ6G3dnHVXXTpqyK107o2sncu2Erp0M8rUTuXZC107k2hnztROfTkPXTuTaCV078ekJLLudnFwhXzuRayd07cS38cDdWSfVtbOm7ErXLujamVw7o2tn4XpOOSt+piovKFNU187k2hldOzu5Qr52JtdVuDvrTK6d0bUzuQ7D4Vdncu2C+dqZXDuja2dyneAoMjbXzqprF03Z7Zoh79YGrl3ItQu6djFw7UKuXdC1C7l2xXztQq4PTFBfu5BrF3TtQq7FJqgDXZxcIV+7kGsXdO1CrgexvnZRXbtq6qt07YauXcm1K7p2NXDtSq5d0bWrkyvka1dy7YrDhK7k2hVdu5JrQxwmdCXXbpivXcm1K7p2Jdf2OEzoqrp209RX6dodXbuRazd07Wbg2o1cu9tW3uHajVzX2tgdrt2cbrMOrt3ItRu6diPXbgrU127k2gzztRu5dkPXbuTazbHRbK7dVNfumvoqXXuga3dy7Y6u3Q1cuzu5Qr52J9fujufmYZ+Mrj0cKeVpn4yu3dG1u9Ow1lPr2p1c15vhcKE7uXZH1+7kmof1tbvq2kNTX7sJ157o2oNce6BrDwPXHuTaA117kGtPrK89nFyhvvYgVz/HZC/7ZHqb3QXytQe5fmuCfO1Brj3QtQe5nsM60EN17ampr9K1F7r2JNee6NpTdc1R7iiTVdee5NoTXXuSay907UmuPdG1J7n2xHztSa6v4jirJ7kex9MGPcm1J7r2JNdyuN/qqbr20tRX6dobXXuRay907WWQr73ItRe69iLX3ujai1x7oWsvcu2Frr34Y7t4vNWLXN9ygTrQi1x7oWsvcm2FxwW9VNfemvoqXfuga29y7Y2uvQ1ce5Nrb3Tt7eQK44He/EfXsL72Jtfe6NqbXHvjfqs3ufbG/VZvcu2Nrr2d/v6Up9a1t+raR1NfuwvXvujah1z7oGsfA9c+5NoHXfuQa1/M1z5OrpCvfci1D7r2IddcHL/2IVezi7fWtQ+59kHXPvzHqTBf+6iufTX1Vbr2Q9e+5NoXXfsauPYl177o2pdc+6FrX3Lti659ybUvuvYl176Yr3359ih4+rAvufZF1778drAZxgN9Vdd+mvoqXfujaz9y7Yeu/Qxc+5FrP3TtR6790bUfufZD137k2g9d+5Hri2Y4LuhHrt0VyNd+5NoPXfvxxx5M4NpPde2vqa/SdQC69ifX/uja38C1P7n2R9f+Tq4wfu1PrgOwvvYn1/7o2p9c7+F4oD+5xmN97U+u/dG1P7nuxvFAf9V1gKa+9hCuA9F1ALkOQNcBBq4DyHUAug4g14GYrwOcXCFfB5DrAHQdQK5ncTwwgFyrYr4OINcB6DqAXJeh6wDVdaCmvkrXQeg6kFwHoutAg/HrQHIdiK4DyXUQug4k14F4HDuQXAei60D+W+O43xpIrgMxXweS60B0HUiuiS5QBwaql+f3jHO+PP+h+NmuxrL/rcvzB+lcRj1YJzZEJzZUJzZMJ5alExuuExuhExupExulExutExujExurExunExuvE8vWiU3QiU3UiU3SiU3WieXoxKboxKbqxKbpxKbrxGboxGbqxGbpxHJ1YrN1YnN0YnN1Ls8fpBknyPowGOvDIKoPg7A+DDKou4OoPgzC+jDIqT7A8cIgqg8WrA+DqD4MwvowiG9LhecNBlF9GIznDwdRfRiE9WEQ1YcQfB9hkFp3B2vGCdJ1CLoOJtfB6DrYwHUwuQ5G18HkOhhdB5PrGy7gOphch+Db4oP5eAH3Z4OdjsNgfzaYXAej62ByrY7nYwarrkM044SewnUoug4h1yHoOsTAdQi5DkHXIeQ6FPdnQ8i1M75PO4Rcp+F5riHk+roZ8nUIub5iguOFIeQ6BF2HkGsfdB2iug7VjBOk6zB0HUquQ9F1qIHrUHIdiq5DyXUYug4l16FYB4aS61CsA0PJdSi+jzDU6fIwcB1KrkPRdajTZbkwThiqug7T1Nee1j+iDq7DyHUYug4zcB1GrsPQdRi5ZqHrMHIdhuPaYeQ6DF2HkasXHi8MI9cXMV+HkeswdB1GrpVw/DVMdc3S1FfpOhxds8g1C12zDFyzyDULXbPIdTi6ZjldcAz5mkWuWeiaRa6f4nmDLHLNwnFtFrlmoWsWuR7D8zFZqutwTX3tJVxHoOtwch2OrsMNXIeT63B0HU6uI9B1OH+szAWuKxhOrsPRdTi5lsfrNYbzbf/QdTi5DkfX4fznWvE4bLjqOkJTX6XrSHQdQa4j0HWEwXHYCHIdga4jnFzhvMEIch2J5w1GkOsIdB3Bfx7EDO97jSDX8Y65feyTfWnVwHUEuTbE+jpCdR2pqa/SdRS6jiTXkeg60iBfR5LrSHQdSa6jMF9HOrlCHRhJriPRdSS5jsQ6MJJcR2K+jiTXkeg6klxr4vu0I1XXUZr6Kl1Ho+soch2FrqMMXEeR6yh0HUWuo9F1lNOfBYA6MIpcR6HrKHKtiOPXUeQ6Cl1HkesodB1Frq/jccEo1XW0pr72Fq5j0HU0uY5G19EGrqPJdTS6jnZyheOC0eQ6GvN1NLmOweOC0eQ62sHubZ+MrtfM4DqaXEej62hy7e24eMnmOlp1HaOpr9J1LLqOIdcx6DrGwHUMuY5B1zHkOgZdx5DrChO4jiHXseg6hlzfwnwdQ66H8bqCMeQ6Bl3HkOtvOB4Yo7qO1dRX6ToOXceS61h0HWvgOpZcx6LrWHIdh3VgLLlm4fh1rJMr1IGxfJt1PN4aS65jsQ6MJdex6DqWXOfi8dZY1XWcpr5K1/HoOo5cx6HrOAPXceQ6Dl3HOblCvo4j13wcZ40j13HoOo5cO+N5l3FO4wE47zKOXMeh6zj+8yA4zhqnuo7X1Nc+wjUbXceT63h0HW/gOp5cx6PreHIdj67jyXU81tfx5JqNdWA8uc7G64vG8+1q8XhrPLmOR9fx5NodXcerrtma+ipdJ6BrNrlmo2u2wfg1m1yz0TWbXCdgHcgm12ysA9lOrpCv2eTaEV2zybUxnh/IJtdsdM0m1/1YB7JV1wma+ipdJ6LrBHKdgK4TDPJ1ArlOQNcJTq5wXDCBXCficcEEcp2ArhPINQTfn5lArnVc/LSuE8h1ArpOIFc3dJ2guk7U1FfpOgldJ5LrRHSdaOA6kVwnoutEci2L+TrRyRXqwERynYiuE8l1Ip7Pmkiuo3G/NZFcJ6LrRL7dF7pOVF0naeprX+E6GV0nkeskdJ1k4DqJXCeh6yRynYT5OolcJ6HrJHKdhK6TyHWyY6N52yej62t4XnsSuU5C10lOfw4bjmMnqa6TNfVVuuag62RynYyukw1cJ5PrZHSdTK6Tcb81mVyfmmA8MJlcJ6PrZHL1xvMDk8k1B8cDk8l1MrpOJtdOeF3sZNU1R1NfpesUdM0h1xx0zTFwzSHXHHTNIdcpWAdyyDUH8zWHXHPQNYdcc/D8QA65LsDrN3PINQddc/jPLeD5gRzVdYqmvkrXqeg6hVynoOsUA9cp5DoFXac4uUIdmEKuU3G/NYVcp6DrFKfbKYLrFHKtjPV1CrlOQdcp5PrABVynqK5TNfW1X4Z8swhcp5LrVHSdauA6lVynoutUcp2G+TrVyRXGWVPJdSq6TiXXOTgemEquseg6lVynoutUcn0Tx69TVddpmvoqXaej6zRynYau0wzGr9PIdRq6TiPX6eg6jT9Wj/V1mtP7huA6jVwjMV+nkes0dJ1GrtPQdRq74vmBaarrdE19la4z0HU6uU5H1+kG+TqdXKej63RynYGu08l1OtbX6eQ6HV2nk2s2HhdMJ9fp6DqdXKej63Ry7YrnCaerrjM09VW6zkTXGeQ6A11nGLjOINcZ6DrDyRXq6wxynYn1dYbTn7uF97lnOP05RjhPOINcZ+A4a4bTn10B1xnk2h/fL5ihus7U1Nf+wnUWus4k15noOtPAdSa5zkTXmeQ6E8dZM51cIV9nkussPD8wk1xnoutMcm2K+TqTXGei60y+fhOvN56pus7S1Ffpmouus8h1FrrOMnCdRa6z0HUWueZiHZhFrpvxepdZTq5QB2aRaxfcb80i13P4+aNZ5DoLXWfx5w6wvs5SXXM19VW6zkbXXHLNRddcA9dccs1F11xynY2uueSai+OBXHLNRddcch2A78fmkus76JpLrrnomkuu0TgeyFVdZ2vqq3Sdg66zyXU2us42cJ1NrrPRdTa5zkHX2eQ6G+vAbHKdja6znc4TwvmB2U5/FgBcZ5PrbHSd7fTnQ8F1tuo6R1NfB2TIE+DgOodc56DrHAPXOeQ6B13nOLlCfZ1DrnPQdQ65zkHXOeT6OY4H5pDrXDyOnUOuc9B1DrkWYX2do7rO1dRX6ToPXeeS61x0nWvgOpdc56LrXHKdh/k61+nPBMH4dS65zkXXueT6FdbXuU6ukK9zyXUuus4l1yOYr3P/47dZn6dzve18ndgCndhCndginVieTmyxTmyJTmypTmyZTmy5TmyFTmylTmyVTmy1TmyNTmytTmydTmy9TmyDTmyjTmyTTmyzTmyLTmyrTmybTmy7TmyHTmynTmyXTmy3TmyPznXc8zTjBFkf5mN9mEf1YR7Wh3kGx7fzqD7Mw/owj+rDfKwP85zen4G6O4/qwzysD/P4zzZjfZhH9eE5PM81j+rDPKwP86g+PMTx1zy17s7XjBOk6wJ0nU+u89F1vkHdnU+u89F1PrkuQNf55Dof7wcz3+lzdJ5a1/nkWgHHX/PJ9YIJjsPmk+t8dJ3P7ydi3Z2vui7QjBMGCteF6LqAXBeg6wID1wXkugBdFzi5wvHtAnJdgPm6gFwXYL4uINeF+D7CAnI14XUwC8h1AbouINc7eL57geq6UDNOkK6L0HUhuS5E14UGrgvJdSG6LiTXhei6kFwX4XmDheS6EF0XkutrOK5dSK4LS27zaZvsS5PBdaHT5799tK4LVddFmvoqXfPQdRG5LkLXRQaui8h1EbouItdF6LqIXPPQdRG5LkLXReTqhtdxLyJXF7yuYBG5LkLXReQ6HY/DFqmueZr6Kl0Xo2seueaha56Bax655qFrHrkuxvqaR641cFybR6556JrH18O5wPFCntPtI6EO5JFrHrrm8efqsQ7kqa6LNfV1kHBdgq6LyXUxui42cF1MrovRdbGTK+TrYnJdgvm6mFx3ucD5w8XkWsUErov5Pjt4/nAxuS5G18V8/SYehy1WXZeUuIZK16XouoRcl9hcl9hvs75EaD7zbdaXGAzOltDGWGLbGEvst1mXy/qP3GZ9CW3VpfhqWUJbNQP3mktoqy7BV8sS2qpL8F2MJbRVl+CrZQlt1V2OMuNrn4xbdQaORpaoW3WpZq8pt+oy3KpLaasuLdmqcgMtNXi1LKUNtLRkA9kmo+sydF1KrkvxLNtScl2KrkvJdSm6LnU62w5X5y8l16X4allKrh74almqui4rcR0kXZej6zJyXYauywxcl5HrMnRdRq7Lba7L7LdZX6bckrdZT/2/uc36Mtomy2y5vsx+m3XZtaenkvofuc36MtrAy2ybaJn9NutyWV5epSzrWW6zvoyyZZfjedlusy6X5e2tpOrdK30ZZdIKW5ous99mXc7q42M0qy+9APxss9pusy5n9fVVUnVus76MEvCuY31tt1mXc/r5KalOt1lfpmbmcs14TmbmCszM5ZSZyzEzlxtk5nLKzOWYmcspM1eUZKZtMmbXcgelp30yJsTykoSwTcZtmF+yDW2TfeiDzZ6O7WSb7EsvGnVb2CYj+B7b8fIy+yt+ueq6osR1r3Rdia4ryHUFuq4wcF1BrivQdYWTq6fWdQVfh1/yqrVNRtcV6LqCXFc6Npq3fTLnv6/WdQW5rkDXFfxntx2b3Oa6QnVdqRknS9dV6LqSXFei60oD15XkuhJdV5LrKszXleT6yAyuK8l1JbqudHL11bquJNeVmK8ryXUluq7kP/dm9ta6rlRdV5W4fixdV6PrKnJdha6rDFxXkesqdF3l5Ar5uopcVzvYPe2T0fWUyVPruopcbzpSyts+GV3vO14MPvbJvrRq4LqKXJuh6yrVdbXm+GOwcF1jc5VheZv11WK5ivNt1lcT92rkXm3AvZq4VyP3auJejdyriXsNcq8m7tWYxquJ+xczlN3VfLkzcq8m7tXIvZq4ayhQdler3Gs0hyWSe20Jt20yuq5B1zUGRxhryHUNuq4h1zXouoZc16LrGnJdg65ryHUR7s7WOL095KV1XUOua9B1DbmacHe2RnVdqzkwkK7r0HUtua5F17UG+bqWXNfZZByua8l1g43d4brWyRXK7lpyXYuua8l1LZaHteRaxeSjdV1LrmvRdS25nnKB8rBWdV2nOTCQruvRdR25rkPXdQau65xcIV/Xket63J2tI9d1OPxaR67r0HUduc5z8dS6ruPT6rg7W0eu69B1HQ+/FHBdp7qu1wxrpesGdF1PruvRdb2B63pyXY+u651coQ6sJ9cNWAfWk+t6dF1Prp9hvq4n17omcF1PruvRdT25dsF8Xa+6btAMa6XrRnTdQK4b0HWDgesGct2IdWCDUx3w0rpucHKFOrCBXDeg6wZyTVUgXzeQq8X2hB2uG8h1A7puINfFmK8bVNeNmmGtdN2ErhvJdSO6bjRw3ejkCvm6kVw3YR3YSK4bsQ5sJNeNjufmZZ+Mrhsd7N72yT40voL91kZy3YiuG8k1BYdfG1XXTZphrXTdjK6byHUTum4ycN1ErpvQdRO5bkbXTeS6CV03kesmzNdN5Pq8CcYDm8i1OtbXTeS6CV03kWssjrM2qa6bNcPaIcJ1C7puJtfN6LrZwHUzuW5G183kugVdN/Nljui6mVw3o+tm/tguum4m18WYr5vJdTO6bubbpaHrZtV1i2b8Kl23ousWct2CrlsMxq9byHULum4h163ouoVct6DrFnLdgq5b+G12Fzi83eL08VLI1y3kugVdt/BxAY5ft6iuWzXjV+m6DV23kutWdN1qkK9byXUrum51coX91lZyjXfIeNono+tWdN1Krr3wuGAruW5zbFMf+2RfWjVw3UquVzBft6qu2zTjV+m6HV23kes2dN1m4LqNXLeh6zZy3Y75uo1ct2G+biPXbei6jVyP4XhgG7muw3zdRq7b0HUbuR52Addtqut2zfhVuu5A1+3kuh1dtxu4bifX7ei63ckV8nU7n44xe2pdt5PrdnTdzn/vFuvAdnLdgfm6nVy3o+t2ci2DdWC76rpDM36VrjvRdQe57kDXHQauO8h1B7ruINcd6LqDXPe6QL7uINedDhkv+2Rv6hxcdzi5Qr7uINfrjrl97ZOpvprAdYfqulMzfpWuu9B1J7nuRNedBq47yXUnuu4k111YB3aS606sAzudXCFfd5LrBMzXneSabYLzWTvJdSfm605yvY51YKfqukszfpWuu9F1F7nuQtddBq67yHUXuu5ycoXj2F3kuhuPY3fx5QvouotcV5jgOHYXufphvu7iN7rRdRe5foCuu1TX3Zrx69AMeSIBXHeT62503W3guptcd6PrbnLdg/m628kVjmN3k+tudN1Nrrvx/MBuct2ErrvJdTe67ibXHni8tVt13aMZv0rXvei6h1z3oOseA9c95LoHXfeQ61503UOuTbAO7CHXPei6h1xnmaEO7CHXvlgH9pDrHnTdQ67t0HXPf/w263t1LqPepxPbrxM7oBM7qBM7pBM7rBM7ohM7qhM7phM7rhM7oRPL14md1Imd0omd1okV6MTO6MQKdWJndWLndGLndWIXdGIXdWKXdGKXdWJXdGJXdWJFOrFrOrHrOrEbOpfn79Uch8n6sA/rw16qD3uxPuw1qA97qT7sxfqw16k+wPhrL9WHCBPUh71UH/ZifdhL9WEvjr/2Un3Yh+PavVQf9mJ92Ev1YS3Wh71q3d2nOQ6TrvvRdR+57kPXfQau+8h1H7ruI9f9WHf3kWsjBY4X9pHrPnTdR67pOP7a5+QK+7N95LoPXfeR6xA8vt2nuu7XHIdJ1wPoup9c96PrfgPX/eS6H133k+sBdN1PrvtxnLCfXPej635y3Y/jhP3kWmCC81z7yXU/uu4n10Z4vnu/6npAcxwmXQ+i6wFyPYCuBwxcD5DrAXQ94OQK49oD5HoQx7UHyPUAuh5w+nOC4HqAXA/g+98HyPUAuh4g1y/x+PaA6npQcxwmXQ+h60FyPYiuBw1cD5LrQXQ9SK4H0fUguR5C14PkehBdD5LrCTwfc5D/fDu+73WQXA+i60FynWiGy44Oqq6HNMdh0vUwuh4i10PoesjA9RC5HkLXQ+R6CF0PkethdD1ErofQ9RC5nsTzh4fI9SDm6yFyPYSuh8h1pwu4HlJdD2uOw4YJ1yPoephcD6PrYQPXw+R6GF0Pk+sRrK+HyXUM7rcOk+thdD1MrqfxfYTDfLta3G8dJtfD6HqYXKfg8e1h1fWI5jhMuh5F1yPkegRdjxi4HiHXI+h6hFyPousRp+s1wPUIuR5B1yPkegePw46Q6xF0PUKuR9D1CLluwfNcR1TXo5rxq3Q9hq5HyfUouh41cD1KrkfR9aiTK9SBo+R6DOvAUXI9iq5HyfUojl+P8vszeHx7lFyPoutRfj/RBOOBo6rrMc34VboeR9dj5HoMXY8ZuB4j12Poeoxcj2O+HnNyheOCY+R6DF2POb2PAK7HyDUJ3088Rq7H0PUY/5lxHA8cU12Pa8av0vUEuh4n1+PoetzA9Ti5HkfX4+R6Al2Pk+txdD1OrsfR9Ti51nSB+nqcXD9E1+Pkehxdj5Pr+5ivx1XXE5rxq3TNR9cT5HoCXU8YuJ4g1xPoeoJc89H1BLmeQNcT5HoCXU/w+4noeoJce2B9PUGuJ9D1BLm+jK4nVNd8zfhVup5E13xyzUfXfAPXfHLNR9d8cj2Jrvl8O3B0zSfXfHTNJ1cTjgfyyXU/uuaTaz665pNrIdaBfNX1pGb8Kl1PoetJcj2JricNXE+S60l0PenkCvutk+R6CvdbJ8n1JLqedLoeDlxPOr3/Da4nyfUkup4k1yp4PdxJ1fWUZvyaJVxPo+spcj2FrqcMXE+R6yl0PUWupzFfTzm5Qr6e4svm0fUUudbAfD3l9HEEqK+nyPUUup4i11DM11Oq62nN+FW6FqDraXI9ja6nDVxPk+tpdD1NrgXoeppcT+N5l9PkehpdT/NxAZ53OU2uGzFfT5PraXQ9Ta4WrK+nVdcCzfhVup5B1wJyLUDXAgPXAnItQNcCcj2DrgXkWoD5WkCuBehaQK7JuN8qINc9mK8F5FqArgX8/gyeJyxQXc9oxq/StRBdz5DrGXQ9Y+B6hlzPoOsZci1E1zPkegZdz5DrGXQ9Q64H8fMcZ8jVF/P1DLmeQdcz5FoWXc+oroWa8at0PYuuheRaiK6FBq6F5FqIroXkehZdC8m1EF0LybUQXQvJtRCPCwrJ9Qy6FvLxlgtcr1FIriOxvhaqrmc141fpeg5dz5LrWXQ9a+B6llzPoutZcj2HrmfJ9Sy6niXXs+h61umD3pCvZ8m1EF3PkutZzNez5LoGzw+cVV3Pacav0vU8up4j13Poes7A9Ry5nkPXc+R6Hl3PkWtbPO9yjlzPoes5vm4L68A5vv0nup4j13Poeo7HA1gHzqmu5zXjV+l6AV3Pk+t5dD1v4HqeXM+j63lyvYCu58n1PI4HzpPreXQ9T66v4Hnt8+R6Hl3Pk+t5dD1Prm+g63nV9YJm/DpcuF5E1wvkegFdLxi4XiDXC+h6wckV3o+9QK4X0PUCuV5A1wtOH/8G1wvkehHfj71ArhfQ9QK5voTvb11QXS9qxq/S9RK6XiTXi+h60cD1IrleRNeL5HoRXS+S6yU83rpIrhfR9SK5rsH6etHJFfL1IrleRNeL/GfYMF8vqq6XNONX6XoZXS+R6yV0vWTgeolcL6HrJXK9jHXgkpMr7LcukesldL1Ertdx/HrJ6TgWzr9eItdL6HqJXH/C/dYl1fWyZvwqXa+g62VyvYyulw1cL5PrZXS97OQK+XqZXC9jHbhMrlfwutjL5HoZx1mXyfXvZnC9TK6X0fUy31YVb1dwWXW9ohm/Ster6HqFXK+g6xUD1yvkegVdr5DrVczXK+R6BfP1ipMr5OsVci2L44Er5BqHdeAKuV5B1yvk2hHHr1dU16ua8at0LULXq+R6FV2vGrheJder6HqVXIvQ9Sq5XkXXq+R6FV2vkutVzNerTte7wHHsVXK9iq5XydUHz2ddVV2LNONX6XoNXYvItQhdiwxci8i1CF2LyPUauhaRaxG6FpFrEboW8fvceD6riFzfwDpQRK5F6Frk9DlEyNci1fWaZvwqXa+j6zVyvYau1wxcr5HrNXS9Rq7X0fUauV5D12vkeg1dr5HrapOf1vUauWZiHbhGrtfQ9Rr/2UDcb11TXa9rxq8jhOsNdL1OrtfR9bqB63VyvY6u18n1BrpeJ9fruN+6Tq7X0fU6uY7B+nqdXD8zg+t1p89zgOt1/rOBeJ7wuup6QzN+la430fUGud5A1xsGrjfI9Qa63nByhfHADXINMMFx7A1yvYGuN8j1BtbXG+R6E48LbpBrewecr30y3b4I68CN//ht1m/qXG97Syf2nE7stk7seZ3YHZ3YCzqx/8PafUBXUX77/z+Flh46olJEVBQpKlJUpAkKClhRUERAlKL03kXBhmIFpStKE8WGKKgQUoDQO4QSOoTeO/zz3HPOZN6fmfmv5ffHumvddd1jTO5r77PnKTPPSXOJLXaJLXGJLXWJpbvElrnElrvEVrjEVrrEVrnEVrvE1rjE1rrE1rnE1rvENrjENrrENrnENrvEtrjEMlxiW11i21xi211iO1ye415gm4eZ/rCQ/WGB9IcF7A8LPPrDAukPC9gfFkh/WMD9xAXSHxZyfrtA+sMC9ocF0h+SOE5YIP1hQgDjrwXSHxaw7y6Q/vAJn9taYPXdhbZ5mHFNoutCcV1I14UergvFdSFdF4prEu9nCx3zMPTdheK6kK4LHc/Hw3WhuC7kOGGhuC6k60JxrcC+u9ByTbLNw4zrIromiWsSXZM8XJPENcnuWs/8o+2v82X/Uv+1Cr562T/ldtpmdjy4IPt/5XGctpkkCUgKESaFT9tMyu6iMTG+qOty2maSZDMplM2k8Gmb5nfFxv7//K7/ctpmkn7kQvf7pPBpm0nZ1nHxvmi3IzOT9LWrUNkkhasqScomKVQ2SeETNZOye1pCgq+E40TN0ubfRM5SsysqxuQm2uQmIXR8ZpJVV4ts81BTV8msq0VSV4tYV4s86mqR1NUi1tUiqavkUF0t8qirRaauFrnU1SKpq0U5dRW6LC9oBGMjpRC6zOzNCMbbU7DIsfEaw8vM0KKcDJk0LJI0RAf/Lw2LTBoWRdKwyEpDsm3aatKQwjQkSxqSmYZkjzQkSxqSmYZkRxpiTBqSPdKQbNKQ7JKGZElDSqj9RtKQLGlIzvlEhi4zDcdzPkShy0zDRb3MNCQzDcmShn9Dn4Zkk4bkSBqSrTSk2Ga5Jg2pTEOKpCGFaUjxSEOKpCGFaUiRNKSE0pDikYYUk4YUlzSkSBpSmYYUSUMK05Aiaagcml5EnFMkDX/643g5Qb7WAmlIkTS09P9fGlJMGlIiaUix0pBqmxS/XsucCow0pEoaUpmGVI80pEoaUpmGVElDaigNqR5pSDVpSHVJQ6qkIY1pSJU0pDINqZKGOUxDqqThXzalVElDKtOQKmkYFmpKqSYNqZE0pFppSLPNoU0aFjMNaZKGtFAa0sJH5KdlT87/8xH5aR65S5PcpYVylxY+It/8rutyRH6ajCTTQt0mLXzkuPk90dG+Wv/LkeNpUhen/LH2ukiTukhjXaTpKmBoATQtPNQwf1hcnK+W21AjTWpmcagg08IHe5sfjY/3+tEE4bDVk7nM0euW0CpXWvj0bvNfTkz01XKc3p1mldhi2zTMlNgSlthiKbHFOSVmqmWxR7UslmpZnFMtocvRsgnqjyQ5dJmJWuxDohZLohYzUYslUZtyEhW6HC8PuMREkhG6nCC5AvhiAX8kB9y4LrZcl9imYcZ1KV2XiOsSui7xcF0irkvousThGmN3XSKuS9kYl4jrEroucSx/wXWJuJ6OfHDjw5cT5E+D6xJxvTcA1yWW61LbNMy4ptN1qbgupetSD9el4rqUrkvFNZ31utThinpdKq5L6bpUXNfQdam4fuZLsLsuFdeldF2q3zYahOtSyzXdNg0xrsvomi6u6XRN93BNF9d0uqY7XFGv6eK6LMSeHp61Zv+0P3vWWuu6zFrTJUnpoSSlh2et5ndlz1prXZdZa7pk/JHIRyUufDlehnL4JKVLxtOZ8XTJeE1+ktKtjC+zzXhMxpcz48sk48uY8WUeGV8mGV/GjC+TjC/Lub2HLmvG4yMZD11mkpZHCiI2fDlOvqoUn6Rl4vquD51/mbguo+sycV3Mzr/Mcl1um8IY1xV0XS6uy+m63MN1ubgup+tycV3BDrVcXDNCGx8R1+UO13i763LdsGe9Lnecgw/X5eK6nK7LxbVY5HYdcl1uua6wzUnaZ7uuDLmasDkHf4Uvzu9znoO/QrhXkHuFB/cK4V5B7hXCvZLcK4Q7b6gQI9wrhHsFuVcI91ss4xXC/Q+5Vwj3CnKvEO5U3hBWWNwrbXMPw70qhzt0ma4r6brSw3WluK6k60pxXUXXleK6MlSIEdeV4rqSrivFdT9dV4rrLX603ZXiupKuK8X1kg+uKy3XVbYBt3FdTddV4rqKrqs8XFeJ6yq6rnK44ka7SlxX59xoQ5fpuoquqxzn4CfYXVfpe39BuK4S11V0XaVfQ8+2u8pyXW0bcBvXNXRdLa6r6braw3W1uK6m62pxXU3X1eK6hq6rxXU1XVeLa/PIfzwufDlexgFwXS2uq+m6Ws9X8KHtrrZc19gG3MZ1LV3XiOsauq7xcF0jrmvoukZc17IPrHG4og+sEdc1dF0jrl/5Ua9rxDVP5E+LD19OkOE6XNfoOc0cfq2xXNfaBtzGdR1d14rrWrqu9XBdK65r6bpWXNfRda24rvXhvrVWXNfSda24ruUwYa2jXuPsrmvFdS1d14rrCfaBtZbrOtuw1riup+s6cV1H13UeruvEdR1d1zlc0QfWies6uq4T13V0XSeu6yNJiwtfjpffjQniOnFdR9d1eg5A5K4Xcl1nua63DWuN6wa6rhfX9XRd7+G6XlzX03W9uK7ndGG9uCbTdb24buB0Yb3DFX1gvbhOCqBe1zu+byjO7rpeXMuyXtdbrhtsw9oO2a4b6bpBXDfQdYOH6wZx3UDXDeK6kX1gg7huYH/d4HBFvW4Q18McZ21wvJeC+9YGcd3Aet0grj3YXzdYrhtt41fjuomuG8V1I103erhuFNeNdN0orpvoulG/5o2uG8V1I103imsBum7U51CDmBdsFNeNdN0ors1Zrxst10228atx3UzXTeK6ia6bPFw3iesmum4S18103SSum9gHNonrJrpu0gVj3rc2ieuuIPrAJnHdRNdN4joggHHWJst1s238aly30HWzuG6m62YP183iupmum8V1C103i+tmum4W18103Syuw+i6WVxXsw9sFtfNdN0srnP9cN1suW6xjV+NawZdt4jrFrpu8XDdIq5b6LrF4Yr71hZxrRFAH9girlvoukVcD/C+tUVcM3J2m0KXE+RPg+sWPceK6wNbLNcM2/jVuG6la4a4ZtA1w8M1Q1wz6JohrhkcZ2WI61bOtzLENYOuGeL6BudbGQ5X9IEMcc2ga4a4DgxinJVhuW61jV+N6za6bhXXrXTd6uG6VVy30nWruG5jH9jqcEUf2CquW+m6VVy3sg9s1fsW17O2iutWum7V5/w5HthquW6zjV+N63a6bhPXbXTd5uG6TVy30XWbuG6n6zZx3cbxwDZx3UbXbeIaDGA8sE1cq7Net4nrNrpuE9dCXJbdZrlut41fO2a77qDrdnHdTtftHq7bxXU7Xbc7XNEHtovrDvaB7eK6na7bxfUPbsht1/kW1wm3i+t2um4X1/YcZ223XHfYxq/GNZOuO8R1B113eLjuENcddN0hrpms1x26/hpEve4Q1x103SGuTei6Q1x3sA/sENcddN2h76dx/XWH9f7E+UrW+xOBEf7Q/7QJv09x8j+cg5/p8pz7TpfYLpfYbpfYHpfYXpfYPpfYfpfYAZfYQZdYlkvskEvssEvsiEvsqEvsmEvsuEvshEvspEvslEvstEvsjEvsrEvsnEvsvEvsgkvsokvskkvsskvsikvsqkvsmsv7E5m2eZjpDzvZHzKlP2SyP2R69IdM6Q+Z7A+Z0h92sj9kSn/I5DghU/pDM1+MvT9kSn/I5DghU/pDJvtDpvSHzFB/yAw/sJ3pK+lPSPDVcjywbX6SrWMMpxKZVkveaZuiGfJdJN8p5DtJvtODfKeQ7yT5Tgc5bnU7hXwXb3U7hXwnW/JOIY/nkHenkG/mFG2nkO/MIQ9dlq8q49Bsp+W6yzZFM6676bpLXHfRdZeH6y5x3UXXXeK6m6W8y+GKW90ucd1F1136FcZ03aXP9HCpZpe47qLrLv1KBw7Ndlmuu21TNOO6h667xXU3XXd7uO4W19103e1wRb3uFtc9rNfd4rqbrrsdRzZi6rtbXN/is327xXU3XXeL61fsA7st1z22KZpx3UvXPeK6h657PFz3iOseuu4R1z1cUtjj+MpttN494rqHrnv0GbTQmxgR1z3iupdLCnvEdQ9d94hrNw5591iue21TNOO6j657xXUvXfd6uO4V17103Suu+9gH9orr5ACenNkrrnvpuldc7+WzqHvF9W/e0vaK61667hXXsVyq2Wu57rNN0Tplu+6n6z5x3UfXfR6u+8R1H133OVzRB/aJ6372gX3iuo+u+8Q1kVPffXpUmx+u+8R1H133iWt11us+y3W/bYpmXA/Qdb+47qfrfg/X/eK6n677xfUA63W/Y+qL+9Z+cd1P1/36iAz7635x3c963S+u++m6X1yLBBPtrvst1wO2oa1xPUjXA+J6gK4HPFwPiOsBuh4Q14N0PSCuB9hfD4jrAboecCzZYmh7QFyLcUnhgLgeoOsBcR3PLYYDlutB2/jVuGbR9aC4HqTrQQ/Xg+J6kK4HxTWLrgfF9SDr9aC4HqTrQXE9yHo9qI90sV4PiutBuh7UlyvoetByzbKNX43rIbpmiWsWXbM8XLPENYuuWeJ6iK5Z4ppF1yxxzaJrlrju5X0rS1ybsF6zxDWLrlniGsOlmizL9ZBt/GpcD9P1kLgeouuhbFej2VNcD4nrIboecrhinHVIXA+xDxwS10N0PSSuqUH0gUPiepjjrEPieoiuh8R1Pe9bhyzXw7bxq3E9QtfD4nqYroc9XA+L62G6HhbXI6zXw+I6mFtih8X1MF0Pa3/lI12HHa7oA4fF9TBdDzv6K1wPW65HbONX43qUrkfE9Qhdj3i4HhHXI3Q9Iq5H6XrEsXWD8esRcT1C1yPieoSPHBzRI/DoekRcj9D1iB6Rz3o9YrketY1f38h2PUbXo+J6lK5HPVyPiutRuh51uGL8elRcj3H8elRcj9L1qLhe9GN94Ki4HqDrUXE9Stej4nqej3YetVyP2cavxvU4XY+J6zG6HvNwPSaux+h6TFyPs16POVzRX4+J6zG6HhPXYxxnHRPXWXxU7pi4HqPrMXH9ifOtY5brcdv41bieoOtxcT1O1+MersfF9ThdjztcUa/HxfUE6/W4uB6n63FxbUfX4+JahfV6XFyP0/W4uDbmOOu45XrCNn41rifpekJcT9D1hIfrCXE9QdcT4nqCrifE9SRdTzjWX2PtrifE9bEA1l1OiOsJ1usJcT1B1xPiWp594ITletI2fjWup+h6UlxP0vWkh+tJcT1J15Pieop94KS4juD49aS4nmS9ntRHvDl+PSmuJ1mvJ8X1JF1Pimss+8BJy/WUbfxqXE/T9ZS4nqLrKQ/XU+J6iq6nHK6o11Piepr1ekpcT9H1lLiO53zrlKNeMS84Ja6n6HpKXAvQ9ZTleto2fjWuZ+h6WlxP0/W0h+tpcT1N19Pieob1elpcfUGMs06L62m6nhbXPVzPOu14txr1elpcT9P1tLhO4/j1tOV6xjZ+Na5n6XpGXM/Q9YyH6xlxPUPXMw5X1OsZcT3Lej0jrmfoekZcM3jfOiOucziPPSOuZ+h6Rlxzc/x6xnI9axu/vpnteo6uZ8X1LF3PerieFdezdD0rrmfpelZcz9H1rLiepetZca0fxPj1rL5CE4DrWXE9S9ez4tqO962zlus52/jVuJ6n6zlxPUfXcx6u58T1HF3Pies5up5zuGL8ek5cz9H1nLie56se58S1K/vAOXE9R9dz4tqd9XrOcj1vG78a1wt0PS+u5+l63sP1vLiep+t5cb3A/npeXM9zPHDecagPxlnnxfXlAO5b58V1JV3Pi+t5up4X13Lsr+ct1wu28atxvUjXC+J6ga4XPFwviOsFul5wuKJeL4jrRfaBC+I6NPImc2z4Ml2L8ZGuC+Lalo8gXhDXC3S9IK630PWC5XrRNn41rpfoelFcL9L1oofrRXG9SNeL4nqJ9XrR4Yo+cFFcL7IPXBTX4nx+4KK4JvG+dVFcL9L1orjWZh+4aLleso1fjetlul4S10t0veTheklcL9H1krhepuslcb3EPnBJXC/R9ZK4LuB61iVxrcDnMi6J6yW6XhLXJD6XcclyvWwbvxrXK3S9LK6X6XrZw/WyuF6m62VxvULXy+J6ma6XxfUyXS+L6xn218vi2oyul8X1Ml0vi2syXS9brlds41fjepWuV8T1Cl2veLheEdcrdL0irlfpekVcz7APXBHXK3S9Iq5XON+6Iq5XeN+6Iq5X6HpFXIN83uWK5XrVNn7tnO16ja5XxfUqXa96uF4V16t0vSqu1+h6VVyvsl6viutVul517HNjXnBVXK/yvnVVXK/S9aq4JrJer1qu12zjV+OaDWZ3vSau1+h6zcP1mrheo+s1cfX54XpNXK/R9Zq4XqPrNf1KB/aBa+I6k67XxPUaXa+J6zscD1yzHvEe+39H5Hf/fz4iPxva8Siu3yUWcIkFXWK5XGK5XWJ5XGJ5XWL5XGJRLrFol1iMSyzWJRbnEot3iSW4xBJdYvldYgVcYgVdYoVcYoVdYkVcYkVdYsVcYje4xIq7xG50id3kErvZJVbCJVbS73zE29RfZB5m+oOf/cH8c2t8ktEfsj8Urv0h+19Df/D50R+y/1G+bRz9wefX5zWwzuXzsz/4/OgPPj/7w1jOF7L/belNuJ/5/AlyGf0h+x/5XAHXD33+SN/157i2Mq4BuvrF1U9Xv4erX1z9dPU7XDEP84trwI95mF9c/XT1i2sN7n/7xfUU12X94uqnq19cB9HVb7kGclyHGNcgXQPiGqBrwMM1IK4BugbENUDXgLgG6RoQ1wBdA+LakOuyAXFtyXlYQFwDdA2I63ofnocLWK7BHNdJxjUXXYPiGqRr0MM1KK5BugbFNRf7QFBcm/BEuaC4BukaFNfG3J8J+vWrMtAHguIapGtQXDdwfhu0XHPluC4wrrnpmktcc9E1l4drLnHNRddc4pqbrrn8Or+Fay5xzUXXXOKaj/OFXOKai/01l7jmomsucY2iay7LNXeOa6ZxzUPX3OKam665PVxzi2tuuuZ2uOK5rdx+PeIM87Dc4pqbrrnFdQn7QG5xzePHc1u5xTU3XXOLaxr7a27LNU+Oq69LLXOsIFzziGseuubxcM0jrnnomkdc89A1j7huCP3xEdc84pqHrnnE9QG65hHXvHTNI6556JpHXD+max7LNW+Oa6JxzUfXvOKaN+RqwuaY9bz++v/9mPW8HsnIK8nIG0qGCZtj1s3vui7HrOeVrOYNdQITNsesm9/zvx6znlcqIh/vuHmlIvKyIvJKRewMfU5N2JyVbv4wr2PW80q1+EOVasKRH/U6Zj2vVFJeVlJeqaTKoc5nwuaYdfNfdj1mPa9VYvlySqyUKbEollg+KbF8OSVmqiWfR7Xkk2rJl1MtocvR0rD9kSSHLmuiMNXPJ4nKx0Tlk0S1DlqJCl1mMur7YiLJCF0meD6C5xPwKQEL3Ljms1yjclwrGddoukaJaxRdozxco8Q1iq5RDtcYu2uUuEbzAxAlrlF0jRLXUz64RonrebpGiWsUXaPE9Q8fXKMs12jb1NO4xtA1Wlyj6Rrt4RotrtF0jRbXaLpGO1xxC48W12i6RotrTOTDEBe+TNc2wVi7a7S4RtM12q/fPh5nd422XGNyXJsa11i6xohrDF1jPFxjxDWGrjHiGkPXGHGNCbmasDn6PMbf8Podsx4jSYoJJcmEI7/ruh2zHiMZj2XGYyTj0X5kPEYyHsOMx0jGC/uR8Rgr47G2xQaT8ThmPFYyHsuMx3pkPFYyHsuMx0rGY5nxWMl4XEjGZDx0mUmKzUlS6DJdb438x+PCl3XQBtdYcY2la6y4/kLXWMs1Lse1i3GNp2ucuMbRNc7DNU5c4+gaJ67xvKPGieve0DpLxDVOXOPoGieucZFRRlz4crxcRuePE9c4usaJ62neUeMs13jbIo5xTQi5mrA5Zj3e/4TbMevxwh1P7ngP7njhjid3vIMbZRwv3Aks43jhjid3vHDHkzteuOMjhRgfvpwgl8EdL9yxkQ9BiDve4k7I4R5luBNzuEOX6ZpA1wQP1wRxTaBrgrgmsowT/Lq3FmN3TRDXBLomiOsXdE1wuKI9JIhrAl0TxPVplnGC5ZpoWzMzrvnpmiiuiXRN9HBNFNdEuiY6XGPtroniesQP10RxTaRrog4MAxgYJopr/khO48OXE+RPg2uiuM4OwjXRcs2f4zrbuBaga35xzU/X/B6u+cU1P13zi2sB1mt+cc3vR9vNL6756ZpfXKezXvOL6zkf6jW/uOana35xrcR6zW+5FrCtRRrXgnQtIK4F6FrAw7WAuBagawGHK+q1gGNPAq4FxLUAXQuI66wAhgkFxLUg67WAuBagawFx3eGHawHLtWCO6yrjWoiuBcW1IF0LergWFNeCdC0orgV53yoorgVzBtyhy3QtSNeC4lqIw9qCOvwKYphQUFwL0rWguPZmvRa0XAvZ1niNa2G6FhLXQnQt5OFaSFwL0bWQuBZmHygkroVYr4XEtRBdC4nr8gD6QCG/fg0qXAuJayG6FhLXfuyvhSzXwjmux41rEboWFtfCdC3s4VpYXAvTtbDDFfVaWFyLcJxVWFwL07WwuJb1475VWFyPhH464lpYXAvTtbC45mG9FrZci9jWzrtmuxalaxFxLULXIh6uRcS1CF2LiGtR1msRcd0YxHigiLgWoWsRcX2a44Ei4lqE04Ui4lqErkXE9SD7axHLtaht7dy4FqNrUXEtSteiHq5FxbUoXYuKazG6FhXXouwDRcW1KF2LiutKuhYV10XsA0XFtShdi4prZ/aBopZrMduCsXG9ga7FxLUYXYt5uBYT12J0LeZwRR8oJq43sA8UE9didC0mrvsiA6m48OV4GfhjnFVMXIvRtZi4DufCZjHL9QbbgrFxLU7XG8T1Brre4OF6g7jeQNcbxLU46/UGv76bG293vUFcb6DrDeK6if31BnG9gX3gBnG9ga43iOvzdL3Bci1uWzA2rjfStbi4FqdrcQ/X4uJanK7FxfVGuhb36zsjcC0ursXpWlxc+3NeUFxci9O1uLgWp2txcR3J/lrccr3RtmBsXG+i643ieiNdb/RwvVFcb6TrjQ5XzAtuFNcbOX69UVxvirSJ2PBlui5kH7hRXC9F7ujx4csJ8qfB9UZxLcv+eqPlepNtWda43kzXm8T1Jrre5OF6k7jeRNebxPUmut4krtO4fHiTuN5M15vENYn3rZvEdTr7603iehNdbxLXURxn3WS53mxbljWuJeh6s7jeTNebPVxvFteb6XqzuJZgH7hZXG9mvd7scEUfuFlcs3yYx94srjezD9wsrjfT9WZxnRzAcvfNlmsJ27KscS1J1xLiWoKuJTxcS4hrCbqWENeSdC0hriU4ziohriXoWkJcZ/C+VcKvZ8/CtYS4lqBrCd2xZ72WsFxL2tZfjWspupYU15J0LenhWlJcS9K1pLiWomtJce3B9deS4lqSriV1/ZUbyCXFtSTrtaS4lqRrSXHNDJ3hF3Et6Y88g/9gReuYdet//pdj1ku5PCtd2iV2i0usjEvsVpdYWZfYbS6x211id7jEyrnE7nSJ3eUSK+8Su9slVsElVtElVsklVtkldo9L7F6X2H0usSousftdYlVdYtVcYtVdYjVcYg+4xB50iT3kEqvpEnvY5Rn8UrZ9BNMfSrM/lJL+UIr9oZRHfygl/aEU+0Mp6Q+l2R9KSX8oxb5bSvpDKfaHUtIfVrHvlpL+MI99t5T0h1Kh/mDC5pj1Uv6XvY5ZLyWtowOHvKWsllzatsVgyG8heWkhL03y0h7kpYW8NMlLC/ktJC8t5KU5hCgt5KVJXlrIS/sx5C2tt7oAhmalhbx0DnnoMl37BzGEKG253mLbYjCuZeh6i7jeQtdbPFxvEddb6HqLuJah6y26BOaD6y3iegtdbxHX7SzlW/z6jc4o5VvE9Ra63iKuAdbrLZZrGdsWg3G9la5lxLUMXct4uJYR1zJ0LeNwxVJNGXG9lUs1ZcS1DF3LiOuNfMKjjLiW4dZ4GXEtQ9cy4vo7n/AoY7neattiMK5l6XqruN5K11s9XG8V11vpequ4lmW93iqu33GKdqu43krXW/UZNE4lbhXXW/2Y+t4qrrfS9VZxzRfEIwe3Wq5lbVsMxvU2upYV17J0LevhWlZcy9K1rLjeRtey4vp1EK5lxbUsXctqvXLIW1Zcy7IPlBXXsnQtK65TuQRW1nK9zbbF0C3b9Xa63iaut9H1Ng/X28T1NrreJq630/U2cc0I/fER19vE9Ta63iau47gEdpu43kbX28T1NrreJq63cop2m+V6u22LwbjeQdfbxfV2ut7u4Xq7uN5O19vF9Q663i6ut3MIdru43k7X28V1chCut/v1tX6MB24X19vperu4LuJ963bL9Q7bFoNxLUfXO8T1Drre4eF6h7jeQdc7xLUcXe8Q1zvoeof2gcjMODZ8OU6SBtc7dKuRrneI6x10vUNcpwfQX++wXMvZthiM6510LSeu5ehazsO1nLiWo2s5cb2TruXE9WPet8qJaznWazlxHcGt8XLiWo59oJy4lqNrOXE9x3otZ7neadtiMK530fVOcb2Trnd6uN4prnfS9U5xvYuudzoePcJSzZ3iOivCHhu+TNen6HqnuN5J1zvF9U663imufi6F32m53mXbYjCu5el6l7jeRde7PFzvEte76HqXuJan613iepT1epe43sV6vUtfL+W84C5xvYuud4nrXXS9S1xr8751l+Va3rbFYFzvpmt5cS1P1/IeruXFtTxdyztcMS8oL653c15QXlzL07W8uH7J8Wt5cS3PeUF5cS1P1/Li2pVL4eUt17ttWwzGtQJd7xbXu+l6t4fr3eJ6N13vFtcKrNe7xbUtl2zvFte76Xq3uJ5gvd4trnezXu8W17vpere43sLx692WawXbFoNxrUjXCuJaga4VPFwriGsFulYQ14p0rSCuFTgeqKBbuAH01wri+hDfUasgrsd9qNcK4lqBrhX0kQPetypYrhVtWwzGtRJdK4prRbpW9HCtKK4V6VrR4Yo+UFFcK7EPVBTXiqzXivrofCDe7lrR0V8xzqoorhXpWlFc32UfqGi5VrItzRrXynStJK6V6FrJw7WSuFaiayVxrcx6reRwRb1WEtdKdK0krm9yC7eSY5wF10riWomulcR1JftAJcu1sm391bjeQ9fK4lqZrpU9XCuLa2W6VhbXe+haWVzT2F8ri2tlulYW1/Qg1l8ri2tl9tfK4lqZrpX1ERnWa2XL9R7b+qtxvZeu94jrPXS9x8P1HnG9h673iOu9dL3Hsf4K13vE9R663iOuo4IYD9wjrvdwPHCPuN5D13vE9Rn213ss13tt66/G9T663iuu99L1Xg/Xe8X1Xrre63DFoxz3iuusAB49uldc7+OjHPeK61yOs+4V14rsA/eK6710vVdc57Be77Vc77OtvxrXKnS9T1zvo+t9Hq73iet9dL1PXKuwXu8T1/vYX+9zuKJe7xPXnlwfuM+xrg3X+8T1PrreJ64N2V/vs1yr2NZfjev9dK0irlXoWsXDtYq4VqFrFYcrxgNVxPV+jgeqiGsVulYR19u4v1VFXKuwD1QR1yp0rSKuv7IPVLFc77etv3bPdq1K1/vF9X663u/her+43k/X+8W1Kuv1focr9rfuF9f76Xq/uN5P1/vFtRDvW/eL6/10vV9cx3Df8H7Ltapt/dW4VqNrVXGtSteqHq5VxbUqXauKazW6VhXXquwDVcW1Kl2rimsj7hdUFdcWPAugqrhWpWtVnW9x3aWq5VrNtv5qXKvTtZq4VqNrNQ/XauJaja7VxLU6XauJa0m6VhPXanStJq6dOd+qJq7VWK/VxLUaXauJ6+d0rWa5VretvxrXGnStLq7V6Vrdw7W6uFana3VxrUHX6uK6hq96VBfX6nStLq7fs16ri2spulYX1+p0ra77sbxvVbdca9jWX43rA3StIa416FrDw7WGuNagaw1xfYCuNcS1Buu1hrjWoGsNca3DfZgajvVXvJpUQ1xr0LWGvqLIdcIalusDtvVX4/ogXR8Q1wfo+oCH6wPi+gBdH3C4YjzwgLg+wPvWA+L6AF0fENcH+YriA+K6i8+7PCCuD9D1AXF9iWetPGC5PmhbfzWuD9H1QXF9kK4Perg+KK4P0vVBcX2I9fqguD7Ien1QXB+k64MOV9Trg471V7g+KK5Ph7pzxPVBcX2K46wHLdeHbOuvxrUmXR8S14fo+pCH60Pi+hBdH3K4ol4fEteaHL8+JK4P0fUhcV3P+dZD4hrL8etD4voQ6/UhcZ3PcdZDlmtN2/qrcX2YrjXFtSZda3q41hTXmnStKa416VpTXB+ma01xrUnXmuI6ia41xXUMHzWsKa416VpTH0Xmfaum5fqwbf3VuNai68Pi+jBdH/ZwfVhcH6brw+Jai33gYYcr+uvD4vowXR8W14fZBx4W15EcDzwsrg/T9WF9njCSlZDrw/7rfcx6LZdHcWu7xOq4xOq6xOq5xB5xidV3iTVwiT3qEnvMJdbQJdbIJfa4S+wJl1hjl1gTl1hTl9iTLrGnXGJPu8SecYk96xJ7ziXWzCX2vEvsBZdYc5dYC5fYiy6xl1xiLV1iL7s84l3Lto9g+kNt9oda0h9qsT/U8ugPtaQ/1GJ/qCX9oTb7Qy3pD7U4Tqgl/aEW+0Mt6Q+12B9qSX+oxftZLcf8NsbeH2pJf1jK9cNaVt+tbdtHMK516FpbXGvTtbaHa21xrU3X2g5XrMvWFtfa7Lu1xbUO12Vri+u9fux71RbX2uy7tcW1NvtubT2Ch+Pa2pZrHds+gnGtS9c64lqHrnU8XOuIax261hHXuqzXOuJah651HK6o1zp6bDWfN64jrnXoWkdc69C1jrhu5DysjuVa17aPYFzr0bWuuNala10P17riWpeudcW1Hl3rius47s/UFde6dK0rrnXZB+qKa1261hXXunStK64LOK6ta7nWs+0jGNdH6FpPXOvRtZ6Haz1xrUfXeuL6CF3r6T4tnzeuJ6716FpPXL/l8xr1xLUeXeuJaz261tOzbzkPq2e5PmLbRzCu9en6iLg+QtdHPFwfEddH6PqIwxX99RE9vp7Pwz0iro/Q9RFxPcnn4R7RM4V5ZNQj4voIXR8R17fp+ojlWt+2j9Aj27UBXeuLa3261vdwrS+u9elaX1zr07W+uK5gvdYX1/p0ra/vH3Fdtr64NqBrfXGtT9f6um7Addn6lmsD2z6CcX2Urg3EtUHItUH4mPUG/uH//Zj1Bh7JaCDJaBBKRoPwMevmd12XY9YbSFYbhLLaIHzMuvk9/+sx6w2kIhrwjttAKqIBK6KBVMT4yB8WOmbd/GFex6w3kGp5NFQtDcLHrJsf9TpmvYFUUgNWUgPHmboJof9y6Jh18192PWa9gVVij9q2VEyJPcYSe1RK7NGcEjPV8qhHtTwq1fJoTrWELkcLSEwkyaHLTNRjXEJ5VBL1KBP1qCTq0YhJXPgyk/Fa5HfHhy8TfHZopTUC/qg+eh0ayjcIf3QftVwfs22pGNeGdH1MXB+j62Mero+J62N0fUxcG0YKLTp8ma65OEV6TFwfo+tj4noPXR8T18fo+pi4PsZCfkxcc+UUsnF9zHJtaNtSMa6N6NpQXBvStaGHa0NxbUjXhuLaiK4NxTWZj143FNeGdG2o35iU01hCl+PlHYt4u2tDcW1I14biWtSPem1ouTaybakY18fp2khcG9G1kYdrI3FtRNdG4vo4XRuJ6/OhoXyj8DHrjfzvX79j1htJkhqFmBuFj1k3v+u6HbPeSDLeIhhnz3gjyXgjfpIaScYbMeONJOPP+fBJamRl/HHbZo/J+BPM+OOS8ceZ8cc9Mv64ZPxxZvxxyfgTzPjjkvG6oc9Co/An6XFJ0uM5SQpdlkUcHzrU4+L6OF0fF9fH6fq4PqwUgOvjlusTts0e49qYrk+I6xN0fcLD9QlxfYKuTzhcY+2uT4jr03R9QlyfoOsT4hoVQL0+Ia6Nc4Y3ocsJ8qfB9QlxXcJ6fcJybWzb7DGuTUKujcPHrDf2j3Q7Zr2xcDcmd2MP7sbC3ZjcjYW7MbkbC3feYLydu7FwNwmBRbgb6/F0wRg7d2PhbhUpxPjw5QT508DdWLiTeKNtbHE3se0BGe6mOdyhy3RtQtcmHq5NxLUJXZuIa1O2hybiesUfY3dt4nBFGTcR1yYcwDQR18K+OLtrE3FtQtcm4nrFhxttE8u1qW3t3Lg+Sdem4tqUrk09XJuKa1O6NhXXJ+naVFzLsj00FdemdG0qru3YHpqKa1O23abi2pSuTfU4cA5gmlquT9rWzo3rU3R9UlyfpOuTHq5PiuuTdH1SXJ+i65OOZxlRr0+K65N0fVJcO/rg+qS4PknXJ8X1Sbo+Ka5Vg+gDT1quT9nWzo3r03R9SlyfoutTHq5PietTdH3K4Yr++pTjXXK4PiWuT7O/PiWuR+j6lLg+RdenxPUpuj4lrnU4THjKcn3atnZuXJ+h69Pi+jRdn/ZwfVpcn6br0+L6DOv1acdeD+5bTztcUa9Pi2vBAO5bT4vr03R9Wp+1oevT+lXFvG89bbk+Y1s7N67P0vUZcX2Grs94uD4jrs/Q9RmHKxY0nhHXZyMFGRO+TNdn6PqMuF6h6zPi+qwv1u76jLg+Q9dnxHUgh1/PWK7P2tbOjetzdH1WXJ+l67Mers+K67N0fVZcn2O9PiuuPt63nhXXZ+n6rLge5X3rWXVlvT4rrs/S9Vlx/ZF94FnL9Tnb2nnPbNdmdH1OXJ+j63Mers+J63N0fc7hiv76nLgeCN10I67PietzdH1Op2Gc3j4nrs04XXhOXJ+j63Pi+iBdn7Ncm9nWzo3r83RtJq7N6NrMw7WZuDajazNxbUbXZuI634f7VjNxfZ73rWbi2ozj12YOV9RrM3FtRtdm4noTXZtZrs/bFoyN6wt0fV5cn6fr8x6uz4vr83R9XlxfYB94XheK2Aeed7iiXp8X14rsA887xq/or8+L6/N0fV5cv6Pr85brC7YFY+PanK4viOsLdH3Bw/UFcX2Bri+Ia3O6viCuL7APvCCuL9D1BXF9gfX6gn4VvA/1+oK4vuDHQvwL4nqe84IXLNfmtgVj49qCrs3FtTldm3u4NhfX5nRtLq4t6NpcXJvTtbm4Nqdrc3FdzHptLq7N2Qeai2tz1mtzcX09CNfmlmsL24KxcX2Rri3EtQVdW3i4thDXFnRtIa4v0rWFuLZgH2ghri3o2sLx9SAYZ7UQ17V0bSGuLejaQr8ehOsDLSzXF23Lssb1Jbq+KK4v0vVFD9cXxfVFur7ocMX49UVxfZGuL4rri3R9UVxfZB94UVxf4njgRXF9ka4viuu9vkS764uW60u2ZVnj2pKuL4nrS3R9ycP1JXF9ia4viWtL1utL4nqM44GXxPUlur6k9y3OY18S1z9533pJXF+i60vimpeuL1muLW3Lssb1Zbq2FNeWdG3p4dpSXFvStaW4vkzXluK6lPXaUlxb0rWluG6ga0txXc75VktxbUnXluJ6iOOBlpbry7b1V+Paiq4vi+vLdH3Zw/VlcX2Zri87XDF+fVm3Z3y4b70sri/T9WVxLeWH68u6rs0+8LK4vkzXl8W1ATfmX77ux6y3cnlW+hWXWGuXWBuXWFuX2KsusXYusddcYq+7xNq7xDq4xDq6xDq5xN5wib3pEuvsEuviEuvqEuvmEuvuEuvhEuvpEuvlEuvtEuvjEuvrEuvnEuvvEhvgEhvoEhvkEhvs8gx+K9s+gukPr7A/tJL+0Ir9oZVHf2gl/aEV+0Mr6Q+vsO+2kv4wxIe+20r6Qyv2h1bSH1pxnNDK0R8w/mol/aFVqD+0Ch+z3so/0euY9VbSOqaxdbSyWvIrti0GQ96a5K8I+Sskf8WD/BUhf4Xkrwh5a5K/IuSv8Fb3ipC/QvJXhDyZO+avOI5XxpbYK0L+Sg556DJdU7hk+4rl2tq2xWBc29C1tbi2pmtrD9fW4tqarq3FtQ1dW4trbm4xtBbX1nRtLa4PcAjRWlxbs5Rbi2trurYW1zbcumltubaxbTEY17Z0bSOubejaxsO1jbi2oWsbcW1L1zaObxZCvbYR1zZ0bSOuuTiEaCOubejaRlzb0LWNuA7l0KyN5drWtsVgXF+la1txbUvXth6ubcW1LV3biuurdG0rrvXo2lZc29K1rbi2ZettK65t2QfaOo6jibW7thXXKpz6trVcX7VtMRjXdnR9VVxfpeurHq6viuurdH1VXNvR9VVxfZWur4rrq3R9VVxfpeurjqkv6vVVcR0agou4viquf7C/vmq5trNtMfSqZR55hWs7cW1H13Yeru3EtR1d2zlcMZVoJ64v0bWduLajaztxXcZHZNo5nvHFVKKduLZjH2gnruW4tNjOcn3NtsVgXF+n62vi+hpdX/NwfU1cX6Pra+L6Ouv1NXF9ja6vietrdH1NXF9jvb4mrlOCeBb1NXF9ja6viWvjyJOsIdfXLNfXbVsMxrU9XV8X19fp+rqH6+vi+jpdX3e4YgnsdXFtzy3c18X1dbq+rk/Q8b71urhWZx94XVxfp+vr4lqG963XLdf2ti0G49qBru3FtT1d23u4thfX9nRtL67t6dpeXDvQtb24tqdre3GNZr22F9dl3GJoL67t6dpeXKO5Nd7ecu1g22Iwrh3p2kFcO9C1g4drB3HtQNcO4tqRfaCDwxV9oIO4dqBrB32tjK4dxHUbXTuIawe6dnB8nQ1cO1iuHW1bDMa1E107imtHunb0cO0orh3p2lFcO9G1o7h25NZNR3HtSNeO+kgXn/Xv6JgXYGmxo7h2pGtHfW2X9drRcu1k22Iwrm/QtZO4dqJrJw/XTuLaia6dxPUNunYS10507SSunejaSVx/8mM80MlxjBpcO4lrJ7p2EtfLdO1kub5h22Iwrm/S9Q1xfYOub3i4viGub9D1DYcr+usb4voGXd8Q1zfo+oYerxxJWlz4crwMb9EH3hDXN+j6hrjGcavxDcv1TdsWg3HtTNc3xfVNur7p4fqmuL5J1zfFtTPr9U1xfZOub4rrm3R9U1xrsF7fFNc36fqmuL5J1zf12D/21zct1862LQbj2oWuncW1M107e7h2FtfOdO3scMW8oLO4lg9g3aWzuHama2c9TpH3rc7i2oXzgs7i2pmuncU1Ixhrd+1suXaxLc0a16507SKuXejaxcO1i7h2oWsXce3Keu0irq04Hugirl3o2kW3xPjIQReHK+q1i7h2oWsXfWOJ49culmtX2/qrce1G167i2pWuXT1cu4prV7p2FddudO3qGGehXruKa1e6dhXXCVx/7SquXenaVVy70rWruJ7kfaur5drNtv5qXLvTtZu4dqNrNw/XbuLaja7dxLU7XbuJazfWazdx7UbXbuL6Ceu1m7i2D8K1m7h2o2s3ce3F9YFulmt32/qrce1B1+7i2p2u3T1cu4trd7p2F9cedO0uridYr93FtTtdu4trf85ju4trd9Zrd3HtTtfu4lqe963ulmsP2/qrce1J1x7i2oOuPTxce4hrD7r2cLhinNVDv4Gc9dpDXHvQtYd+7UoAfaCHuPbkfauHuPagaw9x3UTXHpZrT9v6q3HtRdee4tqTrj09XHuKa0+69hTXnnTtKa69uD7QU1x70rWnuC5kH+gprp1Yrz3FtSdde4rrfdw37Gm59rKtv/bOdu1N117i2ouuvTxce4lrL7r2Etfe7AO9xHU0Hz3qJa696NpLXCcGUa+9xLUXXXuJay+69hLXlrxv9bJce9vWX41rH7r2FtfedO3t4dpbXHvTtbfDFePX3uJ6wYdXaHqLa2+69hbXvqzX3uLah32gt7j2pmtv/TobjrN6W659bOuvxrUvXfuIax+69vFw7SOufejaR1z7sl77iGsfzrf6iOt6H1z7iGsfrrv0cbjildo+4tqHrn3EdU1kNSzk2sdy7WtbfzWu/ejaV1z70rWvh2tfce1L177i2o+ufcW1L137imtf1mtfrVe69tVxFtdd+oprX7r2FdexATyC2Ndy7WdbfzWu/enaT1z70bWfh2s/ce1H134OV9y3+olrf963+olrP7r2E9c4uvYT1/fp2k9c+9G1n7h24rpLP8u1v2391bgOoGt/ce1P1/4erv3FtT9d+4vrANZrf8e8APet/uLan679xXU4x6/9xbU/71v9xbU/XfuL604+l9Hfch1gW381rgPpOkBcB9B1gIfrAHEdQNcB4jqQrgPEdQDHrwPEdQBdB4hraz7vMsAxL0C9DhDXAXQdoCdEcPw6wHIdaFt/Na6D6DpQXAfSdaCH60BxHUjXgeI6iK4DxXUgXQeK60C6DtRH57k+MFBcg6zXgeI6kK4DxbUpx1kDLddBtvVX4zqYroPEdRBdB3m4DhLXQXQdJK6D6TpIXJ/iq8qDxHUQXQc5jqWF6yBxHUTXQeI6iK6DxPUz1usgy3Wwbf3VuA6h62BxHUzXwR6ug8V1MF0Hi+sQug52HPOJ8cBgcR1M18GOs6zQBwaL62C6DhbXwXQdrK9+8r41+Lofsz7E5VHcoS6xt1xiw1xib7vE3nGJDXeJjXCJvesSe88l9r5L7AOX2IcusZEusY9cYh+7xEa5xD5xiX3qEvvMJfa5S+wLl9iXLrHRLrExLrGvXGJfu8TGusTGucTGu8QmuMQmujziPcS2j2D6w1D2hyHSH4awPwzx6A9DpD8MYX8YIv1hKPvDEOkPjXg/GyL9YQj7wxDpD8c4vx0i/WEI+8MQ6Q9D2B+GSH+YyL47xOq7Q237CMb1LboOFdehdB3q4TpUXIfSdajDFfOFoeL6FucLQ8V1KF2HiutQ3s+GOg4gxfhrqD5nSNeh4prPh+e2hlqub9n2EYzrMLq+Ja5v0fUtD9e3xPUtur4lrsNYr285XFGvb4nrssh0IjZ8ma4reJTBW459L7i+Ja5v0fUtcd3H8ddblusw2z6CcX2brsPEdRhdh3m4DhPXYXQdJq5v03WYuA6j6zBxHcZ6HSauw1ivw8T1Hz5vPExch9F1mI5rOU4YZrm+bdtHMK7v0PVtcX2brm97uL4trm/T9W2HK9YP3xbXfzi/fVtc3+EREW/rc7Ecf73teI4b/fVtcX2brm+L61WuH75tub5j20cwrsPp+o64vkPXdzxc3xHXd+j6jri+Q9d3xPUdrnO943BFvb7jONIE6zHviOtwrsu+I67v0PUdcX2Fz8e/Y7kOt+0j9Ml2HUHX4eI6nK7DPVyHi+twug4X1xHsA8MdX8uEeh0ursPpOtzxdYKo1+EOV9TrcHEdTtfh+jW4rNfhlusI2z6CcX2XriPEdUTIdUT4mPUR/tT/fsz6CI9kjJBkjAglY0T4mHXzu67LMesjJKvvhrI6InzMuvk9/+sx6yOkIp7knWGEVMQIVsQIqYi00AhxRPiYdfOHeR2zPkKqZUSoWkaEj1k3P+p1zPoIqaQRrKQRUknfhm5XI8LHrJv/susx6yOsEnvXtqViSuw9lti7UmLv5pSYqZZ3ParlXamWd3OqJXRZkxwTSXLoMhP1Hoec70qi3mWi3pVE3Re0EhW6HC/fzWMlI3Q5Qf40gL8r4L+ETh8YEf7ovmu5vmfbUjGu79P1PXF9j67vebi+J67v0fU9cX0/58MTuqyuuNW8J67v0fU9cX0v9PGJuL4nrkX9cH1PXN+j63vieqcvzu76nuX6vm1Lxbh+QNf3xfV9ur7v4fq+uL5P1/cdrqjX98X1fbq+L67v0/V9cf0gkrS48OV4GfvE213fF9f36fq+uGYFEuyu71uuH9i2VIzrh3T9QFw/oOsHHq4fiOsHdP1AXD+g6wfi+mFI5oPwMesf+Jdev2PWP5AkfRBi/iB8zLr5XdftmPUPHBlPsGf8A8n4Q5EPWnz4coL8NDL+gWS8T6ReQhn/wMr4h7bNHpPxkcz4h5LxD5nxDz0y/qFk/ENm/EPJ+Eh2qA8dGY+NZDx0mUn6MCdJoct0vYud/0NxncDO/6G4fkjXDx2LDej8H1quI22bPcb1I7qOFNeRdB3p4TpSXEfSdaS4fkTXkeL6d2gHMOI6UlxH0nWkuHbzoV5HimuVIFxHiutIuo4U1/o+dKiRlutHts0e4/pxyPWj8DHrH/mXux2z/pFwf0Tujzy4PxLuj8j9kYMbjesj4f44p3GFLpP7I3J/JNwfsT18JNwDeKP9SLj/DeCd54+Eu6sfN9qPLO6PbXtAhntUDnfoMl0/puvHHq4fi+vHdP1YXEexjD92PHOH9vCxuH5M14/FdQHL+GNx/ZiuH4vrxyzjj8U1PYgy/thyHWVbOzeun9B1lLiOousoD9dR4jqKrqPE9RO6jhLXUXQdJa6j6DpKXMv40HZHiWsluo4S11F0HSWux/xwHWW5fmJbOzeun9L1E3H9hK6feLh+Iq6f0PUThyv6wCfi+in7wCfi+gldPxHX1zng/kRcP4l8kuPDlxPkMlw/cXxrSIzd9RPL9VPb2rlx/Yyun4rrp3T91MP1U3H9lK6fiutnrNdPHa6o10/F9VO6fiqun7K/fqp7wUG4fiqun9L1U3E9y/76qeX6mW3t3Lh+TtfPxPUzun7m4fqZuH5G18/E9XO6fiaun9H1M3H9jK6fietc9oHPxLVqAH3gM3H9jK6fiesq9oHPLNfPbWvnxvULun4urp/T9XMP18/F9XO6fu5wRR/4XFw/DxVFxPVzcf2crp+L6xecIH4urk+wv34urp/T9XNxrUnXzy3XL2xr58b1S7p+Ia5f0PULD9cvxPULun4hrl9EWmB0+DJdv4jAxYQv0/XLSPuNDV+Ok7dA0V+/ENcv2F+/ENcv6PqFvosTQB/4wnL90rZ23jfbdTRdvxTXL+n6pYfrl+L6JV2/FNfR7ANfiuuh0Ewp4vqlwxX1+qXjawHQB74U1y9Zr1+K65d0/VJc3+E460vLdbRt7dy4jqHraHEdTdfRHq6jxXU0XUeL6xi6jnZ8FTxcR4vraLqOFtdL7K+jxXU0XUeL62i6jtavfuU0bLTlOsa2YGxcv6LrGHEdQ9cxHq5jxHUMXceI61d0HSOug9lfx4jrGLqOEdd01usYcR1D1zHiOoauY8Q1lf11jOX6lW3B2Lh+TdevxPUrun7l4fqVuH5F16/E9Wu6fiWuX3E88JW4fkXXr/Qd/ch6S1z4crw8kgfXr8T1K7p+pe/icJz1leX6tW3B2LiOpevX4vo1Xb/2cP1aXL+m69cOV4wHvhbXsZwXfC2uX9P1a3FdzWWur8V1ThDLh1+L69d0/Vpc47lg/LXlOta2YGxcx9F1rLiOpetYD9ex4jqWrmPFdRzrdazDFX1grLiOpetYcR3L8cBYcU1gvY4V17F0HSuu4zgeGGu5jrMtyxrX8XQdJ67j6DrOw3WcuI6j6zhxHU/XceI6jq7jxHUcXceJ6zi6jnOMs+A6TlzH0XWcuC5kvY6zXMfblmWN6wS6jhfX8XQd7+E6XlzH03W8wxV9YLy4TmAfGC+u4+k63vHF35jHjhfXedxGGC+u4+k6Xlyf92N9YLzlOsG2LGtcJ9J1grhOoOsED9cJ4jqBrhPEdSLrdYLDFfetCeI6ga4T9OwDuk7Qs5B82JCbIK4T6DpB1wk5zppguU60rb8a10l0nSiuE+k60cN1orhOpOtEhyvmWxPFdSLnWxPFdRLnWxPFdSXHrxMd7zagXieK60S6ThTXv+k68bofsz7J5VnpyS6xb1xi37rEprjEvnOJfe8Sm+oSm+YSm+4Sm+ESm+kS+8ElNssl9qNL7CeX2GyX2M8usV9cYr+6xH5zif3uEpvjEvvDJTbXJfanS+wvl9g8l9h8l9jfLrF/XGL/ujyDP8m2j2D6w2T2h0nSHyaxP0zy6A+TpD9MYn+YJP1hEu9nk6Q/TOb9bJKjP6DvTtKzqdl3JznOmkB/mCT9YVKoP0wKH7M+yb/D65j1SdI6ZnCKNslqyZNtWwyG/BuSTxbyySSf7EE+Wcgnk3yykE8m+WQh/4bkk4V8MsknC/kdfkzRJgv5ZC6BTRbyyTnkocvyDWNcqplsuX5j22Iwrt/S9Rtx/Yau33i4fiOu39D1G3H9lkOIbxyuGEJ8I67f0PUbcd3DrcZvxHUsh7zfiOs3dP1GXL/gre4by/Vb2xaDcZ1C12/F9Vu6fuvh+q24fkvXbx2uGEJ8q8crB+D6rbh+S9dvxfWvIFy/1WOAIzmND19OkD8Nrt+Kaz1OJb61XKfYthiM63d0nSKuU+g6xcN1irhOoesUcZ3CPjBFXL9jH5girlPoOkVcM7gENkVcy/MJjyniOoWuU8T1Y9brFMv1O9sWg3H9nq7fiet3dP3Ow/U7cf2Ort+J63d0/U5cv6frd+L6HV2/c2zhwvU7cY2KyMSHLyfInwbX78T1T/bX7yzX721bDP2yXafS9Xtx/Z6u33u4fi+u39P1e3Gdyv76vR7zw/76vbh+T9fvxXUkXb8X1+/ZX78X1+/p+r3jdV64fm+5TrVtMRjXaXSdKq5T6TrVw3WquE6l61RxnUbXqXpcrQ+uU8V1Kl2nimsjLi1OFdepdJ0qrlPpOlW/aZD9darlOs22xWBcp9N1mrhOo+s0D9dp4jqNrtMcrrhvTRPXaVwCmyau0+g6TVy/D2IJbJq4Tud9a5q4TqPrNHEtwWenp1mu021bDMZ1Bl2ni+t0uk73cJ0urtPpOl1cZ7Bep4vrcB+WFKaL63S6ThfX4lxanO5wRb1OF9fpdJ0urrVYr9Mt1xm2LQbjOpOuM8R1Bl1neLjOENcZdJ0hrjPpOkNc+7G/zhDXGXSdIa6/sw/MENcZdJ0hrjPoOsPxjXhwnWG5zrRtMRjXH+g6U1xn0nWmh+tMcZ1J15kOV/SBmeI6k31gprjOpOtMcZ3JKe5Mcf2BfWCmuM6k60xxfTbyl4dcZ1quP9i2GIzrLLr+IK4/0PUHD9cfxPUHuv4grj/Q9QdxHU/XH8R1FpcWfxDXTI5ffxDXBqzXH8T1B7r+IK51Wa8/WK6zbFsMxvVHus4S11l0neXhOktcZ9F1lrj+yD4wS1xPcjwwy+GKep0lrovYB2aJ6yy6zhLXWXSd5TieDq6zLNcfbVsMxvUnuv4orj/S9UcP1x/F9Ue6/uhwRb3+KK4/sl5/FNcf6fqjuC7x4b71o7j+xD7wo7j+SNcf9euXOH790XL9ybbFYFxn0/Uncf2Jrj95uP4krj/R9Sdxnc16/UlcN/K+9ZO4/kTXn8T1N64P/CSuv/mwhPiTuP5E15/0UWT2gZ8s19m2pVnj+jNdZ4vrbLrO9nCdLa6z6TpbXH+m62xxnUTX2eI6m66z9RHEAOp1tr5TyT4wW1xn03W2uE7n1vhsy/Vn2/qrcf2Frj+L6890/dnD9Wdx/ZmuP4vrL3T9WVx/Zh/4WVx/puvP4tqC668/i+vPdP1ZXH+m68/i+jPnBT9brr/Y1l+N6690/UVcf6HrLx6uv4jrL3T9xeGK/vqLPoLIdcJfxPUXuv4irtMCcP1FXH9lf/1FXH+h6y/i+kMQrr9Yrr/a1l+N6290/VVcf6Xrrx6uv4rrr3T9VVx/5XrWr+L6G9ezfhXXX+n6q+NRDrj+Kq7fsl5/Fddf6fqruG7jI12/Wq6/2dZfjevvdP1NXH+j628err+J6290/U1cf2O9/iauZYKo19/E9Te6/uY4Xhn99Tdx/Z31+pu4/kbX38Q1gX3gN8v1d9v6q3GdQ9ffxfV3uv7u4fq7uP5O19/FdQ776+/i+hHvW7+L6+90/d3RXzEe+N3hinr9XVx/p+vv4hrkeOB3y3WObf21fy3zfZhwnSOuc+g6x8N1jrjOoeschyv6wBxx/YN9YI64zqHrHH0Ekeuvc3ScxUcQ54jrHLrOEddH/XjTdo7l+odt/dW4zqXrH+L6B13/8HD9Q1z/oOsf4jqX9fqHuE5lvf4hrn/Q9Q9xbclHZP4Q1z9Yr3+I6x90/UMfPeI+9x+W61zb+qtx/ZOuc8V1Ll3nerjOFde5dJ0rrn/Sda64zqXrXHGdS9e5jq+3Qx+YK64D6TpXXOfSda64FuU8dq7l+qdt/dW4/kXXP8X1T7r+6eH6p7j+Sdc/Ha7oA3+K61/sA3+K6590/VNcS3F94E9xfY9v3P8prn/S9U/9ujCOs/60XP+yrb8a13l0/Utc/6LrXx6uf4nrX3T9S1z/outfDlfMC/5yPJcRa3f9S1zn8ZWvvxzHpaG//iWuf9H1L8cxdKjXvyzXebb1V+M6n67zxHUeXed5uM4T13l0nSeu8+g6T1zns17nies81us8cV3M+9Y8cf2F96154jqPrvPE9Qn213mW63zb+qtx/Zuu88V1Pl3ne7jOF9f5dJ0vrvPpOl9PiKDrfHGdT9f54lowEG93na9fF0bX+eI6n67zxXUR++t8y/Vv2/qrcf2Hrn+L6990/dvD9W9x/Zuuf4vrP7xv/e1wRR/4W1z/puvf4jqL+1t/i+vfvG/9La5/0/Vvcd3F8evflus/tvVX4/ovXf8R13/o+o+H6z/i+g9d/3G4Yr71j7jeyfHAP+L6D13/EdfkIOax/4jrv5xv/SOu/9D1H3GdwHnsP5brv7b1V+O6gK7/iuu/dP3Xw/Vfcf2Xrv+K67/sA/+K6wL2gX/F9V+6/qvHfAYwzvpXXOuzXv/Vo0vo+q+4VmW9/nvdj1lf4PIo7kKXWJJLbJFLLNklluISS3WJpbnEFrvElrjElrrE0l1iy1xiy11iK1xiK11iq1xiq11ia1xia11i61xi611iG1xiG11im1xim11iW1xiGS6xrS6xbS6x7S6xHS6PeC+w7SOY/rCQ/WGB9IcF7A8LPPrDAukPC9gfFkh/WMj72QLpDz+x7y6Q/rCA/WGBnnzG/rBA+sMC9ocF0h8WsD8s0K9tZn9YYPXdhbZ9BOOaRNeF4rqQrgs9XBeK60K6LhTXJLoudBwRAdeF4rqQrgv16wQ5v10orgvpulBcF9J1oe5/cx620HJNsu0jGNdFdE0S1yS6Jnm4JolrEl2THK64nyWJ6yLez5LE9S/Ow5IcXyeI+UKSuH5D1yRxTaJrkrhu5r5XkuW6yLaPYFyT6bpIXBfRdZGH6yJxXUTXReKazHpdJK5v87mCReK6iPW6SFxPcR62SFwX0XWRuC6i6yJxPc552CLLNdm2j2BcU+iaLK7JdE32cE0W12S6JotrCl2TxTWZfSBZXJPpmiyut7Fekx3PF8E1WVyT6ZosrqXpmmy5ptj2EYxrKl1TxDWFrikerinimkLXFHFNpWuKuKZwHpYiril0TRHX0tz3ShHXFLqmiGsKXVPEtS3XY1Is11TbPsKAbNc0uqaKaypdUz1cU8U1la6p4ppG11TH8/Go11RxTaVrqri+zec1UsU1la6p4ppK11RxLcl6TbVc02z7CMZ1MV3TxDUt5JoWPmY9zX/QHLNe5j8ds57mkYw0SUZaKBlp4WPWze+KivKV+X8+Zj3NkdXY0O8JHbNufk90tK/M/3LMeppUxBneGdKkItJYEWlSEYVCn9O08DHr5g+Li/OVcTsrPU2qZXGoUtPCx6ybH42P9/rRBOFAJaVJJX0UKtO08DHr5r+cmOgr4zhmPc0qscW2LRVTYktYYoulxBbnlJiplsUe1bJYqmVxTrWELkfL9xP6I0kOXWaiFvNt7sWSqMWRw4piw5eZqJSglajQZSajczA+kozQ5QTJFcAXC3jlQFwE3LgutlyX2LZUjOtSui4R1yV0XeLhukRcl9B1ibgupesScS3ClrhEXJfwA7BEXIsE4LpEXJeEshJxXSKuS+i6RFy3BxLsrkss16W2LRXjmk7XpeK6lK5LPVyXiutSui51uMbYXZeKazqH8kvFdSldl+ot3Jdgd13qeKQ91u66VFyX0nWpuDam61LLNd22pWJcl9E1XVzT6Zru4Zourul0TRfXZazXdHH9NdRy08PHrGf/dOC6HbOeLklKDyUpPXzMuvld1+2Y9XTHYiQ+SemS8XR+ktIl4+nMeLpkfF4QGU+3Mr7MttljMr6cGV8mGV/GjC/zyPgyyfgyZnyZI+Ox9owvk4y3DP2/nh7+JC1zfPeYlaTQZXm4zo9P0jJxXZ5zGw5dTpA/Da7LxHW+D51/meW63LbZY1xX0HW5uC6n63IP1+Xiupyuy8V1BT9Jy8V1eYg94rpcXJfTdbm4dvGjXpeL641+3FGXi+tyui7XxTHW63LLdYVts8e4rgy5rggfs77CH2fWKPWY9RXCvYLcKzy4Vwj3CnKvEO6V5F4h3CtyGlfoMrlXkHuFftVuMMbOvUK4V7A9rBDuFeReIdzFfeBeYXGvtO0BGe5VOdyhy3RdSdeVHq4rxXUlXVeK6yq6rhTXr1nGK8V1JV1XOr7CGGW8UlxX0nWluK6k60pxHcSB4UrLdZVt7dy4rqbrKnFdRddVHq6rxHUVXVeJ62q6rhLXMXRdJa6r6LpKv9eIrqvEdRVdV4nrKrqu0mfFg4l211WW62rb2rlxXUPX1eK6mq6rPVxXi+tquq52uGJguFpc14TYI66rxXU1XVfrszbsA6vFdTddV4vrarquFtchvJ2ttlzX2NbOjetauq4R1zV0XePhukZc19B1jbiuZb2ucbiiXteI6xq6rtFnbXyo1zXi+gpd14jrGrquEdd3OeBeY7muta2dG9d1dF0rrmvputbDda24rqXrWnFdR9e14rqW96214rqWrmvFdS2HX2vFda0/0e66VlzbhdgjrmsdXxEfY3dda7mus62dG9f1dF0nruvous7DdZ24rqPrOocr+sA6cV3PPrBOXNfRdZ24Psf+uk7P6uAEcZ24rmO9rhPXvRwPrLNc19vWzo3rBrquF9f1dF3v4bpeXNfTdb24rqfrenHdQNf14rqerut1oSgCFxe+HC+/O87uul5c19N1vcMV/XW95brBtnY+sJZ5rxCuG8R1A103eLhuENcNdN0grhvZBzaI6+/srxvEdQNdN4jrC0H0gQ3iuoH9dYO4bqDrBv3eONbrBst1o23t3LhuoutGcd1I140erhvFdSNdN4rrJrpudLxDiv66UVw30nWjuM7wYTywUVw30nWjuG6k60ZxHRlEvW60XDfZFoyN62a6bhLXTXTd5OG6SVw30XWTuG6m6yZx3cR63SSum+i6SZ/94ILxJnGdSNdN4rqJrpvEtSLHA5ss1822BWPjuoWum8V1M103e7huFtfNdN0srlvoullcN9N1s7huputmca3G+9ZmcW3jg+tmcd1M183iWonzrc2W6xbbgrFxzaDrFnHdQtctHq5bxHULXbeIawZdt+j6QADLXFvEdQtdt+hx4KzXLeIaDMJ1i7huoesWcU3zo163WK4ZtgVj47qVrhnimkHXDA/XDHHNoGuGuG6la4a4Vma9ZohrBl0z9Kw5jl8zxPUvLnNliGsGXTPENSMy2Ai5ZliuW23LssZ1G123iutWum71cN0qrlvpulVct9F1q7hupetWcd1K1636jlMArlvFdSb761Zx3UrXreL6OMdZWy3XbbZlWeO6na7bxHUbXbd5uG4T12103Sau2+m6TVy30XWbuG6j6zZxrcp63eb42kDMC7aJ6za6bhPXhznO2ma5brctyxrXHXTdLq7b6brdw3W7uG6n63Zx3UHX7eK6KwjX7eK6na7bxXUbt2e2i+t21ut2cd1O1+3impv3re2W6w7b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NbpWC7giX6uJazXu+lUT12p0rabHIkQGLTblsq4LkK/VxLUaXatpvtK1muda3dftblxr0LW6uFana3WHa3VxrU7X6uJanfet6uJana7VxbUGd6eqB1yRr9XFtXoELi7lMl3fjEzD4lMu03U11wXVPdcavm5341qTrjXEtQZdazhca4hrDbrWENearAM1xLUG71s1Aq7I1xri+jZda8To68KQrzXEtQbztYa4LmC+1vBca/q63Y1rLbrWFNeadK3pcK0prjXpWjPginytKa51ouFaU1xrMV9riutMzl9riuvhKLjWFNeadK0prtXoWtNzreXrdjeutelaS1xr0bWWw7WWuNaiay1xrc18rSWuhZmvtQKuyNdaeoxHDOavtcS1Fu9btcS1Fl1riWtzutbyXGv7ut2Nax261hbX2nSt7XCtLa616Vo74Ir7Vm1xrc36Wltca9O1trjW4X2rtriWDGH+Wltca9O1trhe5Lqgtudax9ftblzr0rWOuNahax2Hax1xrUPXOuJal/laR1wbcB1bR1zr0LWOuI7kvksdcc3M+UAdca1D1zriup2udTzXur5ud+Naj651xbUuXes6XOuKa1261hXXenStK651WQfqimtdutYV1yVcx9YV1xbRyNe64lqXrnXF9XWuC+p6rvV83e7GtT5d64lrPbrWc7jWE9d6dK0nrvXpWk9c69G1nrjWo2s9ca3A9VY9cY3l84J64lqPrvXEdTDraz3Ptb6v2924NqBrfXGtT9f6Dtf64lqfrvUDrqiv9bUOcB1bX1zr07W+ukb+5bEpl+PkdyNf64trfbrWF9ez0Zi/1vdcG/i63Y1rQ7o2ENcGdG3gcG0grg3o2kBcGzJfGwS6LlFfG4hrA7o2ENfXma8NxLUB5wMNxLUBXRuIax7WgQZet/tqZ7f7/3bMekNLV3IjS6yxJdbEEmtqiSVYYs0sseaWWAtLrKUl1soSS7TEWltibSyxJEusrSXWzhJrb4l1sMQ6WmKdLLHOllgXS6yrJdbNEutuifWwxHpaYr0ssd6WWB9LrK+l272hr9vd1IdGrA8NpT40ZH1o6KgPDaU+NGR9aBioD1iHNZT60CaEruyGUh8acR3WUOrDVzHYl20YOKYS9aGh1IeGrA8NpT7cE4X60NCru4183e7GtTFdG4lrI7o2crg2EtdGdG0kro14P2skro15P2sUcEXdbSSutejaSFyrcV7bSFwb0bWRuN7LeW0jz7Wxr9vduDaha2NxbUzXxg7XxuLamK6NxbUJ72eNdd+A97PG4tqYro3FtWxURr9rY3FtzPtZY3FtTNfG4tqZ97PGnmsTX7e7cW1K1ybi2oSuTRyuTcS1CV2bBFxRB5qIazfudzcR1yZ0bSKuH4QwT2girk353KuJuDahaxNxvcp8beK5NvV1uxvXBLo2FdemdG3qcG0qrk3p2lRcE5ivTQP5Ctem4tqUrk3F9WnuczUNuCJfm4prU7o2FdcyzNemnmuCr9vduDaja4K4JtA1weGaIK4JdE0IuKK+JohrAvdjEsQ1ga4J4prAfdkEcW3L+pogrgl0TRDXZpGMCLsmeK7NfN3uM/9zbU7XZuLajK7NHK7NxLUZXZuJazPWgWbi2ozf0momrs05H2gmrs3o2kxc6zFfm4lrM7o2E9e3+Ryhmefa3Nftblxb0LW5uDana3OHa3NxbU7X5uLagnWgubg2Zx1oHnBFvjYX1zdZB5qLa0IIrs3FtTldm4vrXawDzT3XFr5ud+Pakq4txLUFXVs4XFuIawu6tgi4Il9bBJ57YT7QQlxb0LWFuBbmfncLfS0A71stxLUFXVvoceCcv7bwXFv6ut2Nayu6thTXlnRt6XBtKa4t6dpSXFvStaW4tmR9bSmurVgHWorr9GjMX1sGXOP9ri3FtSVdW4rrtcgnD7u29Fxb+brdjWsiXVuJayu6tnK4thLXVnRtJa6t6NpKXIfw9NdWAVfkaytxXRuFfG0lronM11bi2oqurcS1JudZrTzXRF8ft3FtTddEcU2ka6LDNVFcE+maKK6JnA8kimvr8H96Ysox64kx82/fMeuJMkiJ4UFKTDlm3fyu23bMeqKMeCLvqImBEcfOZqKMeCJHPFFGvGjENDziid6It/Z1mJsRb8MRby0j3poj3tox4q1lxFtzxFvLiLfmX1JrGfFF4cuJKX9JrWWQWqcOUvhyrLwiA39JrcW1Df+SWotra7q2Ftfc3Ilv7bm28XWYG9ckurYR1zZ0beNwbSOubejaRlyTOFNpoztCdG0jrm3o2kZcB9K1TeD8A8ys24hrG7q20R0hurbxXJN8HebGtW3YNSnlmPWkmEW2Y9aThDuJ3EkO7iThTiJ3knC3JXeScJ+JivNzJwl3ErmThPtFbtAnCXcSJ9xJwp1E7iThHsUJTJLH3dbXeG6426Vyhy/TtS1d2zpc24prW7q2Fdd2dG0rrpvDT20irm3FtS1d24prET5YbqvvMwkhjduKa1u6ttX3m9G1refaztd4blzb07WduLajazuHaztxbUfXduLanq7txPXXaJSHduLajq7txLUdb2ftxLUd87WduLajazv9hhpd23mu7X2N58a1A13bi2t7urZ3uLYX1/Z0bR9wxe2svbh2SJ3AhC/TtT1d22tDP13bi2t7urYX1/Z0bS+ujfiFqfaeawdf47lx7UjXDuLaga4dHK4dxLUDXTuIawe6dgi4og50ENcOdO0grq25kOkgrh05Teggrh3o2kFcS/DBcgfPtaOv8dy4dqJrR3HtSNeODteO4tqRrh3FtRPrQEdx7chpQkdx7UjXjoGGfuRrx8D7I1FfO4prR7p21GOAuaHR0XPt5Gs8N66d6dpJXDvRtZPDtZO4dqJrp4ArFjKdxLUT87WTuHaiaydx7cxGs07iupAP5DqJaye6dtLjUaKQr508186+xnPj2oWuncW1M107O1w7i2tnunYW1y7M187iOjQK+dpZXDvTtXPg7UGYD3QW10bM187i2pmuncX1VeZrZ8+1i6/x3Lh2pWsXce1C1y4O1y7i2oWuXcS1K127iGsX1oEu4tqFrl3E9SEuF7qIayXet7qIaxe6dtH389K1i+fa1dd4bly70bWruHala1eHa1dx7UrXrgFX1IGu4tqVdaCruHala1dx7cY60FVcu3IDrqu4dqVr18CDTmzAdfVcu/kaz41rd7p2E9dudO3mcO0mrt3o2k1cuzNfu4lr93AJjLh2E9dudO0mrk35oLObuHZjvnYT12507SauA5mv3TzX7r7Gc+Pag67dxbU7Xbs7XLuLa3e6dg+4Il+7qyvztbu41qRrd3HtwXztLq6PsaG/u7h2p2t3cV3HB0fdPdcevsZz49qTrj3EtQddezhce4hrD7r2ENcenL/2ENcedO0hrj3o2kO/QM3GyB7i2pPz1x7i2oOuPcR1G/O1h+fa09d4blx70bWnuPaka0+Ha09x7UnXnuLai3Wgp7j25H2rp7j2pGtPcS3P+WvPwLYs8rWnuPaka09xzcdtrp6eay9f47lx7U3XXuLai669HK69xLUXXXsFXFEHeolrL+ZrL3HtRdde4tqL69he4nqL89de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';

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

            /** 경매양식원본.xls 원본에 낙찰가(열 6)와 낙찰자(열 7)를 주입하고 새 바이너리 생성 */
            function fillAuctionTemplateXls(origXlsBytes, bidList) {
                const origBytes = new Uint8Array(origXlsBytes);
                const origWbLen = 1274662;
                const wbStreamBytes = origBytes.subarray(512, 512 + origWbLen);
                const siBytes = origBytes.subarray(512 + 2490 * 512, 512 + (2490 + 8) * 512);
                const dsiBytes = origBytes.subarray(512 + 2498 * 512, 512 + (2498 + 8) * 512);

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

                    // 7번 행 (1번 물품 수량/낙찰가/낙찰자)
                    if ((rtype === 0x027E || rtype === 0x0203) && rdata.length >= 6) {
                        const row = rview.getUint16(0, true);
                        const col = rview.getUint16(2, true);
                        const xf = rview.getUint16(4, true);
                        if (row === 7 && col === 3) {
                            if (sampleBids.length >= 1) {
                                const qtyVal = Number(sampleBids[0].qty) || 1;
                                const recBytes = createNumberRecord(7, 3, xf, qtyVal);
                                newRecords.push({ raw: recBytes });
                                continue;
                            }
                        } else if (row === 7 && col === 6) {
                            if (sampleBids.length >= 1) {
                                const recBytes = createNumberRecord(7, 6, xf, sampleBids[0].price);
                                newRecords.push({ raw: recBytes });
                                continue;
                            }
                        }
                    } else if (rtype === 0x00FD && rdata.length >= 6) {
                        const row = rview.getUint16(0, true);
                        const col = rview.getUint16(2, true);
                        const xf = rview.getUint16(4, true);
                        if (row === 7 && col === 7) {
                            if (sampleBids.length >= 1) {
                                const recBytes = createLabelRecord(7, 7, xf, sampleBids[0].bidder);
                                newRecords.push({ raw: recBytes });
                                continue;
                            }
                        }
                    }

                    // 8번 행 이후 (2번~992번 물품 MULBLANK 분할: 수량(열 3) = 기본 1, 낙찰가(열 6), 낙찰자(열 7))
                    if (rtype === 0x00BE && rdata.length >= 6) {
                        const row = rview.getUint16(0, true);
                        const fc = rview.getUint16(2, true);
                        const lc = rview.getUint16(rdata.length - 2, true);
                        const itemIdx = row - 7;
                        if (itemIdx >= 1 && itemIdx < sampleBids.length && fc === 2 && lc >= 8) {
                            const bid = sampleBids[itemIdx];
                            const count = lc - fc + 1;
                            const xfs = [];
                            for (let k = 0; k < count; k++) {
                                xfs.push(rview.getUint16(4 + k * 2, true));
                            }
                            // col 2: 품명 (BLANK)
                            const b2 = createBlankRecord(row, 2, xfs[0]);
                            // col 3: 수량 (NUMBER = 기본 1)
                            const qtyRec = createNumberRecord(row, 3, xfs[1], Number(bid.qty) || 1);
                            // col 4..5: 출품자, 비회원만 (MULBLANK)
                            const mb4_5 = createMulblankRecord(row, 4, 5, [xfs[2], xfs[3]]);
                            // col 6: 낙찰가 (NUMBER)
                            const priceRec = createNumberRecord(row, 6, xfs[4], bid.price);
                            // col 7: 낙찰자 (LABEL)
                            const bidderRec = createLabelRecord(row, 7, xfs[5], bid.bidder);

                            let remRec;
                            if (lc === 8) {
                                remRec = createBlankRecord(row, 8, xfs[6]);
                            } else {
                                remRec = createMulblankRecord(row, 8, lc, xfs.slice(6));
                            }
                            const totalL = b2.length + qtyRec.length + mb4_5.length + priceRec.length + bidderRec.length + remRec.length;
                            const combined = new Uint8Array(totalL);
                            let offset = 0;
                            combined.set(b2, offset); offset += b2.length;
                            combined.set(qtyRec, offset); offset += qtyRec.length;
                            combined.set(mb4_5, offset); offset += mb4_5.length;
                            combined.set(priceRec, offset); offset += priceRec.length;
                            combined.set(bidderRec, offset); offset += bidderRec.length;
                            combined.set(remRec, offset);

                            newRecords.push({ raw: combined });
                            continue;
                        }
                    }

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
            async function downloadAuctionTemplateExcel(rawRecords) {
                if (!rawRecords || rawRecords.length === 0) {
                    showAuctionToast('내보낼 낙찰 내역이 없습니다.', 'auction');
                    return;
                }

                try {
                    showAuctionToast('⏳ 양식 엑셀 파일 생성 중...', 'auction');
                    
                    // 1) 1번 물품부터 순서대로 정렬 (등록 시간순)
                    const sortedRecords = sortBidRecords(rawRecords, 'oldest');
                    const bidList = sortedRecords.map(r => {
                        const cleanNick = (r && r.nickname) ? String(r.nickname).replace(/^@/, '').trim() : '익명';
                        const p = parseFloat(r && r.price);
                        const wonPrice = !isNaN(p) ? Math.round(p * 10000) : 0;
                        const qty = (r && r.qty) ? (parseInt(r.qty, 10) || 1) : 1;
                        return {
                            price: wonPrice,
                            bidder: cleanNick,
                            qty: qty
                        };
                    });

                    // 2) 템플릿 압축 해제
                    const templateBytes = await decompressGzipBase64(AUCTION_TEMPLATE_GZIP_B64);

                    // 3) 낙찰가, 낙찰자 데이터 주입
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

                    showAuctionToast('📋 경매양식(.xls) 내보내기 완료!', 'success');
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

            // 경매양식 내보내기 (.xls)
            actionRow.appendChild(makeActionBtn(
                '📑', '양식 내보내기',
                'rgba(59,130,246,.15)', 'rgba(59,130,246,.4)', '#60a5fa',
                () => {
                    const rawRecords = getTodayBidRecords();
                    downloadAuctionTemplateExcel(rawRecords);
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
                    font-size:11.5px !important;
                    font-weight:700 !important;
                    display:flex !important;
                    align-items:center !important;
                    justify-content:center !important;
                    gap:6px !important;
                    white-space:nowrap !important;
                    overflow:hidden !important;
                    text-overflow:ellipsis !important;
                    transition:background .15s ease, border-color .15s ease, color .15s ease !important;
                `
            }
        );
        const initCount = getTodayBidRecords().length;
        renderBidButtonContent(bidListBtn, initCount);

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

        // 시뮬레이터 및 외부 개발/테스트용 브릿지 API 노출
        try {
            window.__AuctionAutomation = {
                version: '2.5',
                openBidModal: openBidListModal,
                removeBidModal: removeBidListUI,
                updateBidBadge: updateBidBadge,
                loadBidRecords: loadBidRecords,
                saveBidRecords: saveBidRecords,
                addBidRecord: addBidRecord,
                removeBidRecord: removeBidRecord,
                getTodayBidRecords: getTodayBidRecords,
                addDummyBidRecords: addDummyBidRecords,
                clearBidRecords: () => {
                    saveBidRecords([]);
                    updateBidBadge();
                    const modal = document.getElementById('__auction_bid_modal');
                    if (modal) openBidListModal();
                }
            };
        } catch (e) {}

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
