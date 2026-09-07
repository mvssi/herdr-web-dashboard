function ensureWebglAddon() {
    if (!State.term || State.webglAddon) return;
    const WebglAddonClass = window.WebglAddon && (window.WebglAddon.WebglAddon || window.WebglAddon);
    if (!WebglAddonClass) return;
    try {
        State.webglAddon = new WebglAddonClass();
        State.webglAddon.onContextLoss(() => {
            if (State.webglAddon) {
                State.webglAddon.dispose();
                State.webglAddon = null;
            }
        });
        State.term.loadAddon(State.webglAddon);
        console.log('⚡ WebGL Hardware Accelerated Renderer activated for xterm!');
    } catch (e) {
        console.warn('WebGL addon initialization deferred/failed:', e);
    }
}

function initSubpixelScroll() {
    // Deprecated: Subpixel transform translations caused screen flickering and live stream scroll lock.
    // Native xterm with smoothScrollDuration: 0 provides rock-solid, jitter-free scrolling.
    if (State.term && State.term.element) {
        const screen = State.term.element.querySelector('.xterm-screen');
        if (screen) {
            screen.style.transform = '';
            screen.style.willChange = '';
            screen._subpixelScrollActive = false;
        }
    }
}

function initTouchScroll() {
    if (!DOM.terminalContainer || DOM.terminalContainer._touchScrollInitialized) return;
    DOM.terminalContainer._touchScrollInitialized = true;

    // Scroll TOUCH nativo: touch-action: pan-y + -webkit-overflow-scrolling sono
    // gia' su .xterm-viewport, quindi il browser gestisce il pan con il suo
    // momentum fluido. Il vecchio hijack JS (preventDefault + scrollTop manuale
    // + momentum custom su rAF) rendeva lo scroll scattoso su mobile: rimosso.
    // Teniamo solo l'aggiornamento dello stato 'atBottom' per la streaming view.
    const updateAtBottom = () => {
        if (!State.term) return;
        const buffer = State.term.buffer.active;
        if (buffer.viewportY >= (buffer.baseY - 1)) {
            State.terminalAtBottom = true;
            if (DOM.btnScrollBottom) DOM.btnScrollBottom.style.display = 'none';
        } else {
            State.terminalAtBottom = false;
            if (DOM.btnScrollBottom) DOM.btnScrollBottom.style.display = 'flex';
        }
    };

    DOM.terminalContainer.addEventListener('touchmove', updateAtBottom, { passive: true });
    DOM.terminalContainer.addEventListener('touchend', () => setTimeout(updateAtBottom, 80), { passive: true });
    DOM.terminalContainer.addEventListener('touchcancel', () => setTimeout(updateAtBottom, 80), { passive: true });

    // Desktop/Trackpad wheel handler
    DOM.terminalContainer.addEventListener('wheel', (e) => {
        if (e.deltaY < 0) {
            State.terminalAtBottom = false;
            if (DOM.btnScrollBottom) DOM.btnScrollBottom.style.display = 'flex';
        } else if (e.deltaY > 0) {
            setTimeout(() => {
                if (State.term) {
                    const buffer = State.term.buffer.active;
                    if (buffer.viewportY >= (buffer.baseY - 1)) {
                        State.terminalAtBottom = true;
                        if (DOM.btnScrollBottom) DOM.btnScrollBottom.style.display = 'none';
                    }
                }
            }, 50);
        }
    }, { passive: true });
}

let lastSyncedCols = null;
let lastSyncedRows = null;
let syncDebounceTimer = null;

// =============================================================================
// PTY GEOMETRY LOCK (cross-platform)
// Su Windows il demone herdr gestisce ConPTY e la dimensione del PTY e' fissata
// dal client TUI desktop: il dashboard non puo' forzarla. In quel caso il
// backend risponde al resize con la geometria reale e qui blocchiamo xterm su
// quella dimensione, centrando il canvas (.terminal-container.pty-locked).
// =============================================================================
let ptyGeometryLocked = false;

function lockTerminalToPty(cols, rows) {
    if (!State.term || !cols || !rows || cols <= 0 || rows <= 0) return;
    cols = Math.max(2, Math.floor(cols));
    rows = Math.max(2, Math.floor(rows));
    const alreadyLocked = ptyGeometryLocked;
    ptyGeometryLocked = true;
    if (DOM.terminalContainer) DOM.terminalContainer.classList.add('pty-locked');
    if (State.term.cols !== cols || State.term.rows !== rows) {
        try {
            State.term.resize(cols, rows);
            console.log(`📐 PTY geometry locked: ${cols}x${rows} (gestita dal demone herdr)`);
        } catch (e) {
            console.warn('[Terminal] lock geometry error:', e);
        }
    } else if (!alreadyLocked) {
        console.log(`📐 PTY geometry locked: ${cols}x${rows} (gestita dal demone herdr)`);
    }
    setTimeout(updatePtyDisplayMode, 40);
}

function unlockTerminalGeometry() {
    if (!ptyGeometryLocked) return;
    ptyGeometryLocked = false;
    if (DOM.terminalContainer) DOM.terminalContainer.classList.remove('pty-locked');
    disableTerminalReader();
    const xtermEl = State.term && State.term.element;
    if (xtermEl) {
        xtermEl.style.transform = '';
        xtermEl.style.marginBottom = '';
    }
    // Torniamo a riempire tutto il contenitore
    setTimeout(() => {
        try {
            if (State.fitAddon && DOM.terminalContainer && DOM.terminalContainer.offsetParent !== null) {
                State.fitAddon.fit();
            }
        } catch (e) {}
    }, 30);
}

// =============================================================================
// READER MODE (schermi stretti / mobile)
// Se il canvas PTY (es. 84 colonne fisse dal TUI desktop) non entra in
// larghezza con un font ancora leggibile, invece di scalare fino a diventare
// microscopico renderizza il contenuto come testo HTML con word-wrap e colori
// ANSI: leggibile, scroll nativo fluido, nessun taglio laterale.
// =============================================================================
let readerEl = null;
let readerActive = false;
let _readerLastText = '';
let _readerLastRev = -1;
let _readerPendingTimer = null;
let _readerForceRefresh = false;

function isReaderModeActive() {
    return readerActive;
}

function enableTerminalReader() {
    if (readerActive) return;
    readerActive = true;
    if (!readerEl && DOM.terminalContainer) {
        readerEl = document.createElement('div');
        readerEl.className = 'terminal-reader';
        DOM.terminalContainer.appendChild(readerEl);
    }
    if (!readerEl) return;
    const theme = (typeof TERMINAL_THEMES !== 'undefined' && TERMINAL_THEMES[State.theme]) || {};
    readerEl.style.color = theme.foreground || '#d4d4d4';
    readerEl.style.background = theme.background || 'transparent';
    readerEl.style.display = 'block';
    // Nasconde il canvas xterm preservandone il layout (evita re-fit oscillanti)
    if (State.term && State.term.element) State.term.element.style.visibility = 'hidden';
    _readerLastText = '';
    _readerLastRev = -1;
    _readerForceRefresh = true;
    console.log('Reader mode attivo (schermo stretto, PTY piu largo del viewport)');
}

function disableTerminalReader() {
    if (!readerActive) return;
    readerActive = false;
    if (readerEl) readerEl.style.display = 'none';
    if (State.term && State.term.element) State.term.element.style.visibility = '';
    if (_readerPendingTimer) { clearTimeout(_readerPendingTimer); _readerPendingTimer = null; }
}

// Decide la presentazione del PTY bloccato:
//  - scala >= 0.75 -> canvas xterm scalato (ancora leggibile)
//  - scala <  0.75 -> reader mode HTML con word-wrap
function updatePtyDisplayMode() {
    if (!ptyGeometryLocked || !State.term || !State.term.element) return;
    const screen = State.term.element.querySelector('.xterm-screen');
    if (!screen) return;
    const availW = (DOM.terminalContainer ? DOM.terminalContainer.clientWidth : 0) - 12;
    const nativeW = screen.offsetWidth;
    if (!availW || !nativeW) return;

    if (availW / nativeW < 0.75) {
        enableTerminalReader();
        const xtermEl = State.term.element;
        xtermEl.style.transform = '';
        xtermEl.style.marginBottom = '';
    } else {
        disableTerminalReader();
        applyPtyFitScale();
    }
}

const ANSI_PALETTE_16 = [
    '#3f3f46', '#f07178', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5',
    '#565f89', '#f07178', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#e2e2e2'
];

function ansi256ToHex(n) {
    if (n < 16) return ANSI_PALETTE_16[n] || null;
    if (n < 232) {
        const c = n - 16;
        const steps = [0, 95, 135, 175, 215, 255];
        const r = steps[Math.floor(c / 36)], g = steps[Math.floor((c % 36) / 6)], b = steps[c % 6];
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    const v = 8 + (n - 232) * 10;
    return 'rgb(' + v + ',' + v + ',' + v + ')';
}

// Converte un flusso di terminale (ANSI) in HTML sicuro con colori base.
// Le sequenze non-SGR (cursore, erase, OSC...) vengono rimosse.
const _ESC = String.fromCharCode(27);
const _BEL = String.fromCharCode(7);
const _CR = String.fromCharCode(13);
const _ANSI_RE = new RegExp(
    _ESC + '\\[([0-9;?]*)([A-Za-z])' +                     // CSI ... <finale> (SGR e altre)
    '|' + _ESC + '\\][^' + _ESC + _BEL + ']*(?:' + _BEL + '|' + _ESC + '\\\\)?' +  // OSC ... (BEL o ST)
    '|' + _ESC + '[=>NOMc78]' +                            // sequenze a 2 caratteri
    '|' + _CR,                                             // carriage return
    'g'
);

function ansiToHtml(text) {
    const chunks = [];
    let fg = null, bg = null, bold = false, dim = false, italic = false, underline = false;
    let spanOpen = false;

    const openSpan = () => {
        if (spanOpen) chunks.push('</span>');
        const decls = [];
        if (fg) decls.push('color:' + fg);
        if (bg) decls.push('background:' + bg);
        if (bold) decls.push('font-weight:600');
        if (dim) decls.push('opacity:0.6');
        if (italic) decls.push('font-style:italic');
        if (underline) decls.push('text-decoration:underline');
        chunks.push(decls.length ? '<span style="' + decls.join(';') + '">' : '<span>');
        spanOpen = true;
    };

    const applySgr = (params) => {
        let i = 0;
        while (i < params.length) {
            const p = params[i] === '' ? 0 : (parseInt(params[i], 10) || 0);
            if (p === 0) { fg = bg = null; bold = dim = italic = underline = false; }
            else if (p === 1) bold = true;
            else if (p === 2) dim = true;
            else if (p === 3) italic = true;
            else if (p === 4) underline = true;
            else if (p === 22) { bold = dim = false; }
            else if (p === 23) italic = false;
            else if (p === 24) underline = false;
            else if (p >= 30 && p <= 37) fg = ANSI_PALETTE_16[p - 30];
            else if (p === 39) fg = null;
            else if (p >= 40 && p <= 47) bg = ANSI_PALETTE_16[p - 40];
            else if (p === 49) bg = null;
            else if (p >= 90 && p <= 97) fg = ANSI_PALETTE_16[p - 90 + 8];
            else if (p >= 100 && p <= 107) bg = ANSI_PALETTE_16[p - 100 + 8];
            else if ((p === 38 || p === 48) && i + 1 < params.length) {
                const target = (p === 38) ? 'fg' : 'bg';
                if (params[i + 1] === '5' && i + 2 < params.length) {
                    const val = ansi256ToHex(parseInt(params[i + 2], 10) || 0);
                    if (target === 'fg') fg = val; else bg = val;
                    i += 2;
                } else if (params[i + 1] === '2' && i + 4 < params.length) {
                    const val = 'rgb(' + (parseInt(params[i + 2], 10) || 0) + ',' + (parseInt(params[i + 3], 10) || 0) + ',' + (parseInt(params[i + 4], 10) || 0) + ')';
                    if (target === 'fg') fg = val; else bg = val;
                    i += 4;
                }
            }
            i++;
        }
    };

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    _ANSI_RE.lastIndex = 0;
    let last = 0, m;
    while ((m = _ANSI_RE.exec(text)) !== null) {
        if (m.index > last) { openSpan(); chunks.push(esc(text.slice(last, m.index))); }
        if (m[1] !== undefined) {
            const finale = m[2];
            if (finale === 'm') {
                applySgr(m[1].split(';'));
                openSpan();
            }
            // altre sequenze CSI (cursore, erase, mode): scartate
        }
        last = _ANSI_RE.lastIndex;
    }
    if (last < text.length) { openSpan(); chunks.push(esc(text.slice(last))); }
    if (spanOpen) chunks.push('</span>');
    return chunks.join('');
}

function renderTerminalReader() {
    if (!readerEl) return;
    const atBottom = readerEl.scrollHeight - readerEl.scrollTop - readerEl.clientHeight < 48;
    readerEl.innerHTML = ansiToHtml(_readerLastText);
    if (atBottom || _readerForceRefresh) readerEl.scrollTop = readerEl.scrollHeight;
}

function readerUpdateFromPane(pane) {
    const rawText = pane.raw_text || '';
    const revision = pane.revision || 0;
    if (rawText === _readerLastText && revision === _readerLastRev) return;
    const paneChanged = (State.lastRenderedPaneId !== pane.pane_id);
    _readerLastText = rawText;
    _readerLastRev = revision;
    if (_readerForceRefresh || paneChanged) {
        _readerForceRefresh = false;
        if (_readerPendingTimer) { clearTimeout(_readerPendingTimer); _readerPendingTimer = null; }
        renderTerminalReader();
        return;
    }
    // Throttle: al massimo un re-render ogni 200ms (scroll resta fluido)
    if (_readerPendingTimer) return;
    _readerPendingTimer = setTimeout(() => {
        _readerPendingTimer = null;
        renderTerminalReader();
    }, 200);
}

// Scala il canvas xterm (geometria PTY fissa, es. 84x29) per farlo stare in
// larghezza nel contenitore: su mobile fa vedere TUTTE le colonne/righe del
// terminale del demone (COT, tool call e file modificati inclusi) senza tagli.
function applyPtyFitScale() {
    if (!ptyGeometryLocked || !State.term || !State.term.element) return;
    const xtermEl = State.term.element;
    const screen = xtermEl.querySelector('.xterm-screen');
    if (!screen) return;
    const availW = (DOM.terminalContainer ? DOM.terminalContainer.clientWidth : 0) - 12;
    const nativeW = screen.offsetWidth;
    if (!availW || !nativeW) return;

    let scale = availW / nativeW;
    if (scale >= 0.999) {
        xtermEl.style.transform = '';
        xtermEl.style.marginBottom = '';
        return;
    }
    if (scale < 0.4) scale = 0.4; // sotto: pan orizzontale manuale

    xtermEl.style.transformOrigin = 'top center';
    xtermEl.style.transform = `scale(${scale})`;
    // Compensa l'altezza di layout cosi' il footer non lascia un buco nero
    const nativeH = screen.offsetHeight;
    if (nativeH) {
        xtermEl.style.marginBottom = `${-Math.round(nativeH * (1 - scale))}px`;
    }
}

function syncTerminalSizeWithBackend(force = false) {
    if (!State.term) return;
    const cols = State.term.cols;
    const rows = State.term.rows;

    if (!cols || !rows || cols <= 0 || rows <= 0) return;
    if (!force && cols === lastSyncedCols && rows === lastSyncedRows) return;

    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
        lastSyncedCols = cols;
        lastSyncedRows = rows;
        const payload = {
            type: 'resize',
            pane_id: State.activePaneId || null,
            cols: cols,
            rows: rows
        };
        apiCall('/api/terminal/resize', payload).then((res) => {
            if (res && res.success === false && res.pty && res.pty.cols) {
                // Il backend non puo' ridimensionare il PTY: adotta la geometria reale
                lockTerminalToPty(res.pty.cols, res.pty.rows);
            } else if (res && res.success) {
                unlockTerminalGeometry();
            }
            console.log(`📡 PTY winsize synchronized: ${cols} cols x ${rows} rows`, res);
        }).catch(err => {
            console.warn('[Terminal Resize] PTY sync error:', err);
        });
    }, 60);
}

function initResizeObserver() {
    if (!DOM.terminalContainer || DOM.terminalContainer._resizeObserver) return;

    let resizeTimeout = null;
    const handleResize = () => {
        if (!State.term || !State.fitAddon) return;
        // Geometria PTY bloccata: niente fit (reader mode o canvas scalato
        // si occupano della presentazione). Ritenta comunque la
        // sincronizzazione: se il backend diventa 'resizable' ci riaggancia.
        if (ptyGeometryLocked) {
            syncTerminalSizeWithBackend(true);
            setTimeout(updatePtyDisplayMode, 60);
            return;
        }
        // Avoid fitting when viewport is hidden (0 dimensions)
        if (!DOM.terminalContainer || DOM.terminalContainer.offsetParent === null) return;
        if (DOM.screenChatActive && (DOM.screenChatActive.style.display === 'none' || DOM.screenChatActive.style.visibility === 'hidden')) return;

        try {
            State.fitAddon.fit();
            syncTerminalSizeWithBackend();
            if (typeof initSubpixelScroll === 'function') initSubpixelScroll();
        } catch (e) {
            console.warn('[Terminal Resize] fit error:', e);
        }
    };

    DOM.terminalContainer._resizeObserver = new ResizeObserver(() => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(handleResize, 40);
    });
    DOM.terminalContainer._resizeObserver.observe(DOM.terminalContainer);

    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleResize);
    }
}

function initTerminal() {
    if (!DOM.terminalContainer) return;

    const selectedTheme = TERMINAL_THEMES[State.theme] || TERMINAL_THEMES['cyber-dark'];

    State.term = new Terminal({
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: State.fontSize,
        lineHeight: 1.25,
        cursorBlink: false,
        cursorStyle: 'bar',
        cursorInactiveStyle: 'none',
        disableStdin: true,        // Pure read-only view: disables keyboard input and typing
        theme: selectedTheme,
        scrollback: 6000,
        convertEol: true,
        smoothScrollDuration: 0,   // MUST BE 0: eliminates 250ms animation delay, lag, and jitter during live streaming
        scrollSensitivity: 1,      // Natural feel for Mac trackpads and wheel
        fastScrollSensitivity: 4
    });

    if (window.FitAddon && FitAddon.FitAddon) {
        State.fitAddon = new FitAddon.FitAddon();
        State.term.loadAddon(State.fitAddon);
    }

    if (window.WebLinksAddon && WebLinksAddon.WebLinksAddon) {
        State.webLinksAddon = new WebLinksAddon.WebLinksAddon();
        State.term.loadAddon(State.webLinksAddon);
    }

    State.term.open(DOM.terminalContainer);

    // Disable and lock textarea to prevent mobile keyboard pop-up or focus steal
    if (State.term.textarea) {
        State.term.textarea.readOnly = true;
        State.term.textarea.disabled = true;
        State.term.textarea.tabIndex = -1;
        State.term.textarea.setAttribute('inputmode', 'none');
        State.term.textarea.setAttribute('aria-hidden', 'true');
        State.term.textarea.addEventListener('focus', () => {
            if (State.term && State.term.textarea) State.term.textarea.blur();
        });
        State.term.textarea.blur();
    }
    // Stub focus to prevent any touch or programmatic focus attempt
    State.term.focus = function() {};

    // ensureWebglAddon();
    initSubpixelScroll();
    initTouchScroll();
    initResizeObserver();

    // Initial mount: compute dimensions and synchronize with PTY backend immediately
    setTimeout(() => {
        try {
            if (State.fitAddon) State.fitAddon.fit();
            syncTerminalSizeWithBackend(true);
            // ensureWebglAddon();
            initSubpixelScroll();
            initTouchScroll();
        } catch (e) {}
    }, 40);

    State.terminalAtBottom = true;

    State.term.onScroll(() => {
        const buffer = State.term.buffer.active;
        const atBottom = buffer.viewportY >= (buffer.baseY - 1);
        // Only update to false if user triggered the scroll (not an active programmatic write)
        if (!State._isWritingToTerminal) {
            State.terminalAtBottom = atBottom;
            if (DOM.btnScrollBottom) DOM.btnScrollBottom.style.display = atBottom ? 'none' : 'flex';
        } else if (atBottom) {
            State.terminalAtBottom = true;
            if (DOM.btnScrollBottom) DOM.btnScrollBottom.style.display = 'none';
        }
    });

    if (DOM.btnScrollBottom) {
        DOM.btnScrollBottom.addEventListener('click', () => {
            State.terminalAtBottom = true;
            State.term.scrollToBottom();
            DOM.btnScrollBottom.style.display = 'none';
        });
    }
}

// =============================================================================
// MODE SWITCHER: CHAT (WHATSAPP) vs TERMINAL (XTERM)
// =============================================================================
