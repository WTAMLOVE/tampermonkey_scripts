// ==UserScript==
// @name         Bilibili 稍后再看：单视频置顶
// @namespace    https://github.com/local/bilibili-watchlater-pin
// @version      1.2.0
// @description  在稍后再看卡片上增加“置顶”按钮；将该视频重新加入列表，使其成为最近添加的第一项。
// @match        https://www.bilibili.com/watchlater/*
// @match        https://www.bilibili.com/list/watchlater*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const API = {
        remove: 'https://api.bilibili.com/x/v2/history/toview/del',
        add: 'https://api.bilibili.com/x/v2/history/toview/add',
    };
    const BUTTON_CLASS = 'wl-pin-button';
    let isWorking = false;

    function getCsrf() {
        const matched = document.cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/);
        return matched ? decodeURIComponent(matched[1]) : '';
    }

    function request(url, params) {
        const csrf = getCsrf();
        if (!csrf) return Promise.resolve({ code: -101, message: '未登录或无法读取 bili_jct' });

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url,
                data: new URLSearchParams({ ...params, csrf }).toString(),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                anonymous: false,
                onload: (response) => {
                    try {
                        resolve(JSON.parse(response.responseText));
                    } catch {
                        resolve({ code: -1, message: '接口返回无法解析' });
                    }
                },
                onerror: () => resolve({ code: -1, message: '网络请求失败' }),
                ontimeout: () => resolve({ code: -1, message: '网络请求超时' }),
            });
        });
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function getIdentity(card) {
        const candidateUrls = [...card.querySelectorAll('a[href]')].map((anchor) => anchor.href);
        let bvid = '';
        let aid = '';

        for (const href of candidateUrls) {
            try {
                const url = new URL(href, location.origin);
                bvid ||= url.searchParams.get('bvid') || url.pathname.match(/\/video\/(BV[\w]+)/i)?.[1] || '';
                aid ||= url.searchParams.get('oid') || url.searchParams.get('aid') || '';
            } catch {
                // 忽略非标准链接，继续寻找视频链接。
            }
            if (bvid && aid) break;
        }

        aid ||= card.dataset.aid || card.querySelector('[data-aid]')?.dataset.aid || '';
        return { bvid, aid };
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed', top: '76px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 2147483647, padding: '10px 14px', borderRadius: '8px', color: '#fff',
            background: type === 'error' ? '#f04438' : '#18191c', fontSize: '14px',
            boxShadow: '0 6px 20px rgba(0,0,0,.2)',
        });
        document.body.append(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    async function pin(card, button) {
        if (isWorking) {
            showToast('已有置顶操作正在进行，请稍候。');
            return;
        }

        const { bvid, aid } = getIdentity(card);
        if (!bvid || !aid) {
            showToast('未能读取此视频的编号，请刷新页面后重试。', 'error');
            return;
        }
        if (!confirm('置顶会把此视频从稍后再看中删除后立刻重新加入，使其成为“最近添加”的第一项。确定继续吗？')) return;

        isWorking = true;
        button.disabled = true;
        button.textContent = '置顶中…';
        try {
            const removed = await request(API.remove, { aid });
            if (removed.code !== 0) throw new Error(removed.message || `删除失败（${removed.code}）`);

            // 给服务端一点时间完成删除；若首次添加失败会再尝试一次，尽量避免意外丢失。
            await sleep(350);
            let added = await request(API.add, { bvid });
            if (added.code !== 0) {
                await sleep(700);
                added = await request(API.add, { bvid });
            }
            if (added.code !== 0) throw new Error(added.message || `重新加入失败（${added.code}）`);

            showToast('置顶成功，正在刷新列表。');
            setTimeout(() => location.reload(), 650);
        } catch (error) {
            console.error('[Watchlater Pin]', error);
            showToast(`置顶失败：${error.message}。该视频可能已被移出列表，请手动重新添加。`, 'error');
            button.disabled = false;
            button.textContent = '置顶';
        } finally {
            isWorking = false;
        }
    }

    function findDeleteButton(card) {
        // 新版卡片的删除控件有时仅是无文字的 SVG 图标，因此同时检测其 class。
        const candidates = [...card.querySelectorAll('button, [role="button"], [title], [aria-label], [class]')];
        const matched = candidates.find((element) => {
            if (element.classList.contains(BUTTON_CLASS)) return false;
            const className = typeof element.className === 'string'
                ? element.className
                : (element.className?.baseVal || '');
            const label = [element.textContent, element.title, element.getAttribute('aria-label'), className].join(' ');
            return /删除|移除|delete|remove|trash|recycle|close|del[-_]/i.test(label);
        });
        if (!matched) return null;
        const control = matched.closest('button, [role="button"], [class*="delete" i], [class*="remove" i], [class*="trash" i], [class*="close" i]');
        // 图标本身不能承载按钮样式，优先采用其可点击父元素。
        return control || (/^(svg|i|use|path)$/i.test(matched.tagName) ? matched.parentElement : matched);
    }

    function makeFallbackButton() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${BUTTON_CLASS} wl-pin-button--fallback`;
        Object.assign(button.style, {
            position: 'absolute', right: '42px', top: '10px', zIndex: 20,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            height: '28px', padding: '0 9px', border: 0, borderRadius: '6px',
            background: 'rgba(24, 25, 28, .72)', color: '#fff', cursor: 'pointer',
            fontSize: '13px', lineHeight: '28px', transition: 'background .2s',
        });
        button.addEventListener('mouseenter', () => { button.style.background = '#fb7299'; });
        button.addEventListener('mouseleave', () => { button.style.background = 'rgba(24, 25, 28, .72)'; });
        return button;
    }

    function addButtons() {
        document.querySelectorAll('.bili-video-card').forEach((card) => {
            if (card.querySelector(`.${BUTTON_CLASS}`)) return;
            const { bvid, aid } = getIdentity(card);
            if (!bvid || !aid) return;

            const deleteButton = findDeleteButton(card);
            const button = deleteButton
                ? document.createElement(deleteButton.tagName.toLowerCase())
                : makeFallbackButton();
            if (deleteButton) {
                // 复用 B 站删除按钮的 class 与内联样式，确保大小、颜色及悬停效果一致。
                const className = typeof deleteButton.className === 'string'
                    ? deleteButton.className
                    : (deleteButton.className?.baseVal || '');
                button.className = `${className} ${BUTTON_CLASS}`.trim();
                button.style.cssText = deleteButton.style.cssText;
                if (button instanceof HTMLButtonElement) button.type = 'button';
            }
            button.textContent = '置顶';
            button.title = '将此视频置为最近添加的第一项';
            button.setAttribute('aria-label', '置顶');
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                pin(card, button);
            }, true);

            if (deleteButton) {
                // 直接插在删除按钮之前，因此在水平操作区中始终位于删除按钮左侧。
                deleteButton.before(button);
            } else {
                // 兜底：B 站若再次更改删除图标的 DOM，仍显示可用按钮，而不会静默失效。
                if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
                card.append(button);
            }
        });
    }

    let timer;
    const refreshButtons = () => {
        clearTimeout(timer);
        timer = setTimeout(addButtons, 120);
    };

    addButtons();
    new MutationObserver(refreshButtons).observe(document.documentElement, { childList: true, subtree: true });
})();
