// ==UserScript==
// @name         Scratch tools (Draggable)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Inject and execute custom JavaScript on Scratch sprites on demand. Runs only when you click the button. Now draggable!
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
        top: '10px', // Positioned as per original request
        right: '350px',
        width: '320px',
        backgroundColor: '#f8f8f8',
        border: '2px solid #bbb',
        borderRadius: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        zIndex: 9997, // Lower z-index than Broadcast Sender (9998)
        overflow: 'hidden',
        transition: 'max-height 0.3s ease', // Only for collapse/expand
        maxHeight: '40px', // Starts collapsed
        // cursor: 'move', // Will be set by drag logic to 'grab'/'grabbing'
    });

    const header = document.createElement('div');
    header.textContent = '⚙️ JS Code Injector';
    Object.assign(header.style, {
        backgroundColor: '#c0392b', // A distinct color
        color: 'white',
        padding: '10px',
        cursor: 'grab', // Indicate draggable action
        fontWeight: 'bold',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        userSelect: 'none', // Prevent text selection during drag
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

    header.onclick = (e) => {
        // Prevent click from triggering drag if dragStart was initiated
        if (e.target !== header) return; // Only trigger if click is directly on header, not on child elements

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

    // --- Draggable Functionality ---
    let isDragging = false;
    let offsetX = 0; // Offset of mouse from element's left edge
    let offsetY = 0; // Offset of mouse from element's top edge

    header.addEventListener('pointerdown', dragStart);

    function dragStart(e) {
        // Prevent default browser behavior (like text selection)
        e.preventDefault();
        // Stop event propagation to prevent it from interfering with header.onclick
        e.stopPropagation();

        // Only handle primary mouse button (left click)
        if (e.button !== 0) return;

        isDragging = true;
        header.style.cursor = 'grabbing';

        // Get the current computed style to determine if it's using 'right' or 'left'
        const computedStyle = window.getComputedStyle(ui);
        let currentLeft = parseFloat(computedStyle.left);
        let currentTop = parseFloat(computedStyle.top);
        let currentRight = parseFloat(computedStyle.right); // Check for existing 'right'

        // If the 'left' property isn't explicitly set (or is 'auto'), calculate it from 'right'
        // This ensures 'ui.style.left' is always a valid number before calculating offset
        if (isNaN(currentLeft) || computedStyle.left === 'auto') {
            // clientWidth includes padding but not scrollbar
            // ui.offsetWidth includes padding and border
            currentLeft = document.documentElement.clientWidth - ui.offsetWidth - currentRight;
            ui.style.left = currentLeft + 'px';
            ui.style.right = 'auto'; // Clear the 'right' property once 'left' is set
        }

        // Calculate the offset (mouse position relative to element's top-left corner)
        offsetX = e.clientX - currentLeft;
        offsetY = e.clientY - currentTop;

        // Add listeners to the document to ensure dragging continues even if
        // the pointer leaves the header area, and for reliable release
        document.addEventListener('pointermove', drag);
        document.addEventListener('pointerup', dragEnd);
    }

    function drag(e) {
        if (!isDragging) return;

        e.preventDefault(); // Prevent default during drag (e.g., text selection)

        // Calculate new position based on current mouse position and stored offset
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        // Apply new positions
        ui.style.left = newLeft + 'px';
        ui.style.top = newTop + 'px';
    }

    function dragEnd(e) {
        isDragging = false;
        header.style.cursor = 'grab';

        // Clean up event listeners
        document.removeEventListener('pointermove', drag);
        document.removeEventListener('pointerup', dragEnd);
    }

})();
(function () {
    'use strict';

    // Function to find the Scratch VM instance.
    // This relies on internal React structures, which can be brittle with Scratch updates.
    function findScratchVM() {
        const app = document.getElementById('app');
        // Attempt to find the React root and traverse its children to find the VM store.
        let node = app?._reactRootContainer?._internalRoot?.current;
        let attempts = 0; // Added for safety to prevent infinite loops
        while (node && attempts < 100) { // Limit attempts
            // Check if the current node or its pending props contain a store with a VM
            if (node.pendingProps && node.pendingProps.store && node.pendingProps.store.getState) {
                const vm = node.pendingProps.store.getState().scratchGui?.vm;
                if (vm) {
                    console.log('Scratch VM found:', vm);
                    return vm;
                }
            }
            // Move to the next child node
            node = node.child;
            attempts++;
        }
        console.warn('Scratch VM not found in React tree.');
        return null;
    }

    const vm = findScratchVM();

    // If VM is not found, do not inject the UI to prevent errors.
    if (!vm) {
        console.error('Failed to find Scratch VM. The variable/list tool will not be loaded.');
        return;
    }

    // --- UI Element Creation ---

    const ui = document.createElement('div');
    Object.assign(ui.style, {
        position: 'fixed',
        top: '10px',
        right: '10px', // Initial right position
        width: '320px',
        backgroundColor: '#f8f8f8',
        border: '2px solid #bbb',
        borderRadius: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        zIndex: 9999, // Highest z-index for this tool
        overflow: 'hidden',
        transition: 'max-height 0.3s ease', // Only for collapse/expand
        maxHeight: '40px',
        padding: '0',
    });

    const header = document.createElement('div');
    header.textContent = '⚙ Scratch Variable & List Injector';
    Object.assign(header.style, {
        backgroundColor: '#4a90e2',
        color: 'white',
        padding: '10px',
        cursor: 'grab', // Indicate draggable action
        fontWeight: 'bold',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        userSelect: 'none', // Prevent text selection during drag
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center' // Centering header text
    });
    ui.appendChild(header);

    const content = document.createElement('div');
    Object.assign(content.style, {
        padding: '10px',
        display: 'none',
        flexDirection: 'column',
        gap: '10px', // Increased gap
        position: 'relative'
    });

    // Helper to create a labeled input with a dropdown for suggestions
    function createLabeledInputWithDropdown(labelText, getOptionsFunc) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';

        const input = document.createElement('input');
        input.placeholder = labelText;
        Object.assign(input.style, {
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '8px', // Larger padding and more rounded
            width: '100%',
            boxSizing: 'border-box',
            fontSize: '14px' // Slightly larger font
        });

        const dropdownBtn = document.createElement('button');
        dropdownBtn.textContent = '▼';
        Object.assign(dropdownBtn.style, {
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)', // Centered vertically
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            color: '#666' // Subtle color
        });

        const dropdown = document.createElement('div');
        Object.assign(dropdown.style, {
            position: 'absolute',
            top: '42px',
            left: '0',
            width: '100%',
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px', // More rounded
            zIndex: '10000',
            maxHeight: '180px',
            overflowY: 'auto',
            display: 'none',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)', // Stronger shadow
            padding: '5px 0' // Padding for dropdown items
        });

        dropdownBtn.onclick = () => {
            if (dropdown.style.display === 'block') {
                dropdown.style.display = 'none';
            } else {
                const options = getOptionsFunc();
                dropdown.innerHTML = '';
                if (options.length === 0) {
                    const noOptions = document.createElement('div');
                    noOptions.textContent = 'No options available.';
                    Object.assign(noOptions.style, { padding: '8px', color: '#888', textAlign: 'center' });
                    dropdown.appendChild(noOptions);
                } else {
                    options.forEach(opt => {
                        const item = document.createElement('div');
                        item.textContent = opt;
                        Object.assign(item.style, {
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        });
                        item.onmouseenter = () => item.style.backgroundColor = '#f0f0f0';
                        item.onmouseleave = () => item.style.backgroundColor = '#fff';
                        item.onclick = () => {
                            input.value = opt;
                            dropdown.style.display = 'none';
                        };
                        dropdown.appendChild(item);
                    });
                }
                dropdown.style.display = 'block';
            }
        };

        // Close dropdown if clicked outside
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target) && dropdown.style.display === 'block') {
                dropdown.style.display = 'none';
            }
        });

        wrapper.append(input, dropdownBtn, dropdown);
        return { wrapper, input };
    }

    // Helper to get all variable names based on sprite scope
    function getAllVariableNames(spriteName) {
        // If spriteName is empty, target the stage; otherwise, target the specific sprite
        const targets = vm.runtime.targets.filter(t => spriteName ? t.getName() === spriteName : t.isStage);
        return targets.flatMap(t => Object.values(t.variables))
                      .filter(v => v.type === '') // Filter for regular variables, not lists
                      .map(v => v.name);
    }

    // Helper to get all list names based on sprite scope
    function getAllListNames(spriteName) {
        // If spriteName is empty, target the stage; otherwise, target the specific sprite
        const targets = vm.runtime.targets.filter(t => spriteName ? t.getName() === spriteName : t.isStage);
        return targets.flatMap(t => Object.values(t.variables))
                      .filter(v => v.type === 'list') // Filter for lists
                      .map(v => v.name);
    }

    // Helper to get all sprite names (including Stage)
    function getAllSpriteNames() {
        // Returns names of all targets, including the stage (which typically has name "Stage")
        return vm.runtime.targets.map(t => t.getName());
    }

    // Helper to create a generic input field
    function createInput(placeholder) {
        const el = document.createElement('input');
        el.placeholder = placeholder;
        Object.assign(el.style, {
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            width: '100%',
            boxSizing: 'border-box',
            fontSize: '14px'
        });
        return el;
    }

    // Helper to create a styled button
    function createButton(text, bg) {
        const btn = document.createElement('button');
        btn.textContent = text;
        Object.assign(btn.style, {
            padding: '8px 12px',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            backgroundColor: bg,
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
            transition: 'background-color 0.2s ease, transform 0.1s ease', // Smooth transitions
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)' // Subtle shadow
        });
        btn.onmouseenter = () => btn.style.backgroundColor = darkenColor(bg, 10);
        btn.onmouseleave = () => btn.style.backgroundColor = bg;
        btn.onmousedown = () => btn.style.transform = 'translateY(1px)';
        btn.onmouseup = () => btn.style.transform = 'translateY(0)';

        // Special styling for the Done button in the list editor
        if (text === '✅ Done') {
            btn.style.position = 'sticky';
            btn.style.bottom = '0';
            btn.style.width = '100%';
            btn.style.marginTop = '10px';
            btn.style.zIndex = '10';
        }
        return btn;
    }

    // Helper to darken a color for hover effect
    function darkenColor(hex, percent) {
        let f = parseInt(hex.slice(1), 16), R = f >> 16, G = (f >> 8) & 0x00FF, B = f & 0x0000FF;
        return "#" + (0x1000000 + (Math.round((R - percent) * 255 / 100) << 16) + (Math.round((G - percent) * 255 / 100) << 8) + Math.round((B - percent) * 255 / 100)).toString(16).slice(1);
    }

    // Function to display messages in the UI
    function showMessage(msg, color = 'black') {
        msgDiv.textContent = msg;
        msgDiv.style.color = color;
        msgDiv.style.opacity = 1;
        clearTimeout(msgDiv._timeout);
        msgDiv._timeout = setTimeout(() => msgDiv.style.opacity = 0, 2500);
    }

    // Function to find a specific list by name and sprite scope
    function findListByName(name, sprite) {
        const targets = sprite ? vm.runtime.targets.filter(t => t.getName() === sprite) : vm.runtime.targets.filter(t => t.isStage);
        for (const target of targets) {
            for (const [id, v] of Object.entries(target.variables)) {
                if (v.name === name && v.type === 'list') {
                    return v;
                }
            }
        }
        return null;
    }

    // Populate the list editor with current list values
    function updateEditorList(list) {
        editorList.innerHTML = '';
        list.value.forEach((val, i) => {
            const row = document.createElement('div');
            Object.assign(row.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
            });
            const input = document.createElement('input');
            input.value = val;
            Object.assign(input.style, {
                flex: '1',
                padding: '6px',
                border: '1px solid #eee',
                borderRadius: '5px',
                backgroundColor: '#f9f9f9'
            });
            const del = document.createElement('button');
            del.textContent = '❌';
            Object.assign(del.style, {
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px'
            });
            del.onclick = () => row.remove();
            row.append(input, del);
            editorList.appendChild(row);
        });

        // Add a button to add new items to the list
        const addRowBtn = createButton('➕ Add Item', '#6c757d');
        Object.assign(addRowBtn.style, { marginTop: '10px', width: '100%' });
        addRowBtn.onclick = () => {
            const row = document.createElement('div');
            Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '5px' });
            const input = document.createElement('input');
            input.value = '';
            Object.assign(input.style, {
                flex: '1',
                padding: '6px',
                border: '1px solid #eee',
                borderRadius: '5px',
                backgroundColor: '#f9f9f9'
            });
            const del = document.createElement('button');
            del.textContent = '❌';
            Object.assign(del.style, {
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px'
            });
            del.onclick = () => row.remove();
            row.append(input, del);
            // Insert new item before the "Add Item" button
            editorList.insertBefore(row, addRowBtn);
        };
        editorList.appendChild(addRowBtn);
    }

    // Variable Section UI
    const { wrapper: nameWrap, input: nameInput } = createLabeledInputWithDropdown('Variable Name', () => getAllVariableNames(spriteInput.value.trim()));
    const valueInput = createInput('Value');
    const { wrapper: spriteWrap, input: spriteInput } = createLabeledInputWithDropdown('Sprite Name (optional)', getAllSpriteNames);
    const setBtn = createButton('✅ Set Variable', '#2ecc71');
    const viewBtn = createButton('👁 View Variable', '#3498db');
    const constBtn = createButton('⏯ Toggle Constant Variable', '#3498db');

    const hr = document.createElement('hr');
    Object.assign(hr.style, {
        border: '0',
        height: '1px',
        backgroundColor: '#ddd',
        margin: '15px 0' // Styled HR
    });

    // List Section UI
    const { wrapper: listWrap, input: listInput } = createLabeledInputWithDropdown('List Name', () => getAllListNames(listSpriteInput.value.trim()));
    const { wrapper: listSpriteWrap, input: listSpriteInput } = createLabeledInputWithDropdown('Sprite Name (optional)', getAllSpriteNames);
    const delBtn = createButton('🗑 Delete List', '#e74c3c');
    const editBtn = createButton('📝 Edit List', '#f39c12');

    // Message display area
    const msgDiv = document.createElement('div');
    Object.assign(msgDiv.style, {
        marginTop: '10px',
        fontSize: '13px',
        textAlign: 'center',
        height: '18px',
        color: '#333',
        transition: 'opacity 0.4s ease',
        opacity: 0
    });

    // List Editor UI (separate modal-like panel)
    const listEditor = document.createElement('div');
    Object.assign(listEditor.style, {
        position: 'fixed',
        bottom: '50px',
        right: '350px',
        width: '300px',
        backgroundColor: '#ffffff',
        border: '2px solid #aaa',
        borderRadius: '10px',
        padding: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        display: 'none',
        zIndex: 9999,
        maxHeight: '400px',
        overflowY: 'auto',
        flexDirection: 'column'
    });

    const editorTitle = document.createElement('div');
    editorTitle.textContent = 'List Editor';
    Object.assign(editorTitle.style, {
        fontWeight: 'bold',
        fontSize: '16px',
        marginBottom: '10px',
        textAlign: 'center'
    });
    const editorList = document.createElement('div'); // Container for list items in editor
    const doneBtn = createButton('✅ Done', '#27ae60');
    Object.assign(editorList.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        maxHeight: 'calc(100% - 70px)',
        overflowY: 'auto', // Allow scrolling within the list
        paddingRight: '5px' // Prevent scrollbar from overlapping content
    });

    listEditor.appendChild(editorTitle);
    listEditor.appendChild(editorList);
    listEditor.appendChild(doneBtn);

    content.append(nameWrap, valueInput, spriteWrap, setBtn, viewBtn, constBtn, hr, // Added constBtn
        listWrap, listSpriteWrap, delBtn, editBtn, msgDiv);
    ui.appendChild(content);
    document.body.append(ui);
    document.body.append(listEditor);

    // --- UI Interaction Logic ---

    let expanded = false;
    header.onclick = (e) => {
        // Prevent click from expanding/collapsing if a drag operation has just ended.
        // This is a simple heuristic; a more robust solution might use a small delay
        // or a flag set/cleared by the dragEnd function.
        if (isDragging) return;

        expanded = !expanded;
        content.style.display = expanded ? 'flex' : 'none';
        ui.style.maxHeight = expanded ? '600px' : '40px'; // Adjust max-height as needed
    };


    let constantIntervalId = null;
    let isConstantToggling = false;

    constBtn.onclick = () => {
        const name = nameInput.value.trim();
        const val = valueInput.value.trim();
        const sprite = spriteInput.value.trim();

        if (!name || val === '') { // Value can be 0 or false, so check for empty string
            showMessage('Fill in name and value for constant variable', 'orange');
            return;
        }

        if (isConstantToggling) {
            // Stop constant toggling
            clearInterval(constantIntervalId);
            constantIntervalId = null;
            isConstantToggling = false;
            constBtn.textContent = '⏯ Toggle Constant Variable';
            showMessage('⏹ Constant variable stopped', 'red');
        } else {
            // Start constant toggling
            const targets = sprite ? vm.runtime.targets.filter(t => t.getName() === sprite) : vm.runtime.targets.filter(t => t.isStage);

            let targetVariable = null;
            for (const target of targets) {
                for (const variable of Object.values(target.variables)) {
                    if (variable.name === name && variable.type === '') {
                        targetVariable = variable;
                        break;
                    }
                }
                if (targetVariable) break;
            }

            if (!targetVariable) {
                showMessage('❌ Variable not found in specified scope', 'red');
                return;
            }

            // Convert value once outside the interval to avoid repeated parsing
            const parsedVal = isNaN(parseFloat(val)) || !isFinite(val) ? val : parseFloat(val);

            constantIntervalId = setInterval(() => {
                // In the interval, ensure the VM and variable still exist
                if (vm && targetVariable) {
                    targetVariable.value = parsedVal;
                } else {
                    // If VM or target variable is gone, stop the interval
                    clearInterval(constantIntervalId);
                    constantIntervalId = null;
                    isConstantToggling = false;
                    constBtn.textContent = '⏯ Toggle Constant Variable';
                    showMessage('⚠ Variable or VM lost, constant update stopped.', 'orange');
                }
            }, 100); // Update every 100ms (10 times per second)

            isConstantToggling = true;
            constBtn.textContent = '⏹ Stop Constant Variable';
            showMessage('▶ Constant variable started', 'green');
        }
    };


    viewBtn.onclick = () => {
        const name = nameInput.value.trim();
        const sprite = spriteInput.value.trim();

        if (!name) {
            showMessage('Enter variable name to view', 'orange');
            return;
        }

        const targets = sprite ? vm.runtime.targets.filter(t => t.getName() === sprite) : vm.runtime.targets.filter(t => t.isStage);
        let found = false;
        for (const target of targets) {
            for (const variable of Object.values(target.variables)) {
                if (variable.name === name && variable.type === '') {
                    showMessage(`👁 ${name} = ${JSON.stringify(variable.value)}`, 'blue'); // Use JSON.stringify for complex values
                    found = true;
                    return;
                }
            }
        }
        if (!found) {
            showMessage('❌ Variable not found in specified scope', 'red');
        }
    };

    delBtn.onclick = () => {
        const listName = listInput.value.trim();
        const sprite = listSpriteInput.value.trim();

        if (!listName) {
            showMessage('Enter list name to delete', 'orange');
            return;
        }

        const targets = sprite ? vm.runtime.targets.filter(t => t.getName() === sprite) : vm.runtime.targets.filter(t => t.isStage);
        let deleted = false;
        for (const target of targets) {
            // Iterate over a copy of keys to safely delete from the original object
            for (const id in Object.assign({}, target.variables)) {
                const v = target.variables[id];
                if (v && v.name === listName && v.type === 'list') {
                    delete target.variables[id];
                    deleted = true;
                    // In a real scenario, you might also need to update the VM's monitor state
                    // This is complex and usually requires direct VM methods, which might not be exposed.
                }
            }
        }
        showMessage(deleted ? '✅ List deleted' : '❌ List not found', deleted ? 'green' : 'red');
    };

    let currentEditedList = null; // Store the actual list object being edited

    editBtn.onclick = () => {
        const listName = listInput.value.trim();
        const sprite = listSpriteInput.value.trim();

        if (!listName) {
            showMessage('Enter list name to edit', 'orange');
            return;
        }

        const list = findListByName(listName, sprite);
        if (!list) {
            showMessage('❌ List not found in specified scope', 'red');
            return;
        }

        currentEditedList = list; // Store the reference to the actual list object
        updateEditorList(list);
        // Store just the name and sprite, not the full JSON string of the list
        listEditor.dataset.listName = listName;
        listEditor.dataset.sprite = sprite;
        listEditor.style.display = 'flex';
    };

    doneBtn.onclick = () => {
        // Retrieve the list object from the stored reference
        if (!currentEditedList) {
            showMessage('❌ No list is currently being edited.', 'red');
            listEditor.style.display = 'none';
            return;
        }

        const newVals = [];
        // Collect values from all input fields in the editorList, skipping the "Add Item" button
        editorList.querySelectorAll('input').forEach(input => {
            newVals.push(input.value);
        });

        // Update the actual list object's value
        currentEditedList.value = newVals;
        listEditor.style.display = 'none';
        showMessage('✅ List updated', 'green');
        currentEditedList = null; // Clear the reference
    };

    // --- Draggable Functionality ---
    let isDragging = false;
    let offsetX = 0; // Offset of mouse from element's left edge
    let offsetY = 0; // Offset of mouse from element's top edge

    header.addEventListener('pointerdown', dragStart);

    function dragStart(e) {
        // Prevent default browser behavior (like text selection)
        e.preventDefault();
        // Stop event propagation to prevent it from interfering with header.onclick
        e.stopPropagation();

        // Only handle primary mouse button (left click)
        if (e.button !== 0) return;

        isDragging = true;
        header.style.cursor = 'grabbing';

        // Get the current computed style to determine if it's using 'right' or 'left'
        const computedStyle = window.getComputedStyle(ui);
        let currentLeft = parseFloat(computedStyle.left);
        let currentTop = parseFloat(computedStyle.top);
        let currentRight = parseFloat(computedStyle.right); // Check for existing 'right'

        // If the 'left' property isn't explicitly set (or is 'auto'), calculate it from 'right'
        // This ensures 'ui.style.left' is always a valid number before calculating offset
        if (isNaN(currentLeft) || computedStyle.left === 'auto') {
            // clientWidth includes padding but not scrollbar
            // ui.offsetWidth includes padding and border
            currentLeft = document.documentElement.clientWidth - ui.offsetWidth - currentRight;
            ui.style.left = currentLeft + 'px';
            ui.style.right = 'auto'; // Clear the 'right' property once 'left' is set
        }

        // Calculate the offset (mouse position relative to element's top-left corner)
        offsetX = e.clientX - currentLeft;
        offsetY = e.clientY - currentTop;

        // Add listeners to the document to ensure dragging continues even if
        // the pointer leaves the header area, and for reliable release
        document.addEventListener('pointermove', drag);
        document.addEventListener('pointerup', dragEnd);
    }

    function drag(e) {
        if (!isDragging) return;

        e.preventDefault(); // Prevent default during drag (e.g., text selection)

        // Calculate new position based on current mouse position and stored offset
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        // Apply new positions
        ui.style.left = newLeft + 'px';
        ui.style.top = newTop + 'px';
    }

    function dragEnd(e) {
        isDragging = false;
        header.style.cursor = 'grab';

        // Clean up event listeners
        document.removeEventListener('pointermove', drag);
        document.removeEventListener('pointerup', dragEnd);
    }

})();


(function() {
	'use strict';

	function injectCSS() {
		const style = document.createElement('style');
		style.type = 'text/css';
		style.textContent = `

            select {
                -webkit-appearance: none;
                -moz-appearance: none;
                appearance: none;
                background-image: none;
                border: none;
                padding-right: 25px;
                color: #333;
                font-family: 'Inter', 'Segoe UI', sans-serif;
            }

           .custom-select-wrapper {
                position: relative;
                display: flex;
                flex-grow: 1;
                border: 1px solid #ccc;
                border-radius: 8px;
                background-color: white;
                overflow: hidden;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }

           .custom-select-wrapper::after {
                content: '▼';
                font-size: 14px;
                color: #888;
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                pointer-events: none;
            }

           .custom-select-wrapper:focus-within {
                border-color: #0e86d0;
                box-shadow: 0 0 0 2px rgba(14, 134, 208, 0.2);
            }

            select option {
                padding: 5px 10px;
                color: #333;
                background-color: white;
            }

            select option[disabled][selected] {
                color: #888;
            }
        `;
		document.head.appendChild(style);
	}

	function findScratchVM() {
		const app = document.getElementById('app');
		if (!app || !app._reactRootContainer || !app._reactRootContainer._internalRoot) {
			console.warn('Broadcast Sender: React root not found.');
			return null;
		}

		let node = app._reactRootContainer._internalRoot.current;
		let attempts = 0;
		while (node && attempts < 100) {
			if (node.pendingProps && node.pendingProps.store && node.pendingProps.store.getState) {
				const vm = node.pendingProps.store.getState().scratchGui?.vm;
				if (vm) {
					console.log('Broadcast Sender: Scratch VM found!', vm);
					return vm;
				}
			}
			node = node.child;
			attempts++;
		}
		console.error('Broadcast Sender: Scratch VM not found after traversing React tree.');
		return null;
	}

	const vm = findScratchVM();

	if (!vm) {
		console.error('Broadcast Sender: Cannot proceed without the Scratch VM. The tool will not be loaded.');
		return;
	}

	injectCSS();

	const ui = document.createElement('div');
	Object.assign(ui.style, {
		position: 'fixed',
		top: '60px',
		right: '350px',
		width: '320px',
		backgroundColor: '#f8f8f8',
		border: '2px solid #bbb',
		borderRadius: '10px',
		boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
		fontFamily: 'Inter, Segoe UI, sans-serif',
		zIndex: 9998,
		overflow: 'hidden',
		transition: 'max-height 0.3s ease',
		maxHeight: '40px',

	});

	const header = document.createElement('div');
	header.textContent = '📣 Broadcast Sender';
	Object.assign(header.style, {
		backgroundColor: '#27ae60',
		color: 'white',
		padding: '10px',
		cursor: 'grab',
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

	const broadcastInputLabel = document.createElement('label');
	broadcastInputLabel.textContent = 'Broadcast Message:';
	broadcastInputLabel.style.fontSize = '13px';
	broadcastInputLabel.style.color = '#333';

	const broadcastInputContainer = document.createElement('div');
	Object.assign(broadcastInputContainer.style, {
		display: 'flex',
		alignItems: 'center',
		gap: '5px'
	});

	const customSelectWrapper = document.createElement('div');
	customSelectWrapper.classList.add('custom-select-wrapper');
	Object.assign(customSelectWrapper.style, {
		flexGrow: '1',
	});

	const broadcastSelect = document.createElement('select');
	Object.assign(broadcastSelect.style, {
		flexGrow: '1',
		padding: '8px',
		backgroundColor: 'transparent',
		borderRadius: '8px',
		fontSize: '14px',
		cursor: 'pointer',
		outline: 'none',
	});

	const defaultOption = document.createElement('option');
	defaultOption.value = '';
	defaultOption.textContent = 'Select a broadcast...';
	defaultOption.disabled = true;
	defaultOption.selected = true;
	broadcastSelect.appendChild(defaultOption);

	const sendBtn = document.createElement('button');
	sendBtn.textContent = 'Send Broadcast';
	Object.assign(sendBtn.style, {
		padding: '10px 14px',
		border: 'none',
		borderRadius: '8px',
		cursor: 'pointer',
		backgroundColor: '#3498db',
		color: 'white',
		fontWeight: 'bold',
		fontSize: '14px',
		transition: 'background-color 0.2s ease, transform 0.1s ease',
		boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
	});
	sendBtn.onmouseenter = () => sendBtn.style.filter = 'brightness(90%)';
	sendBtn.onmouseleave = () => sendBtn.style.filter = 'brightness(100%)';

	const msgDiv = document.createElement('div');
	Object.assign(msgDiv.style, {
		marginTop: '5px',
		fontSize: '13px',
		textAlign: 'center',
		height: '18px',
		color: '#333',
		transition: 'opacity 0.4s ease',
		opacity: 0
	});

	customSelectWrapper.append(broadcastSelect);
	broadcastInputContainer.append(customSelectWrapper);
	content.append(broadcastInputLabel, broadcastInputContainer, sendBtn, msgDiv);

	const customBlockRunnerDiv = document.createElement('div');
	Object.assign(customBlockRunnerDiv.style, {
		marginTop: '15px',
		backgroundColor: '#f0f0f0',
		border: '1px solid #ccc',
		borderRadius: '8px',
		boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
		overflow: 'hidden',
		maxHeight: '40px',
		transition: 'max-height 0.3s ease',
	});

	const customBlockRunnerHeader = document.createElement('div');
	customBlockRunnerHeader.textContent = '⚙️ CUSTOM BLOCK RUNNER';
	Object.assign(customBlockRunnerHeader.style, {
		backgroundColor: '#e67e22',
		color: 'white',
		padding: '10px',
		cursor: 'grab',
		fontWeight: 'bold',
		borderTopLeftRadius: '7px',
		borderTopRightRadius: '7px',
		userSelect: 'none',
		textAlign: 'center',
	});
	customBlockRunnerDiv.appendChild(customBlockRunnerHeader);

	const customBlockRunnerContent = document.createElement('div');
	Object.assign(customBlockRunnerContent.style, {
		padding: '12px',
		display: 'none',
		flexDirection: 'column',
		gap: '12px',
	});

	const spriteSelectLabel = document.createElement('label');
	spriteSelectLabel.textContent = 'Select a sprite:';
	Object.assign(spriteSelectLabel.style, {
		fontSize: '13px',
		color: '#333'
	});

	const spriteSelectWrapper = document.createElement('div');
	spriteSelectWrapper.classList.add('custom-select-wrapper');
	const spriteSelect = document.createElement('select');
	Object.assign(spriteSelect.style, {
		flexGrow: '1',
		padding: '8px',
		backgroundColor: 'transparent',
		borderRadius: '8px',
		fontSize: '14px',
		cursor: 'pointer',
		outline: 'none',
	});
	const defaultSpriteOption = document.createElement('option');
	defaultSpriteOption.value = '';
	defaultSpriteOption.textContent = 'Select a sprite...';
	defaultSpriteOption.disabled = true;
	defaultSpriteOption.selected = true;
	spriteSelect.appendChild(defaultSpriteOption);
	spriteSelectWrapper.append(spriteSelect);

	const customBlockSelectLabel = document.createElement('label');
	customBlockSelectLabel.textContent = 'Select a custom block:';
	Object.assign(customBlockSelectLabel.style, {
		fontSize: '13px',
		color: '#333'
	});

	const customBlockSelectWrapper = document.createElement('div');
	customBlockSelectWrapper.classList.add('custom-select-wrapper');
	const customBlockSelect = document.createElement('select');
	Object.assign(customBlockSelect.style, {
		flexGrow: '1',
		padding: '8px',
		backgroundColor: 'transparent',
		borderRadius: '8px',
		fontSize: '14px',
		cursor: 'pointer',
		outline: 'none',
	});
	const defaultCustomBlockOption = document.createElement('option');
	defaultCustomBlockOption.value = '';
	defaultCustomBlockOption.textContent = 'Select a custom block...';
	defaultCustomBlockOption.disabled = true;
	defaultCustomBlockOption.selected = true;
	customBlockSelect.appendChild(defaultCustomBlockOption);
	customBlockSelectWrapper.append(customBlockSelect);

	const customBlockDataSectionLabel = document.createElement('label');
	customBlockDataSectionLabel.textContent = '## CUSTOM BLOCK DATA SECTION ##';
	Object.assign(customBlockDataSectionLabel.style, {
		fontSize: '13px',
		color: '#333',
		fontWeight: 'bold',
		marginTop: '10px'
	});
	const customBlockDataSection = document.createElement('div');
	Object.assign(customBlockDataSection.style, {
		display: 'flex',
		flexDirection: 'column',
		gap: '8px',
		padding: '8px',
		border: '1px dashed #ddd',
		borderRadius: '5px',
		backgroundColor: '#fdfdfd'
	});

	const runCustomBlockBtn = document.createElement('button');
	runCustomBlockBtn.textContent = 'Run Custom Block';
	Object.assign(runCustomBlockBtn.style, {
		padding: '10px 14px',
		border: 'none',
		borderRadius: '8px',
		cursor: 'pointer',
		backgroundColor: '#e67e22',
		color: 'white',
		fontWeight: 'bold',
		fontSize: '14px',
		transition: 'background-color 0.2s ease, transform 0.1s ease',
		boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
	});
	runCustomBlockBtn.onmouseenter = () => runCustomBlockBtn.style.filter = 'brightness(90%)';
	runCustomBlockBtn.onmouseleave = () => runCustomBlockBtn.style.filter = 'brightness(100%)';

	const customBlockMsgDiv = document.createElement('div');
	Object.assign(customBlockMsgDiv.style, {
		marginTop: '5px',
		fontSize: '13px',
		textAlign: 'center',
		height: '18px',
		color: '#333',
		transition: 'opacity 0.4s ease',
		opacity: 0
	});

	customBlockRunnerContent.append(
		spriteSelectLabel, spriteSelectWrapper,
		customBlockSelectLabel, customBlockSelectWrapper,
		customBlockDataSectionLabel, customBlockDataSection,
		runCustomBlockBtn, customBlockMsgDiv
	);
	customBlockRunnerDiv.appendChild(customBlockRunnerContent);

	content.append(customBlockRunnerDiv);
	ui.appendChild(content);
	document.body.append(ui);

	function showMessage(msg, color = 'black') {
		msgDiv.textContent = msg;
		msgDiv.style.color = color;
		msgDiv.style.opacity = 1;
		clearTimeout(msgDiv._timeout);
		msgDiv._timeout = setTimeout(() => msgDiv.style.opacity = 0, 3500);
	}

	function populateBroadcasts() {
		const currentSelectedValue = broadcastSelect.value;

		while (broadcastSelect.options.length > 1) {
			broadcastSelect.remove(1);
		}

		const uniqueBroadcasts = new Set();
		let broadcasts = [];
		if (vm.runtime.getAllBroadcasts) {
			broadcasts = vm.runtime.getAllBroadcasts();
			broadcasts.forEach(broadcast => uniqueBroadcasts.add(broadcast.name));
		}

		vm.runtime.targets.forEach(target => {
			if (target.blocks) {
				for (const blockId in target.blocks._blocks) {
					const block = target.blocks._blocks[blockId];
					if (!block) continue;

					if (block.opcode === 'event_whenbroadcastreceived' && block.fields?.BROADCAST_OPTION) {
						uniqueBroadcasts.add(block.fields.BROADCAST_OPTION.value);
					} else if ((block.opcode === 'event_broadcast' ||
							block.opcode === 'event_broadcastandwait') && block.inputs?.BROADCAST_OPTION) {
						const input = block.inputs.BROADCAST_OPTION;
						if (input && input.block && target.blocks._blocks[input.block]) {
							const broadcastBlock = target.blocks._blocks[input.block];
							if (broadcastBlock) {
								const value = broadcastBlock.fields?.BROADCAST_OPTION ?
									broadcastBlock.fields.BROADCAST_OPTION.value :
									broadcastBlock.fields?.TEXT?.value;
								if (value) uniqueBroadcasts.add(value);
							}
						}
					}
				}
			}
		});

		if (uniqueBroadcasts.size > 0) {
			Array.from(uniqueBroadcasts).sort().forEach(msg => {
				const option = document.createElement('option');
				option.value = msg;
				option.textContent = msg;
				broadcastSelect.appendChild(option);
			});
			if (currentSelectedValue && uniqueBroadcasts.has(currentSelectedValue)) {
				broadcastSelect.value = currentSelectedValue;
			} else {
				broadcastSelect.value = '';
			}
		} else {
			const emptyOption = document.createElement('option');
			emptyOption.value = '';
			emptyOption.textContent = 'No broadcasts found';
			emptyOption.disabled = true;
			broadcastSelect.appendChild(emptyOption);
			broadcastSelect.value = '';
		}
	}

	header.onclick = () => {
		const isExpanded = content.style.display === 'flex';
		content.style.display = isExpanded ? 'none' : 'flex';

		ui.style.maxHeight = isExpanded ? '40px' : '700px';

		if (!isExpanded) {
			populateBroadcasts();
		}
	};

	sendBtn.onclick = () => {
		const message = broadcastSelect.value;

		if (!message) {
			showMessage('Please select a broadcast message.', 'orange');
			return;
		}

		try {
			vm.runtime.startHats('event_whenbroadcastreceived', null, null, message);
			showMessage(`✅ Broadcast '${message}' sent!`, 'green');
			console.log(`Broadcast Sender: Sent broadcast '${message}'.`);
		} catch (e) {
			showMessage(`❌ Error sending broadcast: ${e.message}`, 'red');
			console.error('Broadcast Sender - Error sending broadcast:', e);
		}
	};

	broadcastSelect.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			sendBtn.click();
		}
	});

	let autoUpdateInterval;

	header.addEventListener('click', () => {
		const isExpanded = content.style.display === 'flex';
		if (!isExpanded) {
			if (autoUpdateInterval) clearInterval(autoUpdateInterval);
			autoUpdateInterval = setInterval(populateBroadcasts, 100);
			console.log("Broadcast Sender: Auto-update started (100ms interval).");
		} else {
			if (autoUpdateInterval) {
				clearInterval(autoUpdateInterval);
				autoUpdateInterval = null;
				console.log("Broadcast Sender: Auto-update stopped.");
			}
		}
	});

	let selectedTarget = null;
	let selectedCustomBlockDefinition = null;

	function showCustomBlockMessage(msg, color = 'black') {
		customBlockMsgDiv.textContent = msg;
		customBlockMsgDiv.style.color = color;
		customBlockMsgDiv.style.opacity = 1;
		clearTimeout(customBlockMsgDiv._timeout);
		customBlockMsgDiv._timeout = setTimeout(() => customBlockMsgDiv.style.opacity = 0, 3500);
	}

	function populateSprites() {
		const currentSelectedSpriteId = spriteSelect.value;
		while (spriteSelect.options.length > 1) {
			spriteSelect.remove(1);
		}

		const targets = vm.runtime.targets;
		if (targets.length === 0) {
			const emptyOption = document.createElement('option');
			emptyOption.value = '';
			emptyOption.textContent = 'No sprites found';
			emptyOption.disabled = true;
			spriteSelect.appendChild(emptyOption);
			spriteSelect.value = '';
			return;
		}

		targets.forEach(target => {
			if (target && target.sprite) {
				const option = document.createElement('option');
				option.value = target.id;

				option.textContent = target.isStage ? 'Stage' : target.sprite.name;
				spriteSelect.appendChild(option);
			}
		});

		if (currentSelectedSpriteId && targets.some(t => t.id === currentSelectedSpriteId)) {
			spriteSelect.value = currentSelectedSpriteId;

			populateCustomBlocks(currentSelectedSpriteId);
		} else {
			spriteSelect.value = '';
			clearCustomBlockDropdown();
			clearCustomBlockInputs();
		}
	}

	function clearCustomBlockDropdown() {
		while (customBlockSelect.options.length > 1) {
			customBlockSelect.remove(1);
		}
		const emptyOption = document.createElement('option');
		emptyOption.value = '';
		emptyOption.textContent = 'Select a custom block...';
		emptyOption.disabled = true;
		emptyOption.selected = true;
		customBlockSelect.appendChild(emptyOption);
		customBlockSelect.value = '';
		selectedCustomBlockDefinition = null;
	}

	function clearCustomBlockInputs() {
		customBlockDataSection.innerHTML = '';
	}

	const customBlockDefinitions = new Map();

	function populateCustomBlocks(targetId) {
		clearCustomBlockDropdown();
		clearCustomBlockInputs();
		customBlockDefinitions.clear();

		selectedTarget = vm.runtime.targets.find(t => t.id === targetId);
		if (!selectedTarget || !selectedTarget.blocks) {
			showCustomBlockMessage('Selected sprite has no blocks.', 'orange');
			return;
		}

		let foundCustomBlocks = false;
		for (const blockId in selectedTarget.blocks._blocks) {
			const block = selectedTarget.blocks._blocks[blockId];

			if (block && block.opcode === 'procedures_prototype' && block.mutation) {
				const proccode = block.mutation.proccode;
				if (proccode) {
					const option = document.createElement('option');
					option.value = proccode;
					option.textContent = proccode;
					customBlockSelect.appendChild(option);
					foundCustomBlocks = true;

					customBlockDefinitions.set(proccode, {
						id: block.id,
						proccode: proccode,
						argumentids: block.mutation.argumentids || [],
						argumentnames: block.mutation.argumentnames || [],
						argumentdefaults: block.mutation.argumentdefaults || [],
						warp: block.mutation.warp === 'true'
					});
				}
			}
		}

		if (!foundCustomBlocks) {
			const emptyOption = document.createElement('option');
			emptyOption.value = '';
			emptyOption.textContent = 'No custom blocks found for this sprite';
			emptyOption.disabled = true;
			customBlockSelect.appendChild(emptyOption);
			customBlockSelect.value = '';
		} else {
			customBlockSelect.value = '';
		}
	}

	function generateCustomBlockInputs(proccode) {
		clearCustomBlockInputs();
		selectedCustomBlockDefinition = customBlockDefinitions.get(proccode);

		if (!selectedCustomBlockDefinition) {
			showCustomBlockMessage('Custom block definition not found.', 'red');
			return;
		}

		const {
			proccode: blockProccode,
			argumentnames,
			argumentdefaults
		} = selectedCustomBlockDefinition;

		const parts = blockProccode.split(/(%s|%b)/);
		let argIndex = 0;

		parts.forEach(part => {
			if (part === '%s' |
				part === '%s' || part === '%b') {
				const argName = argumentnames[argIndex] || `val${argIndex + 1}`;
				const argDefault = argumentdefaults[argIndex] || '';

				const inputContainer = document.createElement('div');
				Object.assign(inputContainer.style, {
					display: 'flex',
					alignItems: 'center',
					gap: '5px'
				});

				const label = document.createElement('span');
				label.textContent = `${argName}:`;
				Object.assign(label.style, {
					fontSize: '13px',
					color: '#555'
				});

				let inputElement;
				if (part === '%b') {
					inputElement = document.createElement('input');
					inputElement.type = 'checkbox';
					inputElement.checked = argDefault === 'true';
					Object.assign(inputElement.style, {
						width: '20px',
						height: '20px'
					});
				} else {
					inputElement = document.createElement('input');
					inputElement.type = 'text';
					inputElement.value = argDefault;
					Object.assign(inputElement.style, {
						flexGrow: '1',
						padding: '6px',
						border: '1px solid #ddd',
						borderRadius: '4px',
						fontSize: '13px',
						outline: 'none'
					});
					inputElement.onfocus = (e) => e.target.style.borderColor = '#0e86d0';
					inputElement.onblur = (e) => e.target.style.borderColor = '#ddd';
				}
				inputElement.dataset.argName = argName;
				inputElement.dataset.argType = part;

				inputContainer.append(label, inputElement);
				customBlockDataSection.appendChild(inputContainer);
				argIndex++;
			} else if (part.trim() !== '') {

				const textSpan = document.createElement('span');
				textSpan.textContent = part.trim();
				Object.assign(textSpan.style, {
					fontSize: '13px',
					color: '#555'
				});
				customBlockDataSection.appendChild(textSpan);
			}
		});

		if (argIndex === 0) {
			const noInputsText = document.createElement('span');
			noInputsText.textContent = 'This custom block has no inputs.';
			Object.assign(noInputsText.style, {
				fontSize: '13px',
				color: '#888',
				textAlign: 'center'
			});
			customBlockDataSection.appendChild(noInputsText);
		}
	}

	runCustomBlockBtn.onclick = () => {
		if (!selectedTarget) {
			showCustomBlockMessage('Please select a sprite first.', 'orange');
			console.debug('Custom Block Runner: No sprite selected');
			return;
		}
		if (!selectedCustomBlockDefinition) {
			showCustomBlockMessage('Please select a custom block first.', 'orange');
			console.debug('Custom Block Runner: No custom block selected');
			return;
		}

		console.debug('Custom Block Runner: Selected sprite:', selectedTarget.sprite.name);
		console.debug('Custom Block Runner: Selected block:', selectedCustomBlockDefinition);

		const args = [];
		customBlockDataSection.querySelectorAll('input').forEach(input => {
			const argType = input.dataset.argType;
			const argName = input.dataset.argName; // <-- Make sure this line exists!
			let value;

			if (argType === '%b') {
				value = input.checked;
			} else {
				value = input.value;
			}
			args.push(value);
			console.debug(`Custom Block Runner: Argument "${argName}" = "${value}"`);
		});

		// Find the actual procedure definition block
		let definitionBlock = null;
		for (const blockId in selectedTarget.blocks._blocks) {
			const block = selectedTarget.blocks._blocks[blockId];
			if (block && block.opcode === 'procedures_definition') {
				const prototypeId = block.inputs.custom_block?.block;
				if (prototypeId === selectedCustomBlockDefinition.id) {
					definitionBlock = block;
					break;
				}
			}
		}

		if (!definitionBlock) {
			showCustomBlockMessage('❌ Could not find custom block implementation.', 'red');
			return;
		}

		try {
			// Verify the block exists in the target
			const blockId = selectedCustomBlockDefinition.id;
			if (!selectedTarget.blocks._blocks[blockId]) {
				throw new Error('Custom block definition not found in sprite');
			}

			console.debug('Custom Block Runner: Starting execution with:', {
				blockId,
				targetName: selectedTarget.sprite.name,
				arguments: args
			});

			// Create a unique block ID
			const callBlockId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			// Build the inputs object
			const inputs = {};
			// Find the actual procedure definition block
			let definitionBlock2 = null;
			for (const blockId in selectedTarget.blocks._blocks) {
				const block = selectedTarget.blocks._blocks[blockId];
				if (block && block.opcode === 'procedures_definition') {
					const prototypeId = block.inputs.custom_block?.block;
					if (prototypeId === selectedCustomBlockDefinition.id) {
						definitionBlock2 = block;
						break;
					}
				}
			}

			if (!definitionBlock2) {
				showCustomBlockMessage('❌ Could not find custom block implementation.', 'red');
				return;
			}

			// --- FIXES & VALIDATION for Scratch/Blockly compatibility ---
        // Parse argumentids, argumentnames, argumentdefaults as arrays
        let argumentIds = selectedCustomBlockDefinition.argumentids;
        let argumentNames = selectedCustomBlockDefinition.argumentnames;
        let argumentDefaults = selectedCustomBlockDefinition.argumentdefaults;
        if (typeof argumentIds === "string") argumentIds = JSON.parse(argumentIds);
        if (typeof argumentNames === "string") argumentNames = JSON.parse(argumentNames);
        if (typeof argumentDefaults === "string") argumentDefaults = JSON.parse(argumentDefaults);
        if (!Array.isArray(argumentIds)) argumentIds = [];
        if (!Array.isArray(argumentNames)) argumentNames = [];
        if (!Array.isArray(argumentDefaults)) argumentDefaults = [];

        // Collect values in the same order as argumentNames, fallback to defaults
        const argValues = [];
        argumentNames.forEach((argName, i) => {
            const input = customBlockDataSection.querySelector(`input[data-arg-name="${argName}"]`);
            let value;
            if (input) {
                value = input.dataset.argType === '%b' ? input.checked : input.value;
            } else {
                value = argumentDefaults[i] !== undefined ? argumentDefaults[i] : "";
            }
            argValues.push(value);
            console.debug(`Custom Block Runner: Argument (ordered) "${argName}" = "${value}"`);
        });

        // Build inputs object by index, ensure all IDs are present
        for (let key in inputs) { delete inputs[key]; }
        argumentIds.forEach((argId, i) => {
            // If value is undefined, fallback to default
            let value = argValues[i];
            if (value === undefined) value = argumentDefaults[i] !== undefined ? argumentDefaults[i] : "";
            // For booleans, ensure value is boolean
            if (typeof value === 'string' && value !== '' && argumentDefaults[i] === 'true') value = (value === 'true' || value === true);
            inputs[argId] = [1, value];
        });

        // --- END FIXES ---

			selectedTarget.blocks._blocks[callBlockId] = {
				id: callBlockId,
				opcode: 'procedures_call',
				inputs: inputs, // <-- Use the constructed inputs object
				fields: {},
				next: null,
				parent: null,
				shadow: false,
				x: 0,
				y: 0,
				mutation: {
					tagName: 'mutation',
					children: [],
					proccode: selectedCustomBlockDefinition.proccode,
					argumentids: JSON.stringify(argumentIds),
					argumentnames: JSON.stringify(argumentNames),
					argumentdefaults: JSON.stringify(argumentDefaults),
					warp: selectedCustomBlockDefinition.warp
				}
			};

			// Execute the procedure call
			vm.runtime._pushThread(callBlockId, selectedTarget);

			console.debug('Custom Block Runner: Execution started successfully');

			showCustomBlockMessage(`✅ Custom block '${selectedCustomBlockDefinition.proccode}' run on '${selectedTarget.sprite.name}'!`, 'green');
		} catch (e) {
			const errorMessage = `Error: ${e.message}`;
			showCustomBlockMessage(`❌ ${errorMessage}`, 'red');
			console.error('Custom Block Runner - Detailed error:', {
				error: e,
				sprite: selectedTarget?.sprite?.name,
				blockDefinition: selectedCustomBlockDefinition,
				arguments: args
			});
		}
	};

	customBlockRunnerHeader.onclick = () => {
		const isExpanded = customBlockRunnerContent.style.display === 'flex';
		customBlockRunnerContent.style.display = isExpanded ? 'none' : 'flex';
		customBlockRunnerDiv.style.maxHeight = isExpanded ? '40px' : '500px';

		if (!isExpanded) {
			populateSprites();
		}
	};

	spriteSelect.onchange = (e) => {
		const targetId = e.target.value;
		populateCustomBlocks(targetId);
	};

	customBlockSelect.onchange = (e) => {
		const proccode = e.target.value;
		generateCustomBlockInputs(proccode);
	};

	let isDragging = false;
	let offsetX = 0;
	let offsetY = 0;

	header.addEventListener('pointerdown', dragStart);
	customBlockRunnerHeader.addEventListener('pointerdown', dragStart);

	function dragStart(e) {

		e.preventDefault();

		if (e.button !== 0) return;

		isDragging = true;

		if (e.target === header) {
			header.style.cursor = 'grabbing';
		} else if (e.target === customBlockRunnerHeader) {
			customBlockRunnerHeader.style.cursor = 'grabbing';
		}

		const computedStyle = window.getComputedStyle(ui);
		let currentLeft = parseFloat(computedStyle.left);
		let currentTop = parseFloat(computedStyle.top);
		let currentRight = parseFloat(computedStyle.right);

		if (isNaN(currentLeft) || computedStyle.left === 'auto') {
			currentLeft = document.documentElement.clientWidth - ui.offsetWidth - currentRight;
			ui.style.left = currentLeft + 'px';
			ui.style.right = 'auto';
		}

		offsetX = e.clientX - currentLeft;
		offsetY = e.clientY - currentTop;

		document.addEventListener('pointermove', drag);
		document.addEventListener('pointerup', dragEnd);
	}

	function drag(e) {
		if (!isDragging) return;

		e.preventDefault();

		let newLeft = e.clientX - offsetX;
		let newTop = e.clientY - offsetY;

		ui.style.left = newLeft + 'px';
		ui.style.top = newTop + 'px';
	}

	function dragEnd(e) {
		isDragging = false;
		header.style.cursor = 'grab';
		customBlockRunnerHeader.style.cursor = 'grab';

		document.removeEventListener('pointermove', drag);
		document.removeEventListener('pointerup', dragEnd);
	}

})();
