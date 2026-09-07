const fs = require('fs');
let code = fs.readFileSync('static/js/input-bar.js', 'utf8');

// Replace pointerdown for Ctrl
code = code.replace(
    /DOM\.btnCtrlMenu\.addEventListener\('pointerdown', \(\) => \{[\s\S]*?\}, 260\);\n    \}\);/,
    `let ctrlStartX = 0, ctrlStartY = 0;
    DOM.btnCtrlMenu.addEventListener('pointerdown', (e) => {
        isLongPress = false;
        isHolding = false;
        ctrlStartX = e.clientX;
        ctrlStartY = e.clientY;
        pressTimer = setTimeout(() => {
            isLongPress = true;
            isHolding = true;
            openCtrlPopup();
        }, 260);
    }, { passive: true });`
);

// Replace pointermove for Ctrl
code = code.replace(
    /window\.addEventListener\('pointermove', \(e\) => \{\n        if \(\!isHolding \|\| DOM\.ctrlShortcutsPopup\.style\.display \!== 'block'\) return;/,
    `window.addEventListener('pointermove', (e) => {
        if (!isHolding || DOM.ctrlShortcutsPopup.style.display !== 'block') {
            if (pressTimer && (Math.abs(e.clientX - ctrlStartX) > 10 || Math.abs(e.clientY - ctrlStartY) > 10)) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            return;
        }`
);

// Replace pointerdown for Custom
code = code.replace(
    /btnCustomMenu\.addEventListener\('pointerdown', \(\) => \{[\s\S]*?\}, 260\);\n        \}\);/,
    `let customStartX = 0, customStartY = 0;
        btnCustomMenu.addEventListener('pointerdown', (e) => {
            isLongPressCustom = false;
            isHoldingCustom = false;
            customStartX = e.clientX;
            customStartY = e.clientY;
            pressTimerCustom = setTimeout(() => {
                isLongPressCustom = true;
                isHoldingCustom = true;
                openCustomPopup();
            }, 260);
        }, { passive: true });`
);

// Replace pointermove for Custom
code = code.replace(
    /window\.addEventListener\('pointermove', \(e\) => \{\n            if \(\!isHoldingCustom \|\| customShortcutsPopup\.style\.display \!== 'block'\) return;/,
    `window.addEventListener('pointermove', (e) => {
            if (!isHoldingCustom || customShortcutsPopup.style.display !== 'block') {
                if (pressTimerCustom && (Math.abs(e.clientX - customStartX) > 10 || Math.abs(e.clientY - customStartY) > 10)) {
                    clearTimeout(pressTimerCustom);
                    pressTimerCustom = null;
                }
                return;
            }`
);

// Replace pointerdown for Nav
code = code.replace(
    /btnNavMenu\.addEventListener\('pointerdown', \(e\) => \{[\s\S]*?\}, 260\);\n        \}\);/,
    `let navStartX = 0, navStartY = 0;
        btnNavMenu.addEventListener('pointerdown', (e) => {
            isLongPressNav = false;
            isHoldingNav = false;
            navStartX = e.clientX;
            navStartY = e.clientY;
            pressTimerNav = setTimeout(() => {
                isLongPressNav = true;
                isHoldingNav = true;
                openNavPopup();
            }, 260);
        }, { passive: true });`
);

// Replace pointermove for Nav
code = code.replace(
    /window\.addEventListener\('pointermove', \(e\) => \{\n            if \(\!isHoldingNav \|\| navShortcutsPopup\.style\.display \!== 'block'\) return;/,
    `window.addEventListener('pointermove', (e) => {
            if (!isHoldingNav || navShortcutsPopup.style.display !== 'block') {
                if (pressTimerNav && (Math.abs(e.clientX - navStartX) > 10 || Math.abs(e.clientY - navStartY) > 10)) {
                    clearTimeout(pressTimerNav);
                    pressTimerNav = null;
                }
                return;
            }`
);

fs.writeFileSync('static/js/input-bar.js', code);
