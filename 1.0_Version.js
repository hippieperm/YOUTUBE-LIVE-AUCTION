// ==UserScript==
// @name         YouTube Live 낙찰 자동화
// @namespace    https://youtube.com/
// @version      1.0
// @description  YouTube Live 낙찰 자동화 + 안내 버튼 + 밑줄 버튼
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {

    'use strict';

    const PREFIX = '[낙찰 자동화]';

    console.log(PREFIX, '시작');


    // =========================================================
    // OS
    // =========================================================

    const IS_MAC =
        /Mac|iPhone|iPad|iPod/i.test(
            navigator.platform ||
            navigator.userAgent
        );

    const MODIFIER_KEY =
        IS_MAC ? 'metaKey' : 'altKey';


    console.log(
        PREFIX,
        IS_MAC
            ? 'Mac: ⌘ + 클릭'
            : 'Windows/Linux: Alt + 클릭'
    );


    // =========================================================
    // 유틸
    // =========================================================

    function wait(ms) {

        return new Promise(
            resolve =>
                setTimeout(resolve, ms)
        );
    }


    // =========================================================
    // 닉네임 찾기
    // =========================================================

    function findAuthor(target) {

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

        if (
            target.id ===
            'author-name'
        ) {
            return target;
        }

        return target.closest(
            'yt-live-chat-author-chip #author-name'
        );
    }


    // =========================================================
    // 닉네임 추출
    // =========================================================

    function getNickname(author) {

        if (!author) {
            return null;
        }

        const nickname =
            author.textContent
                .trim()
                .replace(/^@+/, '')
                .trim();

        return nickname || null;
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
    // 낙찰 모달
    // =========================================================

    function openAuctionModal(
        nickname
    ) {

        console.log(
            PREFIX,
            'openAuctionModal:',
            nickname
        );


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
        // MODAL
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

                        width:440px !important;

                        max-width:
                            calc(100vw - 32px)
                            !important;

                        box-sizing:border-box
                            !important;

                        padding:
                            26px
                            !important;

                        background:
                            linear-gradient(
                                145deg,
                                rgba(38,38,42,.98),
                                rgba(24,24,27,.98)
                            )
                            !important;

                        color:#fff !important;

                        border:
                            1px solid
                            rgba(255,255,255,.10)
                            !important;

                        border-radius:
                            20px
                            !important;

                        box-shadow:
                            0 30px 100px
                            rgba(0,0,0,.65),
                            0 0 0 1px
                            rgba(255,255,255,.03)
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
                            20px;
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

                        gap:10px;
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
                        width:32px;
                        height:32px;

                        display:flex;

                        align-items:center;

                        justify-content:center;

                        border-radius:10px;

                        background:
                            rgba(255,204,0,.12);

                        color:#ffcc00;

                        font-size:17px;

                        font-weight:700;
                    `
                }
            );


        headerLeft.appendChild(
            icon
        );


        const titleWrap =
            createElement(
                'div'
            );


        const title =
            createElement(
                'div',
                {
                    text:
                        '낙찰 처리',

                    style: `
                        font-size:17px;

                        font-weight:700;
                    `
                }
            );


        const subtitle =
            createElement(
                'div',
                {
                    text:
                        '낙찰 정보를 입력하세요',

                    style: `
                        margin-top:2px;

                        color:
                            rgba(255,255,255,.42);

                        font-size:11px;
                    `
                }
            );


        titleWrap.appendChild(
            title
        );

        titleWrap.appendChild(
            subtitle
        );

        headerLeft.appendChild(
            titleWrap
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
                        width:32px;

                        height:32px;

                        padding:0;

                        border:0;

                        border-radius:9px;

                        background:
                            rgba(255,255,255,.06);

                        color:
                            rgba(255,255,255,.65);

                        font-size:22px;

                        line-height:30px;

                        cursor:pointer;
                    `
                }
            );


        close.addEventListener(
            'mouseenter',
            function () {

                close.style.background =
                    'rgba(255,255,255,.12)';

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
        // 닉네임
        // =====================================================

        const userCard =
            createElement(
                'div',
                {
                    style: `
                        padding:
                            17px 18px;

                        border-radius:
                            14px;

                        background:
                            linear-gradient(
                                135deg,
                                rgba(255,204,0,.10),
                                rgba(255,255,255,.045)
                            );

                        border:
                            1px solid
                            rgba(255,204,0,.13);

                        margin-bottom:
                            20px;
                    `
                }
            );


        const userLabel =
            createElement(
                'div',
                {
                    text:
                        '낙찰자',

                    style: `
                        color:
                            rgba(255,255,255,.42);

                        font-size:11px;

                        font-weight:600;

                        margin-bottom:7px;
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
                        color:#fff;

                        font-size:22px;

                        line-height:1.2;

                        font-weight:800;

                        letter-spacing:-.5px;

                        overflow:hidden;

                        text-overflow:ellipsis;

                        white-space:nowrap;
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
        // 금액
        // =====================================================

        const priceLabel =
            createElement(
                'div',
                {
                    text:
                        '낙찰가',

                    style: `
                        color:
                            rgba(255,255,255,.55);

                        font-size:12px;

                        font-weight:600;

                        margin-bottom:8px;
                    `
                }
            );


        modal.appendChild(
            priceLabel
        );


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

                        height:64px !important;

                        box-sizing:border-box
                            !important;

                        padding:
                            0 75px 0 18px
                            !important;

                        border:
                            1px solid
                            rgba(255,204,0,.20)
                            !important;

                        border-radius:
                            14px !important;

                        background:
                            rgba(0,0,0,.25)
                            !important;

                        color:#fff !important;

                        outline:none !important;

                        font-size:27px !important;

                        font-weight:800 !important;
                    `
                }
            );


        input.addEventListener(
            'focus',
            function () {

                input.style.borderColor =
                    'rgba(255,204,0,.70)';

                input.style.boxShadow =
                    '0 0 0 3px rgba(255,204,0,.08)';
            }
        );


        input.addEventListener(
            'blur',
            function () {

                input.style.borderColor =
                    'rgba(255,204,0,.20)';

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

                        right:18px;

                        top:50%;

                        transform:
                            translateY(-50%);

                        color:
                            #ffcc00;

                        font-size:15px;

                        font-weight:750;

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
        // BUTTON
        // =====================================================

        const buttonArea =
            createElement(
                'div',
                {
                    style: `
                        display:flex;

                        gap:9px;

                        margin-top:20px;
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

                        height:48px;

                        border:
                            1px solid
                            rgba(255,255,255,.09);

                        border-radius:11px;

                        background:
                            rgba(255,255,255,.055);

                        color:
                            rgba(255,255,255,.70);

                        cursor:pointer;

                        font-size:13px;

                        font-weight:600;
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

                        height:48px;

                        border:0;

                        border-radius:11px;

                        background:#ffcc00;

                        color:#161616;

                        cursor:pointer;

                        font-size:13px;

                        font-weight:800;
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
                        margin-top:9px;

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

        document.documentElement.appendChild(
            backdrop
        );

        document.documentElement.appendChild(
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
            !event[MODIFIER_KEY]
        ) {
            return;
        }


        const author =
            findAuthor(
                event.target
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


        console.log(
            PREFIX,
            'modifier + 클릭:',
            nickname
        );


        openAuctionModal(
            nickname
        );
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

        if (
            document.getElementById(
                '__auction_guide_panel'
            )
        ) {
            return;
        }


        const input =
            findChatInput();


        if (!input) {
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
        // 1행: 경매 참여 & 입찰 규칙 (회원등록 -> 입찰 안내 -> 호가 -> 낙찰 취소)
        // 2행: 사후 처리 & 방송 안내 (택배 -> 경매장 -> 채팅 안내 -> 응원문구)
        // =====================================================

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

        if (
            document.getElementById(
                '__auction_separator_button'
            )
        ) {
            return;
        }


        const input =
            findChatInput();


        if (!input) {
            return;
        }


        const parent =
            input.parentElement;


        if (!parent) {
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

        const input =
            findChatInput();


        if (!input) {
            return;
        }


        createGuidePanel();

        createSeparatorButton();
    }


    // =========================================================
    // UI 감시
    // =========================================================

    function startUIObserver() {

        createAllUI();


        const observer =
            new MutationObserver(
                function () {

                    createAllUI();

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
        // YouTube 채팅 재생성 대응
        // -----------------------------------------------------

        setInterval(
            function () {

                createAllUI();

            },
            1500
        );
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


        startUIObserver();


        console.log(
            PREFIX,
            '준비 완료'
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
