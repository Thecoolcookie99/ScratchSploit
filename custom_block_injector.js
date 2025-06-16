// ==UserScript==
// @name         Scratch JS Code Injector (Run Once)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Inject and execute custom JavaScript on Scratch sprites on demand. Runs only when you click the button.
// @author       Gemini (modified from user-provided script)
// @match        https://scratch.mit.edu/projects/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Finds the Scratch VM instance by traversing the React component tree.
     * @returns {object|null} The VM instance or null if not found.
     */
    function findScratchVM() {
        const app = document.getElementById('app');
        if (!app || !app._reactRootContainer || !app._reactRootContainer._internalRoot) {
            console.warn('JS Injector: React root not found.');
            return null;
        }

        let node = app._reactRootContainer._internalRoot.current;
        let attempts = 0;
        while (node && attempts < 100) {
            if (node.pendingProps && node.pendingProps.store && node.pendingProps.store.getState) {
                const vm = node.pendingProps.store.getState().scratchGui?.vm;
                if (vm) {
                    console.log('JS Injector: Scratch VM found!', vm);
                    return vm;
                }
            }
            node = node.child;
            attempts++;
        }
        console.error('JS Injector: Scratch VM not found after traversing React tree.');
        return null;
    }

    const vm = findScratchVM();

    if (!vm) {
        console.error('JS Injector: Cannot proceed without the Scratch VM. The tool will not be loaded.');
        return;
    }

    // --- UI Element Creation ---

    const ui = document.createElement('div');
    Object.assign(ui.style, {
        position: 'fixed',
        top: '110px', // Positioned below other tools
        right: '10px',
        width: '320px',
        backgroundColor: '#f8f8f8',
        border: '2px solid #bbb',
        borderRadius: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        zIndex: 9997,
        overflow: 'hidden',
        transition: 'max-height 0.3s ease',
        maxHeight: '40px', // Starts collapsed
    });

    const header = document.createElement('div');
    header.textContent = '⚙️ JS Code Injector';
    Object.assign(header.style, {
        backgroundColor: '#c0392b', // A distinct color
        color: 'white',
        padding: '10px',
        cursor: 'pointer',
        fontWeight: 'bold',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        userSelect: 'none',
        textAlign: 'center',
    });
    ui.appendChild(header);

    const content = document.createElement('div');
    Object.assign(content.style, {
        padding: '12px',
        display: 'none',
        flexDirection: 'column',
        gap: '12px',
    });

    // --- UI Components ---

    const spriteSelectLabel = document.createElement('label');
    spriteSelectLabel.textContent = 'Target Sprite (or leave for all):';
    spriteSelectLabel.style.fontSize = '13px';
    spriteSelectLabel.style.color = '#333';

    const spriteSelect = document.createElement('select');
    Object.assign(spriteSelect.style, {
        width: '100%',
        padding: '8px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        backgroundColor: 'white',
        fontSize: '14px',
    });

    const codeArea = document.createElement('textarea');
    codeArea.placeholder = '// Example:\ntarget.setVariable("my variable", 100);';
    Object.assign(codeArea.style, {
        width: '100%',
        minHeight: '120px',
        padding: '8px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        boxSizing: 'border-box',
        resize: 'vertical',
    });

    const injectRunBtn = document.createElement('button');
    injectRunBtn.textContent = 'Inject & Run Once';
    Object.assign(injectRunBtn.style, {
        padding: '10px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
        backgroundColor: '#2980b9', color: 'white', fontWeight: 'bold', fontSize: '14px',
        transition: 'background-color 0.2s ease, transform 0.1s ease',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    });
    injectRunBtn.onmouseenter = () => injectRunBtn.style.filter = 'brightness(90%)';
    injectRunBtn.onmouseleave = () => injectRunBtn.style.filter = 'brightness(100%)';

    const msgDiv = document.createElement('div');
    Object.assign(msgDiv.style, {
        marginTop: '5px', fontSize: '13px', textAlign: 'center',
        height: '18px', color: '#333', transition: 'opacity 0.4s ease', opacity: 0
    });

    content.append(spriteSelectLabel, spriteSelect, codeArea, injectRunBtn, msgDiv);
    ui.appendChild(content);
    document.body.append(ui);

    // --- UI Interaction & Core Logic ---

    function showMessage(msg, color = 'black') {
        msgDiv.textContent = msg;
        msgDiv.style.color = color;
        msgDiv.style.opacity = 1;
        clearTimeout(msgDiv._timeout);
        msgDiv._timeout = setTimeout(() => msgDiv.style.opacity = 0, 3500);
    }

    header.onclick = () => {
        const isExpanded = content.style.display === 'flex';
        content.style.display = isExpanded ? 'none' : 'flex';
        ui.style.maxHeight = isExpanded ? '40px' : '600px';

        // Populate dropdown when opened
        if (!isExpanded) {
            const currentSprite = spriteSelect.value;
            const options = ['-- All Sprites --', ...new Set(vm.runtime.targets.map(t => t.getName()))];
            spriteSelect.innerHTML = options.map(opt => {
                const value = opt === '-- All Sprites --' ? '' : opt;
                return `<option value="${value}">${opt}</option>`;
            }).join('');
            spriteSelect.value = currentSprite;
        }
    };

    injectRunBtn.onclick = () => {
        const code = codeArea.value.trim();
        const spriteFilter = spriteSelect.value;

        if (!code) {
            showMessage('Please enter some JavaScript code to run.', 'orange');
            return;
        }

        let fn;
        try {
            // Create a function from the user's code.
            // It receives the vm and the target sprite instance as arguments.
            fn = new Function('vm', 'target', code);
        } catch (e) {
            showMessage('Syntax error in your code. Check console.', 'red');
            console.error("JS Injector - Syntax Error:", e);
            return;
        }

        console.group('JS Injector: Executing script...');
        let injectedCount = 0;
        let errorCount = 0;

        vm.runtime.targets.forEach(target => {
            // Run on all targets if filter is empty, otherwise match by name.
            if (spriteFilter === '' || target.getName() === spriteFilter) {
                try {
                    fn(vm, target);
                    console.log(`✅ Executed on "${target.getName()}"`);
                    injectedCount++;
                } catch (e) {
                    console.error(`❌ Error while executing on "${target.getName()}":`, e);
                    errorCount++;
                }
            }
        });

        console.groupEnd();

        if (errorCount > 0) {
            showMessage(`Executed on ${injectedCount} targets with ${errorCount} errors.`, 'orange');
        } else if (injectedCount > 0) {
            showMessage(`✅ Successfully executed on ${injectedCount} target(s).`, 'green');
        } else {
             showMessage('⚠️ No matching targets found to run the script on.', 'red');
        }
    };
})();