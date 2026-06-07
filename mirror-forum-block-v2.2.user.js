// ==UserScript==
// @name         M系镜像站扩展-屏蔽功能
// @namespace    https://mirror.chromaso.net/
// @version      2.2
// @description  主要改进：1.支持深度引用/被引用屏蔽；2.新增屏蔽模式切换（隐藏/遮罩）；3.引入防手贱二次确认机制；4.增加3秒倒计时冷静期及温馨提示，支持期间一键反悔。
// @match        https://mirror.chromaso.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // --- 0. HTML 转义工具 ---
  const escapeHtml = (str) => str.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));

  // --- 1. 数据初始化 ---
  let blockedUsers = GM_getValue('blockedUsers', []);
  let blockedKeywords = GM_getValue('blockedKeywords', []);
  let blockMode = GM_getValue('blockMode', 'replace'); 
  let panelCollapsed = GM_getValue('panelCollapsed', false);
  let activeTab = 'user'; 

  const normalizeName = (s) => (s || '').trim().replace(/["'：:]/g, '').toLowerCase();
  const getBlockedSet = () => new Set(blockedUsers.map(normalizeName));

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
      
      const iconHtml = `<div class="gm-icon" style="font-size:18px; margin-bottom:5px;">🚫</div>`;
      const reasonHtml = `<div class="gm-reason" style="color:#666; font-size:11px; font-weight:bold; text-align:center;">内容屏蔽 [${escapeHtml(reason)}]</div>`;
      const tipHtml = `<div class="gm-mask-tip" style="margin-top:6px; color:#007bff; font-size:11px; text-align:center;">点击展开</div>`;

      mask.innerHTML = isTableRow
          ? `<span class="gm-mask-tip" style="color:#999; font-size:12px;">🚫 已屏蔽 [${escapeHtml(reason)}]</span>`
          : (iconHtml + reasonHtml + tipHtml);

      if (isTableRow) { mask.style.height = '100%'; mask.style.padding = '0 10px'; }

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
                tipEl.innerHTML = '⚠️ 再次点击确认 (3s自动重置)';
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
            if(iconEl) iconEl.innerHTML = '⏳';
            
            let count = 3;
            const updateText = () => {
                if(tipEl) {
                    tipEl.style.textAlign = 'center';
                    tipEl.style.width = '100%';
                    tipEl.innerHTML = `
                        <div style="color:#555; font-size:11px; margin-bottom:10px; font-weight:normal; line-height:1.4;">您真的要看你屏蔽的内容吗？<br>这可能会影响心情哟</div>
                        <div style="font-size:15px; color:#1890ff; font-weight:bold; margin-bottom:12px;">正在加载 ${count}...</div>
                        <div style="font-size:12px; color:#666; font-weight:bold; text-decoration:underline; background:rgba(255,255,255,0.5); padding:4px 8px; border-radius:4px; display:inline-block;">(点击此处反悔)</div>
                    `;
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
                tipEl.innerHTML = '<div style="color:#52c41a; font-weight:bold; font-size:12px;">已守护您的心情，取消展开</div>';
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
               mask.innerHTML = `<span class="gm-mask-tip" style="color:#999; font-size:12px;">🚫 已屏蔽 [${escapeHtml(reason)}]</span>`;
          } else {
               const tipEl = mask.querySelector('.gm-mask-tip');
               const reasonEl = mask.querySelector('.gm-reason');
               const iconEl = mask.querySelector('.gm-icon');
               if(tipEl) {
                   tipEl.innerHTML = '点击展开';
                   tipEl.style.color = '#007bff';
                   tipEl.style.fontWeight = 'normal';
                   tipEl.style.marginTop = '6px';
                   tipEl.style.background = 'none';
                   tipEl.style.padding = '0';
               }
               if(reasonEl) reasonEl.style.display = 'block';
               if(iconEl) {
                   iconEl.innerHTML = '🚫';
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

  // --- 3. 深度扫描逻辑 ---
  function applyAll() {
    const blockedSet = getBlockedSet();
    document.querySelectorAll('.mm-post').forEach(post => {
      const nameLink = post.querySelector('.card-header .ui-link[href^="/author/"]');
      const body = post.querySelector('.card-body');
      if (!nameLink || !body) return;
      const uRaw = nameLink.textContent.trim();
      if (blockedSet.has(normalizeName(uRaw))) { executeBlock(post, body, `用户: ${uRaw}`); return; } 
      const linksInBody = body.querySelectorAll('a[href^="/author/"]');
      for (let link of linksInBody) {
          if (blockedSet.has(normalizeName(link.textContent.trim()))) { executeBlock(post, body, `引用黑名单: ${link.textContent.trim()}`); return; }
      }
      if (!nameLink.dataset.blockBtnAdded) addBlockBtn(nameLink, uRaw);
      if (blockedKeywords.length > 0) {
        const hit = blockedKeywords.find(kw => body.textContent.includes(kw));
        if (hit) executeBlock(post, body, `关键词: ${hit}`);
      }
    });
    document.querySelectorAll('#thread-table-main tbody tr').forEach(row => {
      const authorLink = row.querySelector('a[href^="/author/"]');
      const titleLink = row.querySelector('a.ui-link[href^="/thread/"]');
      if (!authorLink || !titleLink) return;
      const uRaw = authorLink.textContent.trim();
      if (blockedSet.has(normalizeName(uRaw))) { executeBlock(row, titleLink, `用户: ${uRaw}`, true); } 
      else {
        if (!authorLink.dataset.blockBtnAdded) addBlockBtn(authorLink, uRaw);
        if (blockedKeywords.length > 0) {
          const hit = blockedKeywords.find(kw => titleLink.textContent.includes(kw));
          if (hit) executeBlock(row, titleLink, `关键词: ${hit}`, true);
        }
      }
    });
  }

  function addBlockBtn(el, name) {
    const btn = document.createElement('button');
    btn.innerHTML = '🚫 屏蔽';
    btn.style.cssText = `margin-left:8px; padding:1px 6px; font-size:11px; cursor:pointer; background:#fff; border:1px solid #ddd; border-radius:3px; color:#666;`;
    btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        if(confirm(`确定屏蔽: ${name} ?`)) {
            if(!blockedUsers.includes(name)) { blockedUsers.push(name); GM_setValue('blockedUsers', blockedUsers); location.reload(); }
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
        panel.innerHTML = `<div id="p-ball" style="width:40px; height:40px; background:#333; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,0.3); color:white;">🛡️</div>`;
        return;
    }
    const con = document.createElement('div');
    con.style.cssText = `width:260px; background:#fff; color:#333; padding:15px; border-radius:10px; box-shadow:0 10px 25px rgba(0,0,0,0.2); border: 1px solid #eee;`;
    con.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;"><strong>🛡️ 屏蔽管理</strong><span id="p-close" style="cursor:pointer; font-size:20px; color:#ccc;">×</span></div>
        <div style="display:flex; gap:2px; margin-bottom:10px; background:#f1f3f5; padding:2px; border-radius:6px;">
            <div id="tab-user" class="p-tab" data-tab="user" style="flex:1; text-align:center; padding:5px; cursor:pointer; font-size:12px; border-radius:4px; ${activeTab==='user'?'background:#fff;font-weight:bold;':''}">用户</div>
            <div id="tab-key" class="p-tab" data-tab="key" style="flex:1; text-align:center; padding:5px; cursor:pointer; font-size:12px; border-radius:4px; ${activeTab==='key'?'background:#fff;font-weight:bold;':''}">关键词</div>
        </div>
        <div style="display:flex; gap:5px; margin-bottom:10px;"><input id="p-input" type="text" placeholder="添加..." style="flex:1; padding:5px; border:1px solid #ddd; border-radius:4px; font-size:12px;"><button id="p-add" style="padding:0 10px; background:#409eff; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">+</button></div>
        <div id="list-wrap" style="max-height:140px; overflow-y:auto; border:1px solid #f0f0f0; border-radius:4px; margin-bottom:10px; font-size:12px;"></div>
        <div style="margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; font-size:12px; background:#fafafa; padding:5px; border-radius:4px;">
            <span style="color:#666;">屏蔽模式:</span>
            <div><label style="margin-right:10px; cursor:pointer;"><input type="radio" name="bmode" value="replace" ${blockMode==='replace'?'checked':''}> 遮罩</label><label style="cursor:pointer;"><input type="radio" name="bmode" value="hide" ${blockMode==='hide'?'checked':''}> 隐藏</label></div>
        </div>
        <div style="display:flex; gap:5px;"><button id="p-exp" style="flex:1; padding:4px; font-size:11px; background:#eee; border:none; border-radius:4px;">导出</button><button id="p-imp" style="flex:1; padding:4px; font-size:11px; background:#eee; border:none; border-radius:4px;">导入</button></div>
        <button id="p-save" style="width:100%; margin-top:10px; padding:8px; background:#007bff; border:none; color:#fff; border-radius:6px; cursor:pointer; font-size:13px;">保存刷新</button>
    `;
    panel.appendChild(con);
    const listWrap = con.querySelector('#list-wrap');
    const data = activeTab === 'user' ? blockedUsers : blockedKeywords;
    data.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = `display:flex; justify-content:space-between; padding:5px 8px; border-bottom:1px solid #f9f9f9;`;
        const span = document.createElement('span');
        span.style.wordBreak = 'break-all';
        span.textContent = item;
        const del = document.createElement('span');
        del.className = 'del-item';
        del.dataset.val = item;
        del.style.cssText = 'color:red; cursor:pointer;';
        del.textContent = '×';
        row.appendChild(span);
        row.appendChild(del);
        listWrap.appendChild(row);
    });
    con.querySelectorAll('.del-item').forEach(btn => { btn.onclick = () => { const val = btn.dataset.val; if(activeTab === 'user') blockedUsers = blockedUsers.filter(x => x !== val); else blockedKeywords = blockedKeywords.filter(x => x !== val); GM_setValue(activeTab === 'user' ? 'blockedUsers' : 'blockedKeywords', activeTab === 'user' ? blockedUsers : blockedKeywords); updatePanel(); }; });
    con.querySelectorAll('input[name="bmode"]').forEach(radio => { radio.onchange = (e) => { blockMode = e.target.value; GM_setValue('blockMode', blockMode); }; });
    con.querySelector('#p-add').onclick = () => { const val = con.querySelector('#p-input').value.trim(); if(val) { if(activeTab === 'user') { if(!blockedUsers.includes(val)) blockedUsers.push(val); } else { if(!blockedKeywords.includes(val)) blockedKeywords.push(val); } GM_setValue(activeTab === 'user' ? 'blockedUsers' : 'blockedKeywords', activeTab === 'user' ? blockedUsers : blockedKeywords); updatePanel(); } };
    con.querySelectorAll('.p-tab').forEach(tab => { tab.onclick = () => { activeTab = tab.dataset.tab; updatePanel(); }; });
    con.querySelector('#p-save').onclick = () => location.reload();
    con.querySelector('#p-exp').onclick = () => prompt("配置：", JSON.stringify({u:blockedUsers, k:blockedKeywords}));
    con.querySelector('#p-imp').onclick = () => { const s = prompt("粘贴："); if(s) { try{ const o=JSON.parse(s); blockedUsers=o.u||[]; blockedKeywords=o.k||[]; GM_setValue('blockedUsers',blockedUsers); GM_setValue('blockedKeywords',blockedKeywords); location.reload(); }catch(e){alert("错误");}} };
  }

  createPanel(); applyAll();
  let timer;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(applyAll, 300); });
  observer.observe(document.body, { childList: true, subtree: true });

})();
