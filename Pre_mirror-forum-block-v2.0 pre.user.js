// ==UserScript==
// @name         M系镜像站扩展-屏蔽功能
// @namespace    https://mirror.chromaso.net/
// @version      2.0
// @description  1.深度引用屏蔽 2.关键词过滤 3.修复面板缩放点击失效问题
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
        box-sizing: border-box; min-height: 50px; padding: 5px;
      `;
      
      mask.innerHTML = `
        <div style="font-size:14px; margin-bottom:2px;">🚫</div>
        <div style="color:#666; font-size:11px; font-weight:bold; text-align:center;">内容屏蔽 [${escapeHtml(reason)}]</div>
        <div style="margin-top:4px; color:#007bff; font-size:10px;">点击展开</div>
      `;

      mask.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        container.dataset.isUnmasked = 'true'; 
        container.style.overflow = ''; 
        mask.remove();
      };

      if (isTableRow) {
        mask.style.height = '100%'; mask.style.padding = '0 10px';
        mask.innerHTML = `<span style="color:#999; font-size:12px;">🚫 已屏蔽 [${escapeHtml(reason)}]</span>`;
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
      if (blockedSet.has(normalizeName(uRaw))) {
        executeBlock(post, body, `用户: ${uRaw}`);
        return; 
      } 

      const linksInBody = body.querySelectorAll('a[href^="/author/"]');
      for (let link of linksInBody) {
          if (blockedSet.has(normalizeName(link.textContent.trim()))) {
              executeBlock(post, body, `引用黑名单: ${link.textContent.trim()}`);
              return;
          }
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
      if (blockedSet.has(normalizeName(uRaw))) {
        executeBlock(row, titleLink, `用户: ${uRaw}`, true);
      } else {
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

  // --- 4. 管理面板 (修复缩放逻辑) ---
  function createPanel() {
    if (document.getElementById('gm-main-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'gm-main-panel';
    panel.style.cssText = `position:fixed; top:70px; right:15px; z-index:100000; font-family: sans-serif;`;
    document.body.appendChild(panel);
    
    // 使用全局点击监听处理面板切换，确保永久有效
    panel.addEventListener('click', (e) => {
        if (e.target.id === 'p-ball' || e.target.parentElement?.id === 'p-ball') {
            panelCollapsed = false;
            GM_setValue('panelCollapsed', false);
            updatePanel();
        } else if (e.target.id === 'p-close') {
            panelCollapsed = true;
            GM_setValue('panelCollapsed', true);
            updatePanel();
        }
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
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
            <strong style="font-size:14px;">🛡️ 屏蔽管理</strong>
            <span id="p-close" style="cursor:pointer; font-size:20px; color:#ccc;">×</span>
        </div>
        <div style="display:flex; gap:2px; margin-bottom:10px; background:#f1f3f5; padding:2px; border-radius:6px;">
            <div id="tab-user" class="p-tab" data-tab="user" style="flex:1; text-align:center; padding:5px; cursor:pointer; font-size:12px; border-radius:4px; ${activeTab==='user'?'background:#fff;font-weight:bold;':''}">用户</div>
            <div id="tab-key" class="p-tab" data-tab="key" style="flex:1; text-align:center; padding:5px; cursor:pointer; font-size:12px; border-radius:4px; ${activeTab==='key'?'background:#fff;font-weight:bold;':''}">关键词</div>
        </div>
        <div style="display:flex; gap:5px; margin-bottom:10px;">
            <input id="p-input" type="text" placeholder="添加..." style="flex:1; padding:5px; border:1px solid #ddd; border-radius:4px; font-size:12px;">
            <button id="p-add" style="padding:0 10px; background:#409eff; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">+</button>
        </div>
        <div id="list-wrap" style="max-height:140px; overflow-y:auto; border:1px solid #f0f0f0; border-radius:4px; margin-bottom:10px; font-size:12px;"></div>
        <div style="display:flex; gap:5px;">
            <button id="p-exp" style="flex:1; padding:4px; font-size:11px; background:#eee; border:none; border-radius:4px; cursor:pointer;">导出</button>
            <button id="p-imp" style="flex:1; padding:4px; font-size:11px; background:#eee; border:none; border-radius:4px; cursor:pointer;">导入</button>
        </div>
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

    // 内部事件重新绑定
    con.querySelectorAll('.del-item').forEach(btn => {
        btn.onclick = () => {
            const val = btn.dataset.val;
            if(activeTab === 'user') blockedUsers = blockedUsers.filter(x => x !== val);
            else blockedKeywords = blockedKeywords.filter(x => x !== val);
            GM_setValue(activeTab === 'user' ? 'blockedUsers' : 'blockedKeywords', activeTab === 'user' ? blockedUsers : blockedKeywords);
            updatePanel();
        };
    });
    con.querySelector('#p-add').onclick = () => {
        const val = con.querySelector('#p-input').value.trim();
        if(val) {
            if(activeTab === 'user') { if(!blockedUsers.includes(val)) blockedUsers.push(val); }
            else { if(!blockedKeywords.includes(val)) blockedKeywords.push(val); }
            GM_setValue(activeTab === 'user' ? 'blockedUsers' : 'blockedKeywords', activeTab === 'user' ? blockedUsers : blockedKeywords);
            updatePanel();
        }
    };
    con.querySelectorAll('.p-tab').forEach(tab => {
        tab.onclick = () => { activeTab = tab.dataset.tab; updatePanel(); };
    });
    con.querySelector('#p-save').onclick = () => location.reload();
    con.querySelector('#p-exp').onclick = () => prompt("配置：", JSON.stringify({u:blockedUsers, k:blockedKeywords}));
    con.querySelector('#p-imp').onclick = () => {
        const s = prompt("粘贴：");
        if(s) { try{ const o=JSON.parse(s); blockedUsers=o.u||[]; blockedKeywords=o.k||[]; GM_setValue('blockedUsers',blockedUsers); GM_setValue('blockedKeywords',blockedKeywords); location.reload(); }catch(e){alert("错误");}}
    };
  }

  createPanel(); applyAll();
  let timer;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(applyAll, 300); });
  observer.observe(document.body, { childList: true, subtree: true });

})();
