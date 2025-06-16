// ==UserScript==
// @name        Scratch Variable & List Tool (Editor UI)
// @namespace   http://tampermonkey.net/
// @version     8.1 (Fixed)
// @description View/edit Scratch variables/lists with sprite-scope and full UI
// @match       https://scratch.mit.edu/projects/*
// @grant       none
// @run-at      document-end
// ==/UserScript==

(function () {
    'use strict';

    // Function to find the Scratch VM instance.
    // This relies on internal React structures, which can be brittle with Scratch updates.
    function findScratchVM() {
        const app = document.getElementById('app');
        // Attempt to find the React root and traverse its children to find the VM store.
        let node = app?._reactRootContainer?._internalRoot?.current;
        while (node) {
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
        position: 'fixed', top: '10px', right: '10px', width: '320px',
        backgroundColor: '#f8f8f8', border: '2px solid #bbb', borderRadius: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontFamily: 'Inter, Segoe UI, sans-serif', // Added Inter font
        zIndex: 9999, overflow: 'hidden', transition: 'max-height 0.3s ease',
        maxHeight: '40px', // Collapsed state
        // Added some basic Tailwind-like spacing for better appearance
        padding: '0', // No padding on the main container itself, content handles it
    });

    const header = document.createElement('div');
    header.textContent = '⚙ Scratch Variable & List Injector';
    Object.assign(header.style, {
        backgroundColor: '#4a90e2', color: 'white', padding: '10px',
        cursor: 'pointer', fontWeight: 'bold', borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px', userSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center' // Centering header text
    });
    ui.appendChild(header);

    const content = document.createElement('div');
    Object.assign(content.style, {
        padding: '10px', display: 'none', flexDirection: 'column', gap: '10px', // Increased gap
        position: 'relative'
    });

    // Helper to create a labeled input with a dropdown for suggestions
    function createLabeledInputWithDropdown(labelText, getOptionsFunc) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';

        const input = document.createElement('input');
        input.placeholder = labelText;
        Object.assign(input.style, {
            padding: '8px', border: '1px solid #ccc', borderRadius: '8px', // Larger padding and more rounded
            width: '100%', boxSizing: 'border-box',
            fontSize: '14px' // Slightly larger font
        });

        const dropdownBtn = document.createElement('button');
        dropdownBtn.textContent = '▼';
        Object.assign(dropdownBtn.style, {
            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', // Centered vertically
            background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 'bold',
            fontSize: '14px', color: '#666' // Subtle color
        });

        const dropdown = document.createElement('div');
        Object.assign(dropdown.style, {
            position: 'absolute', top: '42px', left: '0', width: '100%',
            backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', // More rounded
            zIndex: '10000', maxHeight: '180px', overflowY: 'auto', display: 'none',
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
                            padding: '8px 12px', cursor: 'pointer',
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

    // Variable Section UI
    const { wrapper: nameWrap, input: nameInput } = createLabeledInputWithDropdown('Variable Name', () => getAllVariableNames(spriteInput.value.trim()));
    const valueInput = createInput('Value');
    const { wrapper: spriteWrap, input: spriteInput } = createLabeledInputWithDropdown('Sprite Name (optional)', getAllSpriteNames);
    const setBtn = createButton('✅ Set Variable', '#2ecc71');
    const viewBtn = createButton('👁 View Variable', '#3498db');
    const constBtn = createButton('⏯ Toggle Constant Variable', '#3498db');

    const hr = document.createElement('hr');
    Object.assign(hr.style, {
        border: '0', height: '1px', backgroundColor: '#ddd', margin: '15px 0' // Styled HR
    });

    // List Section UI
    const { wrapper: listWrap, input: listInput } = createLabeledInputWithDropdown('List Name', () => getAllListNames(listSpriteInput.value.trim()));
    const { wrapper: listSpriteWrap, input: listSpriteInput } = createLabeledInputWithDropdown('Sprite Name (optional)', getAllSpriteNames);
    const delBtn = createButton('🗑 Delete List', '#e74c3c');
    const editBtn = createButton('📝 Edit List', '#f39c12');

    // Message display area
    const msgDiv = document.createElement('div');
    Object.assign(msgDiv.style, {
        marginTop: '10px', fontSize: '13px', textAlign: 'center', height: '18px',
        color: '#333', transition: 'opacity 0.4s ease', opacity: 0
    });

    // List Editor UI (separate modal-like panel)
    const listEditor = document.createElement('div');
    Object.assign(listEditor.style, {
        position: 'fixed', top: '10px', right: '340px', width: '260px',
        backgroundColor: '#ffffff', border: '2px solid #aaa', borderRadius: '10px',
        padding: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'none',
        zIndex: 9999, maxHeight: '400px', overflowY: 'auto', flexDirection: 'column'
    });

    const editorTitle = document.createElement('div');
    editorTitle.textContent = 'List Editor';
    Object.assign(editorTitle.style, {
        fontWeight: 'bold', fontSize: '16px', marginBottom: '10px', textAlign: 'center'
    });
    const editorList = document.createElement('div'); // Container for list items in editor
    const doneBtn = createButton('✅ Done', '#27ae60');
    Object.assign(editorList.style, {
        display: 'flex', flexDirection: 'column', gap: '5px',
        maxHeight: 'calc(100% - 70px)', overflowY: 'auto', // Allow scrolling within the list
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
    header.onclick = () => {
        expanded = !expanded;
        content.style.display = expanded ? 'flex' : 'none';
        ui.style.maxHeight = expanded ? '600px' : '40px'; // Adjust max-height as needed
    };

    // Helper to create a generic input field
    function createInput(placeholder) {
        const el = document.createElement('input');
        el.placeholder = placeholder;
        Object.assign(el.style, {
            padding: '8px', border: '1px solid #ccc', borderRadius: '8px',
            width: '100%', boxSizing: 'border-box',
            fontSize: '14px'
        });
        return el;
    }

    // Helper to create a styled button
    function createButton(text, bg) {
        const btn = document.createElement('button');
        btn.textContent = text;
        Object.assign(btn.style, {
            padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer',
            backgroundColor: bg, color: 'white', fontWeight: 'bold', fontSize: '14px',
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
                display: 'flex', alignItems: 'center', gap: '5px'
            });
            const input = document.createElement('input');
            input.value = val;
            Object.assign(input.style, {
                flex: '1', padding: '6px', border: '1px solid #eee', borderRadius: '5px',
                backgroundColor: '#f9f9f9'
            });
            const del = document.createElement('button');
            del.textContent = '❌';
            Object.assign(del.style, {
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px'
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
                flex: '1', padding: '6px', border: '1px solid #eee', borderRadius: '5px',
                backgroundColor: '#f9f9f9'
            });
            const del = document.createElement('button');
            del.textContent = '❌';
            Object.assign(del.style, {
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px'
            });
            del.onclick = () => row.remove();
            row.append(input, del);
            // Insert new item before the "Add Item" button
            editorList.insertBefore(row, addRowBtn);
        };
        editorList.appendChild(addRowBtn);
    }

    // --- Event Listeners ---

    setBtn.onclick = () => {
        const name = nameInput.value.trim();
        const val = valueInput.value.trim();
        const sprite = spriteInput.value.trim();

        if (!name || val === '') { // Value can be 0 or false, so check for empty string
            showMessage('Fill in variable name and value', 'orange');
            return;
        }

        const targets = sprite ? vm.runtime.targets.filter(t => t.getName() === sprite) : vm.runtime.targets.filter(t => t.isStage);
        let found = false;
        for (const target of targets) {
            for (const variable of Object.values(target.variables)) {
                if (variable.name === name && variable.type === '') {
                    // Convert value to number if it's a valid number string, otherwise keep as string
                    variable.value = isNaN(parseFloat(val)) || !isFinite(val) ? val : parseFloat(val);
                    showMessage('✅ Variable set', 'green');
                    found = true;
                    return;
                }
            }
        }
        if (!found) {
            showMessage('❌ Variable not found in specified scope', 'red');
        }
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
})();
