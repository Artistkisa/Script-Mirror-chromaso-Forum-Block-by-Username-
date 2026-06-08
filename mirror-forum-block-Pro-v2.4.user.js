// ==UserScript==
// @name         M系镜像站扩展-屏蔽功能
// @namespace    https://mirror.chromaso.net/
// @version      2.4
// @description  1.支持深度引用屏蔽；2.支持关键词对标题及标签(Tag)的同步屏蔽；3.新增屏蔽模式切换；4.引入倒计时冷静期及温馨提示，支持一键反悔。
// @author       Gemini辅助效率极高
// @match        https://mirror.chromaso.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';
  // v2.4.1 - Added empty keyword guard

  // --- 0. HTML 转义工具 ---
  const HTML_ESCAPE_MAP = {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'};
  const escapeHtml = (value) => String(value ?? '').replace(/[<>&"']/g, c => HTML_ESCAPE_MAP[c]);

  // --- 1. 数据初始化 ---
  let blockedUsers = GM_getValue('blockedUsers', []);
  let blockedKeywords = GM_getValue('blockedKeywords', []);
  let blockMode = GM_getValue('blockMode', 'replace');
  let panelCollapsed = GM_getValue('panelCollapsed', false);
  let activeTab = 'user';

  const normalizeName = (s) => (s || '').trim().replace(/["'：:]/g, '').toLowerCase();
  const getBlockedSet = () => new Set(blockedUsers.map(normalizeName));

  // --- 1b. 预编译关键词正则 ---
  let keywordRegex = null;
  function buildKeywordRegex() {
    const valid = blockedKeywords.filter(kw => kw.trim() !== '');
    if (valid.length === 0) {
      keywordRegex = null;
      return;
    }
    const escaped = valid.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    keywordRegex = new RegExp(escaped.join('|'));
  }
  buildKeywordRegex();

  function matchKeyword(text) {
    if (!keywordRegex) return null;
    const m = text.match(keywordRegex);
    return m ? m[0] : null;
  }

  // --- 2. 屏蔽渲染逻辑 ---
  function executeBlock(container, contentArea, reason, isTableRow = false) {
    if (!container || !contentArea) return;
    if (container.dataset.isUnmasked === 'true' || container.querySelector('.gm-block-mask')) return;

    if (blockMode === 'hide') {
      container.style.setProperty('display', 'none', 'important');
    } else {
      container.style.position = 'relative';
      container.style.overflow = 'hidden';

      const mask = document.createElement('div');
      mask.className = 'gm-block-mask';
      mask.style.cssText = `
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: #f9f9f9 !important; z-index: 100; display: flex;
        flex-direction: column; align-items: center; justify-content: center;
        cursor: pointer; border: 1px dashed #ccc; border-radius: 4px;
        box-sizing: border-box; min-height: 50px; padding: 10px;
        transition: all 0.2s, opacity 1.5s ease-out; opacity: 1;
      `;

      if (isTableRow) {
          const span = document.createElement('span');
          span.className = 'gm-mask-tip';
          span.style.cssText = 'color:#999; font-size:12px;';
          span.textContent = '\u{1F6AB} \u5DF2\u5C4F\u853D [' + reason + ']';
          mask.appendChild(span);
          mask.style.height = '100%';
          mask.style.padding = '0 10px';
      } else {
          const iconEl = document.createElement('div');
          iconEl.className = 'gm-icon';
          iconEl.style.cssText = 'font-size:18px; margin-bottom:5px;';
          iconEl.textContent = '\u{1F6AB}';
          const reasonEl = document.createElement('div');
          reasonEl.className = 'gm-reason';
          reasonEl.style.cssText = 'color:#666; font-size:11px; font-weight:bold; text-align:center;';
          reasonEl.textContent = '\u5185\u5BB9\u5C4F\u853D [' + reason + ']';
          const tipEl = document.createElement('div');
          tipEl.className = 'gm-mask-tip';
          tipEl.style.cssText = 'margin-top:6px; color:#007bff; font-size:11px; text-align:center;';
          tipEl.textContent = '\u70B9\u51FB\u5C55\u5F00';
          mask.appendChild(iconEl);
          mask.appendChild(reasonEl);
          mask.appendChild(tipEl);
      }

      let state = 0;
      let countdownTimer = null;
      let resetTimer = null;

      mask.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();

        const tipEl = mask.querySelector('.gm-mask-tip');
        const reasonEl = mask.querySelector('.gm-reason');
        const iconEl = mask.querySelector('.gm-icon');

        if (state === 0) {
            state = 1;
            mask.style.background = '#fff0f0';
            mask.style.border = '1px dashed #ff4d4f';
            if(tipEl) {
                tipEl.textContent = '\u26A0\uFE0F \u518D\u6B21\u70B9\u51FB\u786E\u8BA4 (3s\u81EA\u52A8\u91CD\u7F6E)';
                tipEl.style.color = '#ff4d4f';
                tipEl.style.fontWeight = 'bold';
            }
            resetTimer = setTimeout(() => {
                if(state === 1) resetToBlock();
            }, 3000);
        }
        else if (state === 1) {
            clearTimeout(resetTimer);
            state = 2;

            mask.style.background = '#e6f7ff';
            mask.style.border = '1px solid #1890ff';
            mask.style.cursor = 'pointer';

            if(reasonEl) reasonEl.style.display = 'none';
            if(iconEl) iconEl.textContent = '\u23F3';

            let count = 3;
            const updateText = () => {
                if(tipEl) {
                    tipEl.style.textAlign = 'center';
                    tipEl.style.width = '100%';
                    tipEl.innerHTML = '';
                    const warn = document.createElement('div');
                    warn.style.cssText = 'color:#555; font-size:11px; margin-bottom:10px; font-weight:normal; line-height:1.4;';
                    warn.textContent = '\u60A8\u771F\u7684\u8981\u770B\u60A8\u5C4F\u853D\u7684\u5185\u5BB9\u5417\uFF1F\u8FD9\u53EF\u80FD\u4F1A\u5F71\u54CD\u5FC3\u60C5\u54DF';
                    const counter = document.createElement('div');
                    counter.style.cssText = 'font-size:15px; color:#1890ff; font-weight:bold; margin-bottom:12px;';
                    counter.textContent = '\u6B63\u5728\u52A0\u8F7D ' + count + '...';
                    const cancel = document.createElement('div');
                    cancel.style.cssText = 'font-size:12px; color:#666; font-weight:bold; text-decoration:underline; background:rgba(255,255,255,0.5); padding:4px 8px; border-radius:4px; display:inline-block;';
                    cancel.textContent = '(\u70B9\u51FB\u6B64\u5904\u53CD\u6094)';
                    tipEl.appendChild(warn);
                    tipEl.appendChild(counter);
                    tipEl.appendChild(cancel);
                }
            };
            updateText();

            countdownTimer = setInterval(() => {
                count--;
                if(count > 0) {
                    updateText();
                } else {
                    clearInterval(countdownTimer);
                    revealContent();
                }
            }, 1000);
        }
        else if (state === 2) {
            clearInterval(countdownTimer);
            resetToBlock();
            if(tipEl) {
                tipEl.textContent = '\u2705 \u5DF2\u5B88\u62A4\u60A8\u7684\u5FC3\u60C5\uFF0C\u53D6\u6D88\u5C55\u5F00';
                tipEl.style.color = '#52c41a';
                tipEl.style.fontWeight = 'bold';
                tipEl.style.fontSize = '12px';
            }
            setTimeout(() => { if(state===0) resetToBlock(); }, 1200);
        }
      };

      function resetToBlock() {
          state = 0;
          mask.style.background = '#f9f9f9';
          mask.style.border = '1px dashed #ccc';
          mask.style.cursor = 'pointer';
          mask.style.opacity = '1';

          if (isTableRow) {
               mask.textContent = '';
               const span = document.createElement('span');
               span.className = 'gm-mask-tip';
               span.style.cssText = 'color:#999; font-size:12px;';
               span.textContent = '\u{1F6AB} \u5DF2\u5C4F\u853D [' + reason + ']';
               mask.appendChild(span);
          } else {
               const tipEl = mask.querySelector('.gm-mask-tip');
               const reasonEl = mask.querySelector('.gm-reason');
               const iconEl = mask.querySelector('.gm-icon');
               if(tipEl) {
                   tipEl.textContent = '\u70B9\u51FB\u5C55\u5F00';
                   tipEl.style.color = '#007bff';
                   tipEl.style.fontWeight = 'normal';
                   tipEl.style.marginTop = '6px';
                   tipEl.style.background = 'none';
                   tipEl.style.padding = '0';
               }
               if(reasonEl) reasonEl.style.display = 'block';
               if(iconEl) {
                   iconEl.textContent = '\u{1F6AB}';
                   iconEl.style.fontSize = '18px';
               }
          }
      }

      function revealContent() {
          mask.style.opacity = '0';
          mask.style.pointerEvents = 'none';
          container.dataset.isUnmasked = 'true';
          setTimeout(() => {
              container.style.overflow = '';
              mask.remove();
          }, 1500);
      }

      contentArea.appendChild(mask);
    }
  }

  // --- 3. 深度扫描逻辑 (v2.4 性能优化) ---
  function applyAll() {
    const blockedSet = getBlockedSet();

    // 3a. 处理帖子/详情页卡片（跳过已处理）
    document.querySelectorAll('.mm-post:not([data-gm-scanned])').forEach(post => {
      post.dataset.gmScanned = '1';
      const nameLink = post.querySelector('.card-header .ui-link[href^="/author/"]');
      const body = post.querySelector('.card-body');
      if (!nameLink || !body) return;
      const uRaw = nameLink.textContent.trim();

      if (blockedSet.has(normalizeName(uRaw))) { executeBlock(post, body, `\u7528\u6237: ${uRaw}`); return; }

      const linksInBody = body.querySelectorAll('a[href^="/author/"]');
      for (let link of linksInBody) {
          if (blockedSet.has(normalizeName(link.textContent.trim()))) {
              executeBlock(post, body, `\u5F15\u7528\u9ED1\u540D\u5355: ${link.textContent.trim()}`);
              return;
          }
      }

      if (!nameLink.dataset.blockBtnAdded) addBlockBtn(nameLink, uRaw);

      const hit = matchKeyword(body.textContent);
      if (hit) executeBlock(post, body, `\u5C4F\u853D\u8BCD: ${hit}`);
    });

    // 3b. 处理主题列表行（跳过已处理）
    document.querySelectorAll('#thread-table-main tbody tr:not([data-gm-scanned])').forEach(row => {
      row.dataset.gmScanned = '1';
      const authorLink = row.querySelector('a[href^="/author/"]');
      const titleLink = row.querySelector('a.ui-link[href^="/thread/"]');
      const tagsDiv = row.querySelector('td:nth-child(2)');

      if (!authorLink || !titleLink || !tagsDiv) return;

      const uRaw = authorLink.textContent.trim();
      if (blockedSet.has(normalizeName(uRaw))) {
          executeBlock(row, titleLink, `\u7528\u6237: ${uRaw}`, true);
      }
      else {
        if (!authorLink.dataset.blockBtnAdded) addBlockBtn(authorLink, uRaw);
        const hit = matchKeyword(tagsDiv.textContent);
        if (hit) executeBlock(row, titleLink, `\u5C4F\u853D\u8BCD: ${hit}`, true);
      }
    });
  }

  function addBlockBtn(el, name) {
    const btn = document.createElement('button');
    btn.textContent = '\u{1F6AB} \u5C4F\u853D';
    btn.style.cssText = `margin-left:8px; padding:1px 6px; font-size:11px; cursor:pointer; background:#fff; border:1px solid #ddd; border-radius:3px; color:#666;`;
    btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        if(confirm(`\u786E\u5B9A\u5C4F\u853D: ${name} ?`)) {
            if(!blockedUsers.includes(name)) {
                blockedUsers.push(name);
                GM_setValue('blockedUsers', blockedUsers);
                location.reload();
            }
        }
    };
    el.insertAdjacentElement('afterend', btn);
    el.dataset.blockBtnAdded = 'true';
  }

  // --- 4. 管理面板 ---
  function createPanel() {
    if (document.getElementById('gm-main-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'gm-main-panel';
    panel.style.cssText = `position:fixed; top:70px; right:15px; z-index:100000; font-family: sans-serif;`;
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => {
        if (e.target.id === 'p-ball' || e.target.parentElement?.id === 'p-ball') { panelCollapsed = false; GM_setValue('panelCollapsed', false); updatePanel(); }
        else if (e.target.id === 'p-close') { panelCollapsed = true; GM_setValue('panelCollapsed', true); updatePanel(); }
    });
    updatePanel();
  }

  function updatePanel() {
    const panel = document.getElementById('gm-main-panel');
    if (!panel) return;
    panel.innerHTML = '';
    if (panelCollapsed) {
        const ball = document.createElement('div');
        ball.id = 'p-ball';
        ball.style.cssText = 'width:40px; height:40px; background:#333; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,0.3); color:white;';
        ball.textContent = '\u{1F6E1}\uFE0F';
        panel.appendChild(ball);
        return;
    }
    const con = document.createElement('div');
    con.style.cssText = `width:260px; background:#fff; color:#333; padding:15px; border-radius:10px; box-shadow:0 10px 25px rgba(0,0,0,0.2); border: 1px solid #eee;`;

    // Build panel header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;';
    const title = document.createElement('strong');
    title.textContent = '\u{1F6E1}\uFE0F \u5C4F\u853D\u7BA1\u7406';
    const closeBtn = document.createElement('span');
    closeBtn.id = 'p-close';
    closeBtn.style.cssText = 'cursor:pointer; font-size:20px; color:#ccc;';
    closeBtn.textContent = '\u00D7';
    header.appendChild(title);
    header.appendChild(closeBtn);
    con.appendChild(header);

    // Tabs
    const tabWrap = document.createElement('div');
    tabWrap.style.cssText = 'display:flex; gap:2px; margin-bottom:10px; background:#f1f3f5; padding:2px; border-radius:6px;';
    ['user', 'key'].forEach(tab => {
        const d = document.createElement('div');
        d.className = 'p-tab';
        d.dataset.tab = tab;
        d.style.cssText = `flex:1; text-align:center; padding:5px; cursor:pointer; font-size:12px; border-radius:4px; ${activeTab===tab?'background:#fff;font-weight:bold;':''}`;
        d.textContent = tab === 'user' ? '\u7528\u6237' : '\u5C4F\u853D\u8BCD';
        tabWrap.appendChild(d);
    });
    con.appendChild(tabWrap);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex; gap:5px; margin-bottom:10px;';
    const input = document.createElement('input');
    input.id = 'p-input';
    input.type = 'text';
    input.placeholder = '\u6DFB\u52A0...';
    input.style.cssText = 'flex:1; padding:5px; border:1px solid #ddd; border-radius:4px; font-size:12px;';
    const addBtn = document.createElement('button');
    addBtn.id = 'p-add';
    addBtn.style.cssText = 'padding:0 10px; background:#409eff; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;';
    addBtn.textContent = '+';
    inputRow.appendChild(input);
    inputRow.appendChild(addBtn);
    con.appendChild(inputRow);

    // List
    const listWrap = document.createElement('div');
    listWrap.id = 'list-wrap';
    listWrap.style.cssText = 'max-height:140px; overflow-y:auto; border:1px solid #f0f0f0; border-radius:4px; margin-bottom:10px; font-size:12px;';
    const data = activeTab === 'user' ? blockedUsers : blockedKeywords;
    data.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; padding:5px 8px; border-bottom:1px solid #f9f9f9;';
        const span = document.createElement('span');
        span.style.wordBreak = 'break-all';
        span.textContent = item;
        const del = document.createElement('span');
        del.className = 'del-item';
        del.dataset.val = item;
        del.style.cssText = 'color:red; cursor:pointer;';
        del.textContent = '\u00D7';
        row.appendChild(span);
        row.appendChild(del);
        listWrap.appendChild(row);
    });
    con.appendChild(listWrap);

    // Mode selector
    const modeWrap = document.createElement('div');
    modeWrap.style.cssText = 'margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; font-size:12px; background:#fafafa; padding:5px; border-radius:4px;';
    const modeLabel = document.createElement('span');
    modeLabel.style.color = '#666';
    modeLabel.textContent = '\u6A21\u5F0F:';
    const modeOptions = document.createElement('div');
    ['replace', 'hide'].forEach(mode => {
        const label = document.createElement('label');
        label.style.cssText = mode === 'replace' ? 'margin-right:10px; cursor:pointer;' : 'cursor:pointer;';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'bmode';
        radio.value = mode;
        if (blockMode === mode) radio.checked = true;
        label.appendChild(radio);
        label.appendChild(document.createTextNode(mode === 'replace' ? ' \u906E\u7F69' : ' \u9690\u85CF'));
        modeOptions.appendChild(label);
    });
    modeWrap.appendChild(modeLabel);
    modeWrap.appendChild(modeOptions);
    con.appendChild(modeWrap);

    // Export/Import buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:5px;';
    const expBtn = document.createElement('button');
    expBtn.id = 'p-exp';
    expBtn.style.cssText = 'flex:1; padding:4px; font-size:11px; background:#eee; border:none; border-radius:4px; cursor:pointer;';
    expBtn.textContent = '\u5BFC\u51FA';
    const impBtn = document.createElement('button');
    impBtn.id = 'p-imp';
    impBtn.style.cssText = 'flex:1; padding:4px; font-size:11px; background:#eee; border:none; border-radius:4px; cursor:pointer;';
    impBtn.textContent = '\u5BFC\u5165';
    btnRow.appendChild(expBtn);
    btnRow.appendChild(impBtn);
    con.appendChild(btnRow);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.id = 'p-save';
    saveBtn.style.cssText = 'width:100%; margin-top:10px; padding:8px; background:#007bff; border:none; color:#fff; border-radius:6px; cursor:pointer; font-size:13px;';
    saveBtn.textContent = '\u4FDD\u5B58\u5237\u65B0';
    con.appendChild(saveBtn);

    panel.appendChild(con);

    // Event bindings
    con.querySelectorAll('.del-item').forEach(btn => {
      btn.onclick = () => {
        const val = btn.dataset.val;
        if(activeTab === 'user') blockedUsers = blockedUsers.filter(x => x !== val);
        else blockedKeywords = blockedKeywords.filter(x => x !== val);
        GM_setValue(activeTab === 'user' ? 'blockedUsers' : 'blockedKeywords', activeTab === 'user' ? blockedUsers : blockedKeywords);
        buildKeywordRegex();
        updatePanel();
      };
    });
    con.querySelectorAll('input[name="bmode"]').forEach(radio => { radio.onchange = (e) => { blockMode = e.target.value; GM_setValue('blockMode', blockMode); }; });
    addBtn.onclick = () => {
      const val = input.value.trim();
      if(val) {
        if(activeTab === 'user') { if(!blockedUsers.includes(val)) blockedUsers.push(val); }
        else { if(val.trim() && !blockedKeywords.includes(val)) blockedKeywords.push(val); }
        GM_setValue(activeTab === 'user' ? 'blockedUsers' : 'blockedKeywords', activeTab === 'user' ? blockedUsers : blockedKeywords);
        buildKeywordRegex();
        updatePanel();
      }
    };
    con.querySelectorAll('.p-tab').forEach(tab => { tab.onclick = () => { activeTab = tab.dataset.tab; updatePanel(); }; });
    saveBtn.onclick = () => location.reload();
    expBtn.onclick = () => prompt("\u914D\u7F6E\uFF1A", JSON.stringify({u:blockedUsers, k:blockedKeywords}));
    impBtn.onclick = () => {
      const s = prompt("\u7C98\u8D34\uFF1A");
      if(s) {
        try {
          const o = JSON.parse(s);
          if (!o || typeof o !== 'object') throw new Error('invalid format');
          const users = Array.isArray(o.u) ? o.u.filter(x => typeof x === 'string') : [];
          const keywords = Array.isArray(o.k) ? o.k.filter(x => typeof x === 'string') : [];
          blockedUsers = users;
          blockedKeywords = keywords;
          GM_setValue('blockedUsers', blockedUsers);
          GM_setValue('blockedKeywords', blockedKeywords);
          location.reload();
        } catch(e) {
          alert("\u5BFC\u5165\u5931\u8D25: " + e.message);
        }
      }
    };
  }

  // --- 5. 启动与监听 ---
  createPanel();
  applyAll();
  let timer;
  const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(applyAll, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
