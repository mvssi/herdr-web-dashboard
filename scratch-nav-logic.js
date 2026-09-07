    // --- Nav Commands Popup Logic ---
    const btnNavMenu = document.getElementById('btn-nav-menu');
    const navShortcutsPopup = document.getElementById('nav-shortcuts-popup');
    const navPopupBackdrop = document.getElementById('nav-popup-backdrop');
    
    if (btnNavMenu && navShortcutsPopup) {
        let pressTimerNav = null;
        let isLongPressNav = false;
        let isHoldingNav = false;

        function openNavPopup() {
            if (!navShortcutsPopup) return;
            navShortcutsPopup.style.display = 'block';
            if (navPopupBackdrop) navPopupBackdrop.style.display = 'block';

            const btnRect = btnNavMenu.getBoundingClientRect();
            const drawerRect = DOM.cliKeysDrawer ? DOM.cliKeysDrawer.getBoundingClientRect() : btnRect;
            const popupWidth = navShortcutsPopup.offsetWidth || 320;

            let left = btnRect.left;
            if (left + popupWidth > window.innerWidth - 10) {
                left = window.innerWidth - popupWidth - 10;
            }
            if (left < 10) left = 10;

            const bottom = Math.max(10, window.innerHeight - drawerRect.top + 6);

            navShortcutsPopup.style.left = `${Math.round(left)}px`;
            navShortcutsPopup.style.bottom = `${Math.round(bottom)}px`;
            navShortcutsPopup.classList.add('active');
            btnNavMenu.classList.add('active');
            triggerHaptic('medium');
        }

        function closeNavPopup() {
            if (!navShortcutsPopup) return;
            navShortcutsPopup.style.display = 'none';
            navShortcutsPopup.classList.remove('active');
            if (navPopupBackdrop) navPopupBackdrop.style.display = 'none';
            btnNavMenu.classList.remove('active');
            navShortcutsPopup.querySelectorAll('.ctrl-grid-item').forEach(el => el.classList.remove('drag-hover'));
        }

        // Pointerdown: start hold timer
        btnNavMenu.addEventListener('pointerdown', (e) => {
            isLongPressNav = false;
            isHoldingNav = false;
            pressTimerNav = setTimeout(() => {
                isLongPressNav = true;
                isHoldingNav = true;
                openNavPopup();
            }, 260);
        });

        // Window pointermove: if dragging finger/mouse after long-press, highlight hovered item
        window.addEventListener('pointermove', (e) => {
            if (!isHoldingNav || navShortcutsPopup.style.display !== 'block') return;
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const gridItem = target ? target.closest('.ctrl-grid-item') : null;
            navShortcutsPopup.querySelectorAll('.ctrl-grid-item').forEach(el => {
                el.classList.toggle('drag-hover', el === gridItem);
            });
        });

        // Window pointerup: handle long-press release selection or tap
        window.addEventListener('pointerup', (e) => {
            if (pressTimerNav) {
                clearTimeout(pressTimerNav);
                pressTimerNav = null;
            }
            if (isHoldingNav) {
                isHoldingNav = false;
                const target = document.elementFromPoint(e.clientX, e.clientY);
                const gridItem = target ? target.closest('.ctrl-grid-item') : null;
                if (gridItem) {
                    triggerShortcut(gridItem);
                }
                closeNavPopup();
            }
        });

        window.addEventListener('pointercancel', () => {
            if (pressTimerNav) {
                clearTimeout(pressTimerNav);
                pressTimerNav = null;
            }
            isHoldingNav = false;
        });

        // Click on Nav button: short tap toggles menu
        btnNavMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isLongPressNav) {
                isLongPressNav = false;
                return;
            }
            const isOpen = (navShortcutsPopup.style.display === 'block');
            if (isOpen) {
                closeNavPopup();
            } else {
                openNavPopup();
            }
        });

        // Click on individual grid items
        navShortcutsPopup.addEventListener('click', (e) => {
            const item = e.target.closest('.ctrl-grid-item');
            if (item) {
                triggerShortcut(item);
                closeNavPopup();
            }
        });

        if (navPopupBackdrop) {
            navPopupBackdrop.addEventListener('click', closeNavPopup);
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navShortcutsPopup.style.display === 'block') {
                closeNavPopup();
            }
        });
    }
